#!/usr/bin/env node
/**
 * End-to-end integration tests for the Godot MCP Extended server.
 *
 * Spawns the compiled server (build/index.js) over stdio, points it at a fresh
 * throwaway Godot project, and exercises a representative slice of the toolset:
 * scene construction, inspection, batched edits, validation, animation, and the
 * diagnostic tools. Each tool runs a real headless Godot process, so this is a
 * true behavioral test of both the TypeScript layer and the GDScript ops.
 *
 * Requires a Godot 4.x binary. Resolution order:
 *   1. GODOT_PATH env var
 *   2. `godot` on PATH (the server auto-detects)
 *
 * Usage:  node test/integration.test.mjs
 * Exit code 0 = all passed, 1 = a failure.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', 'build', 'index.js');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// Pull the structured JSON payload out of a tool response (the server appends a
// pretty-printed JSON block after a human summary line).
function payload(res) {
  const text = (res.content || []).map((c) => c.text || '').join('\n');
  const brace = text.indexOf('{');
  if (brace === -1) return { __text: text };
  try {
    return JSON.parse(text.slice(brace));
  } catch {
    return { __text: text };
  }
}

async function main() {
  const projectPath = mkdtempSync(join(tmpdir(), 'gmcp-it-'));
  writeFileSync(
    join(projectPath, 'project.godot'),
    'config_version=5\n\n[application]\n\nconfig/name="gmcp-it"\nconfig/features=PackedStringArray("4.4")\n'
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'gmcp-test', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  const call = (name, args) => client.callTool({ name, arguments: { projectPath, ...args } });

  try {
    // --- Tool registry ---
    const tools = (await client.listTools()).tools.map((t) => t.name);
    for (const expected of ['batch', 'build_scene', 'find_nodes', 'list_classes', 'path_to_uid',
      'find_broken_references', 'create_animation', 'set_node_properties', 'reorder_node', 'export_project']) {
      check(`tool registered: ${expected}`, tools.includes(expected));
    }

    // --- build_scene (single-boot tree construction) ---
    let r = await call('build_scene', {
      scenePath: 'scenes/main.tscn',
      root: {
        type: 'Node2D', name: 'Main',
        children: [
          { type: 'Sprite2D', name: 'Hero', properties: { position: [100, 50] }, groups: ['heroes'] },
          { type: 'AnimationPlayer', name: 'Anim' },
        ],
      },
    });
    check('build_scene returns node_count 3', payload(r).node_count === 3, JSON.stringify(payload(r)));

    // --- get_scene_tree ---
    r = await call('get_scene_tree', { scenePath: 'scenes/main.tscn' });
    check('get_scene_tree root is Main/Node2D', payload(r).tree?.name === 'Main' && payload(r).tree?.type === 'Node2D');

    // --- get_node_properties: Vector2 coercion survived ---
    r = await call('get_node_properties', { scenePath: 'scenes/main.tscn', nodePath: 'Hero' });
    check('Hero position coerced to Vector2(100,50)',
      payload(r).properties?.position?.x === 100 && payload(r).properties?.position?.y === 50,
      JSON.stringify(payload(r).properties?.position));

    // --- find_nodes: inheritance-aware ---
    r = await call('find_nodes', { scenePath: 'scenes/main.tscn', type: 'Node2D' });
    check('find_nodes Node2D matches Main + Hero (Sprite2D)', payload(r).count === 2);
    r = await call('find_nodes', { scenePath: 'scenes/main.tscn', group: 'heroes' });
    check('find_nodes group=heroes matches 1', payload(r).count === 1);

    // --- batch: camelCase params reach GDScript correctly ---
    r = await call('batch', {
      operations: [
        { operation: 'rename_node', params: { scenePath: 'scenes/main.tscn', nodePath: 'Hero', newName: 'Player' } },
        { operation: 'add_to_group', params: { scenePath: 'scenes/main.tscn', nodePath: 'Player', group: 'players' } },
        { operation: 'set_node_property', params: { scenePath: 'scenes/main.tscn', nodePath: 'Player', property: 'z_index', value: 5 } },
      ],
    });
    check('batch ran 3 ops all ok (camelCase param conversion)', payload(r).all_ok === true && payload(r).ran === 3, JSON.stringify(payload(r)));

    // --- batch failure semantics ---
    r = await call('batch', {
      operations: [
        { operation: 'rename_node', params: { scenePath: 'scenes/main.tscn', nodePath: 'DoesNotExist', newName: 'X' } },
        { operation: 'add_to_group', params: { scenePath: 'scenes/main.tscn', nodePath: 'Player', group: 'late' } },
      ],
    });
    check('batch stops at first failure', payload(r).all_ok === false && payload(r).ran === 1);

    // --- set_node_properties (plural) ---
    r = await call('set_node_properties', { scenePath: 'scenes/main.tscn', nodePath: 'Player', properties: { modulate: [1, 0, 0, 1], rotation: 1.57 } });
    check('set_node_properties set 2 props', (payload(r).set || []).length === 2);

    // --- create_animation ---
    r = await call('create_animation', {
      scenePath: 'scenes/main.tscn', playerNode: 'Anim', name: 'fade', length: 1.0,
      tracks: [{ path: 'Player:modulate', keys: [{ time: 0, value: [1, 1, 1, 1] }, { time: 1, value: [1, 1, 1, 0] }] }],
    });
    check('create_animation created 1 track', payload(r).tracks === 1, JSON.stringify(payload(r)));

    // --- reorder_node ---
    r = await call('reorder_node', { scenePath: 'scenes/main.tscn', nodePath: 'Player', toIndex: 1 });
    check('reorder_node moved Player to index 1', payload(r).index === 1);

    // --- validate_scene after all mutations ---
    r = await call('validate_scene', { scenePath: 'scenes/main.tscn' });
    check('scene still valid after mutations', payload(r).valid === true, JSON.stringify(payload(r)));

    // --- list_classes ---
    r = await call('list_classes', { filter: 'Body2D' });
    check('list_classes finds CharacterBody2D', (payload(r).classes || []).includes('CharacterBody2D'));

    // --- find_broken_references (clean project) ---
    r = await call('find_broken_references', {});
    check('find_broken_references reports 0 broken', payload(r).broken_count === 0);

    // --- path_to_uid (graceful when none) ---
    r = await call('path_to_uid', { filePath: 'scenes/main.tscn' });
    check('path_to_uid returns without error', payload(r).exists === true);

    // --- security: path traversal rejected ---
    r = await call('get_scene_tree', { scenePath: '../../../etc/passwd' });
    check('path traversal rejected', r.isError === true);
  } finally {
    await client.close();
    rmSync(projectPath, { recursive: true, force: true });
  }
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.log('Failures:\n - ' + failures.join('\n - '));
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test harness crashed:', err);
    process.exit(1);
  });
