# Godot MCP Extended

[![](https://badge.mcpx.dev?type=server 'MCP Server')](https://modelcontextprotocol.io/introduction)
[![Made with Godot](https://img.shields.io/badge/Made%20with-Godot-478CBF?style=flat&logo=godot%20engine&logoColor=white)](https://godotengine.org)
[![](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white 'Node.js')](https://nodejs.org/en/download/)
[![](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white 'TypeScript')](https://www.typescriptlang.org/)

[![](https://img.shields.io/badge/License-MIT-red.svg 'MIT License')](https://opensource.org/licenses/MIT)


```text
                           (((((((             (((((((
                        (((((((((((           (((((((((((
                        (((((((((((((       (((((((((((((
                        (((((((((((((((((((((((((((((((((
                        (((((((((((((((((((((((((((((((((
         (((((      (((((((((((((((((((((((((((((((((((((((((      (((((
       (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
     ((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
    ((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
      (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
        (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
         (((((((((((@@@@@@@(((((((((((((((((((((((((((@@@@@@@(((((((((((
         (((((((((@@@@,,,,,@@@(((((((((((((((((((((@@@,,,,,@@@@(((((((((
         ((((((((@@@,,,,,,,,,@@(((((((@@@@@(((((((@@,,,,,,,,,@@@((((((((
         ((((((((@@@,,,,,,,,,@@(((((((@@@@@(((((((@@,,,,,,,,,@@@((((((((
         (((((((((@@@,,,,,,,@@((((((((@@@@@((((((((@@,,,,,,,@@@(((((((((
         ((((((((((((@@@@@@(((((((((((@@@@@(((((((((((@@@@@@((((((((((((
         (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
         (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
         @@@@@@@@@@@@@((((((((((((@@@@@@@@@@@@@((((((((((((@@@@@@@@@@@@@
         ((((((((( @@@(((((((((((@@(((((((((((@@(((((((((((@@@ (((((((((
         (((((((((( @@((((((((((@@@(((((((((((@@@((((((((((@@ ((((((((((
          (((((((((((@@@@@@@@@@@@@@(((((((((((@@@@@@@@@@@@@@(((((((((((
           (((((((((((((((((((((((((((((((((((((((((((((((((((((((((((
              (((((((((((((((((((((((((((((((((((((((((((((((((((((
                 (((((((((((((((((((((((((((((((((((((((((((((((
                        (((((((((((((((((((((((((((((((((


                          /$$      /$$  /$$$$$$  /$$$$$$$
                         | $$$    /$$$ /$$__  $$| $$__  $$
                         | $$$$  /$$$$| $$  \__/| $$  \ $$
                         | $$ $$/$$ $$| $$      | $$$$$$$/
                         | $$  $$$| $$| $$      | $$____/
                         | $$\  $ | $$| $$    $$| $$
                         | $$ \/  | $$|  $$$$$$/| $$
                         |__/     |__/ \______/ |__/
```

A Model Context Protocol (MCP) server for interacting with the Godot game engine.

## Introduction

Godot MCP enables AI agents to launch the Godot editor, run projects, capture debug output, and control project execution. This direct feedback loop helps agents understand what works and what doesn't in real Godot projects, leading to better code generation and debugging assistance.

> This project (`godot-mcp-extended`) builds on the original [godot-mcp](https://github.com/Coding-Solo/godot-mcp) by Solomon Elias (MIT), adding a full inspect → edit → validate → e2e loop plus broad scene/resource authoring across animation, audio, shaders, UI/theme, particles, physics, navigation and 3D (**157 tools total**).

## Features

- **Launch Godot Editor**: Open the Godot editor for a specific project
- **Run Godot Projects**: Execute Godot projects in debug mode
- **Capture Debug Output**: Retrieve console output and error messages
- **Control Execution**: Start and stop Godot projects programmatically
- **Get Godot Version**: Retrieve the installed Godot version
- **List Godot Projects**: Find Godot projects in a specified directory
- **Project Analysis**: Get detailed information about project structure
- **Scene Management**:
  - Create new scenes with specified root node types
  - Add nodes to existing scenes with customizable properties
  - Load sprites and textures into Sprite2D nodes
  - Export 3D scenes as MeshLibrary resources for GridMap
  - Save scenes with options for creating variants
- **UID Management** (for Godot 4.4+):
  - Get UID for specific files
  - Update UID references by resaving resources

### Extended toolset

The server exposes a full **inspect → mutate → validate** loop so an agent can edit scenes deliberately instead of creating them blind. All operations run headless and report structured JSON results with authoritative exit-code error handling.

- **Scene inspection (READ)**:
  - `get_scene_tree` — full node tree of a scene as JSON (names, types, paths, scripts, groups)
  - `get_node_properties` — read a node's properties (`overrides` or `effective` mode)
  - `get_scene_dependencies` — list external resources a scene references and whether each exists
  - `describe_class` — ClassDB introspection (parent, properties, methods, signals) to discover valid names
  - `list_scripts` / `read_script` — enumerate and read GDScript files
- **Diagnostics (VALIDATE)**:
  - `check_script` — parse/compile-check a script via `--check-only` without running the game
  - `validate_scene` — verify a scene loads/instantiates and report missing dependencies
  - `run_and_capture_errors` — run for a bounded time and return structured script errors/warnings
- **Node editing (EDIT)**:
  - `set_node_property` — set a property on an existing node (auto-coerces `[x,y]`→`Vector2`, colors, enums, `res://`→resource)
  - `delete_node`, `rename_node`, `reparent_node`, `duplicate_node`
  - `add_to_group` / `remove_from_group`
- **Behavior wiring (BEHAVIOR)**:
  - `create_script` / `attach_script` — create a `.gd` file and attach it to a node
  - `connect_signal` / `disconnect_signal` / `list_connections` — manage persisted signal connections
  - `instance_scene` — compose scenes by instancing one into another (serialized as a true instance)
- **Project configuration (PROJECT)**:
  - `get_project_setting` / `set_project_setting` / `set_main_scene`
  - `list_autoloads` / `add_autoload` / `remove_autoload`
  - `add_input_action` / `remove_input_action`
  - `create_resource` / `edit_resource` / `get_resource_properties`
- **Performance — single-boot multi-op**: every tool normally spawns a fresh headless Godot (~1–3s boot), so a scene built from ~20 calls pays ~20 cold boots. These collapse that into **one** process (~15–30× faster):
  - `batch` — run an array of `{operation, params}` through one Godot process; returns per-op `ok`/`result`, stops at the first failure unless `stopOnError: false`
  - `build_scene` — construct a whole scene tree from a nested spec (`type`/`instance`, `name`, `script`, `properties`, `groups`, `children`, plus `signals[]`) and save once
  - `set_node_properties` — set many properties on a node in one load/save
- **Discovery & diagnostics**:
  - `find_nodes` — search a scene by type (inheritance-aware), group, and/or wildcard name pattern
  - `list_classes` — list ClassDB classes, filtered by substring and/or base class
  - `path_to_uid` — resolve a file to its `uid://` (reverse of `get_uid`)
  - `find_broken_references` — scan scenes/resources for references to files that no longer exist
  - `reorder_node` — move a node among its siblings (draw/child order)
- **Animation & build**:
  - `create_animation` — author a value-track `Animation` on an `AnimationPlayer` (keyframes from JSON)
  - `export_project` — export via a configured preset (`--export-release`/`--export-debug`) to complete the build pipeline

### Authoring & analysis toolset

Beyond the core loop above, the server covers most day-to-day scene/resource authoring and
project analysis — every tool runs headless and returns structured JSON.

- **Project & filesystem analysis (READ-only)**:
  - `get_filesystem_tree`, `search_files`, `search_in_files`, `get_project_statistics`
  - `get_scene_file_content`, `read_resource`, `get_project_settings`, `get_input_actions`
  - `find_script_references`, `find_node_references`, `find_unused_resources`, `detect_circular_dependencies`
  - `analyze_scene_complexity`, `analyze_signal_flow`, `find_signal_connections`
  - `get_scene_exports`, `get_node_groups`, `find_nodes_by_type`, `find_nodes_in_group`
  - `list_export_presets`, `get_export_info`, `get_android_preset_info`
- **TileMap** (`TileMapLayer` + legacy `TileMap`):
  - `tilemap_set_cell`, `tilemap_fill_rect`, `tilemap_get_cell`, `tilemap_clear`, `tilemap_get_info`, `tilemap_get_used_cells`
- **Animation & AnimationTree**:
  - `list_animations`, `add_animation_track`, `set_animation_keyframe`, `get_animation_info`, `remove_animation`
  - `create_animation_tree`, `get_animation_tree_structure`, `add_state_machine_state`/`remove_state_machine_state`, `add_state_machine_transition`/`remove_state_machine_transition`, `set_blend_tree_node`, `set_tree_parameter`
- **Audio** (project bus layout + scene players):
  - `add_audio_bus`, `set_audio_bus`, `add_audio_bus_effect`, `get_audio_bus_layout`, `add_audio_player`, `get_audio_info`
- **Shaders, Themes & UI**:
  - `create_shader`, `read_shader`, `edit_shader`, `assign_shader_material`, `set_shader_param`, `get_shader_params`
  - `create_theme`, `set_theme_color`, `set_theme_constant`, `set_theme_font_size`, `set_theme_stylebox`, `get_theme_info`, `setup_control`
- **Particles**:
  - `create_particles`, `set_particle_material`, `set_particle_color_gradient`, `apply_particle_preset`, `get_particle_info`
- **Physics**:
  - `setup_physics_body`, `setup_collision`, `add_raycast`, `set_physics_layers`, `get_physics_layers`, `get_collision_info`
- **Navigation & 3D**:
  - `setup_navigation_region`, `bake_navigation_mesh`, `setup_navigation_agent`, `set_navigation_layers`, `get_navigation_info`
  - `add_mesh_instance`, `set_material_3d`, `setup_lighting`, `setup_environment`, `setup_camera_3d`, `add_gridmap`
- **More node / script / batch authoring**:
  - `move_node`, `update_property`, `add_resource`, `set_anchor_preset`, `set_node_groups`
  - `batch_add_nodes`, `batch_set_property`, `cross_scene_set_property`
  - `edit_script`, `validate_script`, `set_input_action`, `add_scene_instance`, `delete_scene`
  - `uid_to_project_path`, `project_path_to_uid`

> **Deferred capabilities.** Tools that need a *running game* or a *live editor* (input
> simulation, running-game inspection, editor screenshots, runtime test scenarios, device
> deploy) can't run in this headless model. They're catalogued — with per-tool contracts and a
> proposed opt-in bridge design — in [`docs/live-editor-bridge.md`](docs/live-editor-bridge.md).

### Automated e2e / UAT

The missing *runtime* half of the loop: don't just check that a scene *loads* — verify the game *behaves* correctly. Godot's headless mode runs the full game loop (`_process`/`_physics_process` tick, signals fire, physics simulates), so these run real behavioral tests with no rendering.

- **`run_scene_test`** — boots a scene headless, runs a scenario of **steps** (drive input, advance frames, call methods, watch signals) and **assertions** (property values, node existence, group membership, signal counts, method return values, node counts), and returns per-assertion pass/fail.
- **`run_tests`** — runs an existing **GUT** or **GdUnit4** suite headless and returns the pass/fail summary (auto-detected from project addons).
- **`capture_scene_screenshot`** — *experimental* visual UAT: renders a scene to a PNG (needs a GPU/display; falls back gracefully in pure-headless CI).

Example scenario — verify the player moves right when the input is held:

```json
{
  "projectPath": "/path/to/project",
  "scenePath": "player.tscn",
  "timeoutSeconds": 8,
  "steps": [
    { "action": "assert_node_exists", "node": "AnimatedSprite2D", "exists": true },
    { "action": "press_action", "name": "move_right" },
    { "action": "wait_frames", "frames": 20 },
    { "action": "release_action", "name": "move_right" },
    { "action": "assert_property", "node": "", "property": "position", "op": ">", "value": { "x": 0 } }
  ]
}
```

Returns: `{ "passed": 2, "failed": 0, "all_passed": true, "results": [...] }`.

## Requirements

- [Godot Engine](https://godotengine.org/download) installed on your system
- Node.js (>=18.0.0) and npm
- An AI agent that supports MCP

## Install

This server is distributed via GitHub (not npm). Clone and build it once:

```bash
git clone https://github.com/ibnutoriq/godot-mcp-extended.git
cd godot-mcp-extended
npm install
npm run build
```

This produces `build/index.js`. Note the **absolute path** to that file — your MCP client points at it. Get it with:

```bash
echo "$(pwd)/build/index.js"
```

> **No-clone alternative:** any `node /path/to/build/index.js` command below can be replaced with `npx -y github:ibnutoriq/godot-mcp-extended`, which fetches and builds the repo on first run. Slower to start, but nothing to clone.

## Quick Start

### Claude Code

```bash
claude mcp add godot -- node /absolute/path/to/godot-mcp-extended/build/index.js
```

That's it. Restart Claude Code and your Godot MCP tools are available.

With environment variables (Godot path is auto-detected; set it only if needed):

```bash
claude mcp add godot -e GODOT_PATH=/path/to/godot -- node /absolute/path/to/godot-mcp-extended/build/index.js
```

Or without cloning:

```bash
claude mcp add godot -- npx -y github:ibnutoriq/godot-mcp-extended
```

<details>
<summary><strong>Cline</strong></summary>

Add to your Cline MCP settings file (`~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp-extended/build/index.js"],
      "env": {
        "GODOT_PATH": "/path/to/godot"
      },
      "disabled": false,
      "autoApprove": [
        "get_scene_tree",
        "get_node_properties",
        "describe_class",
        "get_godot_version",
        "list_projects",
        "get_project_info",
        "check_script",
        "validate_scene"
      ]
    }
  }
}
```

> `autoApprove` lists the read-only tools that won't prompt for confirmation. Add any of the other tool names you want to run without a prompt.

</details>

<details>
<summary><strong>Cursor</strong></summary>

**Using the Cursor UI:**

1. Go to **Cursor Settings** > **Features** > **MCP**
2. Click on the **+ Add New MCP Server** button
3. Fill out the form:
   - Name: `godot`
   - Type: `command`
   - Command: `node /absolute/path/to/godot-mcp-extended/build/index.js`
4. Click "Add"
5. You may need to press the refresh button in the top right corner of the MCP server card to populate the tool list

**Using Project-Specific Configuration:**

Create a file at `.cursor/mcp.json` in your project directory:

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp-extended/build/index.js"],
      "env": {
        "GODOT_PATH": "/path/to/godot"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Other MCP Clients</strong></summary>

For any MCP-compatible client, use this configuration:

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp-extended/build/index.js"],
      "env": {
        "GODOT_PATH": "/path/to/godot"
      }
    }
  }
}
```

Prefer no clone? Use `"command": "npx"` with `"args": ["-y", "github:ibnutoriq/godot-mcp-extended"]` instead.

</details>

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GODOT_PATH` | Path to the Godot executable (overrides automatic detection) |
| `DEBUG` | Set to `"true"` to enable detailed server-side debug logging |



## Architecture

The Godot MCP server uses a bundled GDScript approach for complex operations:

1. **Direct Commands**: Simple operations like launching the editor or getting project info use Godot's built-in CLI commands directly.
2. **Bundled Operations Script**: Complex operations like creating scenes or adding nodes use a single, comprehensive GDScript file (`godot_operations.gd`) that handles all operations.

The bundled script accepts operation type and parameters as JSON, allowing for flexible and dynamic operation execution without generating temporary files for each operation.

## Development & tests

An end-to-end test harness spins up the compiled server over stdio against a throwaway Godot project and exercises a representative slice of the toolset (scene construction, batched edits, inspection, validation, animation, diagnostics, and path-traversal rejection). Each assertion runs a real headless Godot process.

```bash
npm test            # builds, then runs test/integration.test.mjs
# or, with an explicit binary:
GODOT_PATH=/path/to/godot npm test
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the same suite on every push/PR across multiple Godot 4.x versions, guarding all tools against engine version bumps.

## Troubleshooting

- **Godot Not Found**: Set the `GODOT_PATH` environment variable to your Godot executable path
- **Connection Issues**: Ensure the server is running and restart your AI assistant
- **Invalid Project Path**: Ensure the path points to a directory containing a `project.godot` file
- **Build Issues**: Make sure all dependencies are installed by running `npm install`

<details>
<summary><strong>Cursor-Specific Issues</strong></summary>

- Ensure the MCP server shows up and is enabled in Cursor settings (Settings > MCP)
- MCP tools can only be run using the Agent chat profile (Cursor Pro or Business subscription)
- Use "Yolo Mode" to automatically run MCP tool requests

</details>

## Credits

`godot-mcp-extended` is maintained by [Ibnu Toriq](https://github.com/ibnutoriq). It is based on the original [godot-mcp](https://github.com/Coding-Solo/godot-mcp) by Solomon Elias, used under the MIT License. Thanks to the original author for the foundation this builds on.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
