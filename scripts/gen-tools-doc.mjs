#!/usr/bin/env node
// Generate docs/TOOLS.md from the live server tool schemas.
// Run via `npm run docs:tools` (which builds first). Requires a usable Godot
// (GODOT_PATH or an auto-detected install), same as the rest of the toolchain.
//
// Any tool not assigned to a GROUP below lands in an "Uncategorized" section and
// prints a warning — so adding a tool never breaks doc generation, it just nudges
// you to slot it into the right group here.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Curated domain grouping (ordered). Keep in sync when adding tools.
const GROUPS = [
  ['Project & process', ['launch_editor', 'run_project', 'stop_project', 'get_debug_output', 'run_and_capture_errors', 'get_godot_version', 'list_projects', 'get_project_info', 'export_project']],
  ['Scene authoring (core)', ['create_scene', 'save_scene', 'build_scene', 'batch', 'add_node', 'load_sprite', 'instance_scene', 'add_scene_instance', 'export_mesh_library', 'delete_scene']],
  ['Scene inspection (read)', ['get_scene_tree', 'get_node_properties', 'get_scene_dependencies', 'get_scene_file_content', 'describe_class', 'list_classes', 'find_nodes', 'find_nodes_by_type', 'find_nodes_in_group', 'get_node_groups', 'get_scene_exports', 'validate_scene']],
  ['Node editing', ['set_node_property', 'set_node_properties', 'update_property', 'delete_node', 'rename_node', 'reparent_node', 'move_node', 'duplicate_node', 'reorder_node', 'add_to_group', 'remove_from_group', 'set_node_groups', 'set_anchor_preset', 'add_resource', 'batch_add_nodes', 'batch_set_property', 'cross_scene_set_property']],
  ['Scripts & signals', ['create_script', 'attach_script', 'list_scripts', 'read_script', 'edit_script', 'check_script', 'validate_script', 'connect_signal', 'disconnect_signal', 'list_connections', 'analyze_signal_flow', 'find_signal_connections']],
  ['Project configuration & resources', ['get_project_setting', 'set_project_setting', 'get_project_settings', 'set_main_scene', 'list_autoloads', 'add_autoload', 'remove_autoload', 'add_input_action', 'remove_input_action', 'set_input_action', 'get_input_actions', 'create_resource', 'edit_resource', 'get_resource_properties', 'read_resource', 'list_export_presets', 'get_export_info', 'get_android_preset_info']],
  ['UID management', ['get_uid', 'update_project_uids', 'path_to_uid', 'project_path_to_uid', 'uid_to_project_path']],
  ['Project analysis', ['get_filesystem_tree', 'search_files', 'search_in_files', 'get_project_statistics', 'find_script_references', 'find_node_references', 'find_unused_resources', 'detect_circular_dependencies', 'analyze_scene_complexity']],
  ['TileMap', ['tilemap_set_cell', 'tilemap_fill_rect', 'tilemap_get_cell', 'tilemap_clear', 'tilemap_get_info', 'tilemap_get_used_cells']],
  ['Animation & AnimationTree', ['create_animation', 'list_animations', 'add_animation_track', 'set_animation_keyframe', 'get_animation_info', 'remove_animation', 'create_animation_tree', 'get_animation_tree_structure', 'add_state_machine_state', 'remove_state_machine_state', 'add_state_machine_transition', 'remove_state_machine_transition', 'set_blend_tree_node', 'set_tree_parameter']],
  ['Audio', ['add_audio_bus', 'set_audio_bus', 'add_audio_bus_effect', 'get_audio_bus_layout', 'add_audio_player', 'get_audio_info']],
  ['Shaders, Themes & UI', ['create_shader', 'read_shader', 'edit_shader', 'assign_shader_material', 'set_shader_param', 'get_shader_params', 'create_theme', 'set_theme_color', 'set_theme_constant', 'set_theme_font_size', 'set_theme_stylebox', 'get_theme_info', 'setup_control']],
  ['Particles', ['create_particles', 'set_particle_material', 'set_particle_color_gradient', 'apply_particle_preset', 'get_particle_info']],
  ['Physics', ['setup_physics_body', 'setup_collision', 'add_raycast', 'set_physics_layers', 'get_physics_layers', 'get_collision_info']],
  ['Navigation & 3D', ['setup_navigation_region', 'bake_navigation_mesh', 'setup_navigation_agent', 'set_navigation_layers', 'get_navigation_info', 'add_mesh_instance', 'set_material_3d', 'setup_lighting', 'setup_environment', 'setup_camera_3d', 'add_gridmap']],
  ['Automated e2e / UAT', ['run_scene_test', 'run_tests', 'capture_scene_screenshot', 'find_broken_references']],
];

const typeOf = (p) => (!p ? '' : p.type === 'array' ? `array<${(p.items && p.items.type) || 'any'}>` : p.type || 'any');
const esc = (s) => (s || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();

async function listTools() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [join(repoRoot, 'build', 'index.js')],
    env: { ...process.env },
  });
  const client = new Client({ name: 'gen-tools-doc', version: '1.0' }, { capabilities: {} });
  await client.connect(transport);
  const { tools } = await client.listTools();
  await client.close();
  return tools;
}

function render(tools) {
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  // Build the working group list; collect any unlisted tools into "Uncategorized".
  const placed = new Set();
  const groups = [];
  for (const [title, names] of GROUPS) {
    const present = names.filter((n) => byName[n]);
    for (const n of present) placed.add(n);
    groups.push([title, present]);
  }
  const leftover = tools.map((t) => t.name).filter((n) => !placed.has(n)).sort();
  if (leftover.length) {
    console.warn(`[gen-tools-doc] WARNING: ${leftover.length} tool(s) not grouped, placed under "Uncategorized": ${leftover.join(', ')}`);
    console.warn('[gen-tools-doc] Add them to a GROUP in scripts/gen-tools-doc.mjs to categorize them.');
    groups.push(['Uncategorized', leftover]);
  }

  let out = '# Tool reference\n\n';
  out += `Complete reference for all **${tools.length}** tools exposed by \`godot-mcp-extended\`, generated from the live server schemas. Every tool takes \`projectPath\` (the Godot project directory) and returns structured JSON.\n\n`;
  out += 'For deferred live-editor/runtime capabilities that are intentionally **not** in this list, see [`live-editor-bridge.md`](live-editor-bridge.md).\n\n';
  out += '> This file is generated by `npm run docs:tools` — do not edit by hand.\n\n';

  out += '## Index\n\n';
  for (const [title, names] of groups) {
    if (!names.length) continue;
    out += `- **${title}** (${names.length}): ` + names.map((n) => `[\`${n}\`](#${n})`).join(', ') + '\n';
  }
  out += '\n';

  for (const [title, names] of groups) {
    if (!names.length) continue;
    out += `## ${title}\n\n`;
    for (const n of names) {
      const t = byName[n];
      const props = (t.inputSchema && t.inputSchema.properties) || {};
      const req = new Set((t.inputSchema && t.inputSchema.required) || []);
      out += `### \`${n}\`\n\n` + esc(t.description) + '\n\n';
      const keys = Object.keys(props);
      if (keys.length) {
        out += '| Parameter | Type | Required | Description |\n|---|---|---|---|\n';
        const ordered = [...keys].sort((a, b) => {
          const ra = req.has(a), rb = req.has(b);
          if (ra !== rb) return ra ? -1 : 1;
          return keys.indexOf(a) - keys.indexOf(b);
        });
        for (const k of ordered) out += `| \`${k}\` | ${typeOf(props[k])} | ${req.has(k) ? 'yes' : 'no'} | ${esc(props[k].description)} |\n`;
        out += '\n';
      } else {
        out += '_No parameters._\n\n';
      }
    }
  }
  out += '---\n\n_Generated from the server tool schemas by `npm run docs:tools`. Regenerate after adding or changing tools._\n';
  return out;
}

const tools = await listTools();
const md = render(tools);
const outPath = join(repoRoot, 'docs', 'TOOLS.md');
writeFileSync(outPath, md);
console.log(`[gen-tools-doc] Wrote docs/TOOLS.md — ${tools.length} tools.`);
process.exit(0);
