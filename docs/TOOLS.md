# Tool reference

Complete reference for all **157** tools exposed by `godot-mcp-extended`, generated from the live server schemas. Every tool takes `projectPath` (the Godot project directory) and returns structured JSON.

For deferred live-editor/runtime capabilities that are intentionally **not** in this list, see [`live-editor-bridge.md`](live-editor-bridge.md).

## Index

- **Project & process** (9): [`launch_editor`](#launch_editor), [`run_project`](#run_project), [`stop_project`](#stop_project), [`get_debug_output`](#get_debug_output), [`run_and_capture_errors`](#run_and_capture_errors), [`get_godot_version`](#get_godot_version), [`list_projects`](#list_projects), [`get_project_info`](#get_project_info), [`export_project`](#export_project)
- **Scene authoring (core)** (10): [`create_scene`](#create_scene), [`save_scene`](#save_scene), [`build_scene`](#build_scene), [`batch`](#batch), [`add_node`](#add_node), [`load_sprite`](#load_sprite), [`instance_scene`](#instance_scene), [`add_scene_instance`](#add_scene_instance), [`export_mesh_library`](#export_mesh_library), [`delete_scene`](#delete_scene)
- **Scene inspection (read)** (12): [`get_scene_tree`](#get_scene_tree), [`get_node_properties`](#get_node_properties), [`get_scene_dependencies`](#get_scene_dependencies), [`get_scene_file_content`](#get_scene_file_content), [`describe_class`](#describe_class), [`list_classes`](#list_classes), [`find_nodes`](#find_nodes), [`find_nodes_by_type`](#find_nodes_by_type), [`find_nodes_in_group`](#find_nodes_in_group), [`get_node_groups`](#get_node_groups), [`get_scene_exports`](#get_scene_exports), [`validate_scene`](#validate_scene)
- **Node editing** (17): [`set_node_property`](#set_node_property), [`set_node_properties`](#set_node_properties), [`update_property`](#update_property), [`delete_node`](#delete_node), [`rename_node`](#rename_node), [`reparent_node`](#reparent_node), [`move_node`](#move_node), [`duplicate_node`](#duplicate_node), [`reorder_node`](#reorder_node), [`add_to_group`](#add_to_group), [`remove_from_group`](#remove_from_group), [`set_node_groups`](#set_node_groups), [`set_anchor_preset`](#set_anchor_preset), [`add_resource`](#add_resource), [`batch_add_nodes`](#batch_add_nodes), [`batch_set_property`](#batch_set_property), [`cross_scene_set_property`](#cross_scene_set_property)
- **Scripts & signals** (12): [`create_script`](#create_script), [`attach_script`](#attach_script), [`list_scripts`](#list_scripts), [`read_script`](#read_script), [`edit_script`](#edit_script), [`check_script`](#check_script), [`validate_script`](#validate_script), [`connect_signal`](#connect_signal), [`disconnect_signal`](#disconnect_signal), [`list_connections`](#list_connections), [`analyze_signal_flow`](#analyze_signal_flow), [`find_signal_connections`](#find_signal_connections)
- **Project configuration & resources** (18): [`get_project_setting`](#get_project_setting), [`set_project_setting`](#set_project_setting), [`get_project_settings`](#get_project_settings), [`set_main_scene`](#set_main_scene), [`list_autoloads`](#list_autoloads), [`add_autoload`](#add_autoload), [`remove_autoload`](#remove_autoload), [`add_input_action`](#add_input_action), [`remove_input_action`](#remove_input_action), [`set_input_action`](#set_input_action), [`get_input_actions`](#get_input_actions), [`create_resource`](#create_resource), [`edit_resource`](#edit_resource), [`get_resource_properties`](#get_resource_properties), [`read_resource`](#read_resource), [`list_export_presets`](#list_export_presets), [`get_export_info`](#get_export_info), [`get_android_preset_info`](#get_android_preset_info)
- **UID management** (5): [`get_uid`](#get_uid), [`update_project_uids`](#update_project_uids), [`path_to_uid`](#path_to_uid), [`project_path_to_uid`](#project_path_to_uid), [`uid_to_project_path`](#uid_to_project_path)
- **Project analysis** (9): [`get_filesystem_tree`](#get_filesystem_tree), [`search_files`](#search_files), [`search_in_files`](#search_in_files), [`get_project_statistics`](#get_project_statistics), [`find_script_references`](#find_script_references), [`find_node_references`](#find_node_references), [`find_unused_resources`](#find_unused_resources), [`detect_circular_dependencies`](#detect_circular_dependencies), [`analyze_scene_complexity`](#analyze_scene_complexity)
- **TileMap** (6): [`tilemap_set_cell`](#tilemap_set_cell), [`tilemap_fill_rect`](#tilemap_fill_rect), [`tilemap_get_cell`](#tilemap_get_cell), [`tilemap_clear`](#tilemap_clear), [`tilemap_get_info`](#tilemap_get_info), [`tilemap_get_used_cells`](#tilemap_get_used_cells)
- **Animation & AnimationTree** (14): [`create_animation`](#create_animation), [`list_animations`](#list_animations), [`add_animation_track`](#add_animation_track), [`set_animation_keyframe`](#set_animation_keyframe), [`get_animation_info`](#get_animation_info), [`remove_animation`](#remove_animation), [`create_animation_tree`](#create_animation_tree), [`get_animation_tree_structure`](#get_animation_tree_structure), [`add_state_machine_state`](#add_state_machine_state), [`remove_state_machine_state`](#remove_state_machine_state), [`add_state_machine_transition`](#add_state_machine_transition), [`remove_state_machine_transition`](#remove_state_machine_transition), [`set_blend_tree_node`](#set_blend_tree_node), [`set_tree_parameter`](#set_tree_parameter)
- **Audio** (6): [`add_audio_bus`](#add_audio_bus), [`set_audio_bus`](#set_audio_bus), [`add_audio_bus_effect`](#add_audio_bus_effect), [`get_audio_bus_layout`](#get_audio_bus_layout), [`add_audio_player`](#add_audio_player), [`get_audio_info`](#get_audio_info)
- **Shaders, Themes & UI** (13): [`create_shader`](#create_shader), [`read_shader`](#read_shader), [`edit_shader`](#edit_shader), [`assign_shader_material`](#assign_shader_material), [`set_shader_param`](#set_shader_param), [`get_shader_params`](#get_shader_params), [`create_theme`](#create_theme), [`set_theme_color`](#set_theme_color), [`set_theme_constant`](#set_theme_constant), [`set_theme_font_size`](#set_theme_font_size), [`set_theme_stylebox`](#set_theme_stylebox), [`get_theme_info`](#get_theme_info), [`setup_control`](#setup_control)
- **Particles** (5): [`create_particles`](#create_particles), [`set_particle_material`](#set_particle_material), [`set_particle_color_gradient`](#set_particle_color_gradient), [`apply_particle_preset`](#apply_particle_preset), [`get_particle_info`](#get_particle_info)
- **Physics** (6): [`setup_physics_body`](#setup_physics_body), [`setup_collision`](#setup_collision), [`add_raycast`](#add_raycast), [`set_physics_layers`](#set_physics_layers), [`get_physics_layers`](#get_physics_layers), [`get_collision_info`](#get_collision_info)
- **Navigation & 3D** (11): [`setup_navigation_region`](#setup_navigation_region), [`bake_navigation_mesh`](#bake_navigation_mesh), [`setup_navigation_agent`](#setup_navigation_agent), [`set_navigation_layers`](#set_navigation_layers), [`get_navigation_info`](#get_navigation_info), [`add_mesh_instance`](#add_mesh_instance), [`set_material_3d`](#set_material_3d), [`setup_lighting`](#setup_lighting), [`setup_environment`](#setup_environment), [`setup_camera_3d`](#setup_camera_3d), [`add_gridmap`](#add_gridmap)
- **Automated e2e / UAT** (4): [`run_scene_test`](#run_scene_test), [`run_tests`](#run_tests), [`capture_scene_screenshot`](#capture_scene_screenshot), [`find_broken_references`](#find_broken_references)

## Project & process

### `launch_editor`

Launch Godot editor for a specific project

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |

### `run_project`

Run the Godot project and capture output

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scene` | string | no | Optional: Specific scene to run |

### `stop_project`

Stop the currently running Godot project

_No parameters._

### `get_debug_output`

Get the current debug output and errors

_No parameters._

### `run_and_capture_errors`

Run the project (optionally a single scene) for a bounded time and return captured stdout plus structured script errors/warnings

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scene` | string | no | Optional specific scene to run (relative to project) |
| `timeoutSeconds` | number | no | How long to let the project run before stopping (default 5) |

### `get_godot_version`

Get the installed Godot version

_No parameters._

### `list_projects`

List Godot projects in a directory

| Parameter | Type | Required | Description |
|---|---|---|---|
| `directory` | string | yes | Directory to search for Godot projects |
| `recursive` | boolean | no | Whether to search recursively (default: false) |

### `get_project_info`

Retrieve metadata about a Godot project

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |

### `export_project`

Export the project using a configured export preset (completes the build pipeline). Runs Godot --export-release (or --export-debug). The preset must already exist in export_presets.cfg. Returns the exit code and output tail.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `presetName` | string | yes | Name of the export preset (as defined in export_presets.cfg) |
| `exportPath` | string | yes | Output file path (relative to project, e.g. build/game.exe) |
| `debugExport` | boolean | no | Use --export-debug instead of --export-release (default false) |

## Scene authoring (core)

### `create_scene`

Create a new Godot scene file

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path where the scene file will be saved (relative to project) |
| `rootNodeType` | string | no | Type of the root node (e.g., Node2D, Node3D) |

### `save_scene`

Save changes to a scene file

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file (relative to project) |
| `newPath` | string | no | Optional: New path to save the scene to (for creating variants) |

### `build_scene`

Construct an entire scene tree in a SINGLE process from a nested spec, then save once. root is a node spec: {type \| instance, name, script, properties{}, groups[], children[]}. "type" is a Godot class (e.g. Node2D); "instance" is a res:// scene to instance instead. children is an array of the same node-spec shape. Optional signals[] = [{from, signal, to, method}] (node paths relative to root) are connected after the tree is built. Far faster than create_scene + repeated add_node calls.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path where the scene (.tscn) will be saved (relative to project) |
| `root` | object | yes | Root node spec (see description) |
| `signals` | array<object> | no | Optional signal connections to wire up |

### `batch`

Run many operations in ONE headless Godot process instead of one process per call (~15-30x faster for multi-step edits). operations is an array of {operation, params}. Batchable operations are the structured editing/inspection tools: set_node_property, set_node_properties, delete_node, rename_node, reparent_node, duplicate_node, reorder_node, add_to_group, remove_from_group, attach_script, connect_signal, disconnect_signal, instance_scene, create_resource, edit_resource, build_scene, find_nodes, create_animation, get_scene_tree, get_node_properties, validate_scene, and the project-setting/autoload/input ops. Each op params object uses the same fields as the standalone tool (camelCase or snake_case accepted). Returns per-operation ok/result. Stops at the first failure unless stopOnError is false.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `operations` | array<object> | yes | Ordered list of {operation, params} objects |
| `stopOnError` | boolean | no | Stop at the first failing operation (default true) |

### `add_node`

Add a node to an existing scene

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file (relative to project) |
| `nodeType` | string | yes | Type of node to add (e.g., Sprite2D, CollisionShape2D) |
| `nodeName` | string | yes | Name for the new node |
| `parentNodePath` | string | no | Path to the parent node (e.g., "root" or "root/Player") |
| `properties` | object | no | Optional properties to set on the node |

### `load_sprite`

Load a sprite into a Sprite2D node

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file (relative to project) |
| `nodePath` | string | yes | Path to the Sprite2D node (e.g., "root/Player/Sprite2D") |
| `texturePath` | string | yes | Path to the texture file (relative to project) |

### `instance_scene`

Add another scene as an instanced child inside a scene (composition / prefabs)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the parent scene file |
| `instanceScenePath` | string | yes | Path to the scene to instance |
| `parentNodePath` | string | no | Node to add the instance under (default root) |
| `nodeName` | string | no | Optional name for the instance node |

### `add_scene_instance`

Alias of instance_scene: instance one scene as a child node under parentPath inside another scene, optionally with a custom name, then save.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file being edited |
| `instanceScenePath` | string | yes | Path to the scene to instance |
| `parentPath` | string | no | Path to the parent node the instance is added under (default: scene root) |
| `name` | string | no | Optional name for the instanced node |

### `export_mesh_library`

Export a scene as a MeshLibrary resource

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file (.tscn) to export |
| `outputPath` | string | yes | Path where the mesh library (.res) will be saved |
| `meshItemNames` | array<string> | no | Optional: Names of specific mesh items to include (defaults to all) |

### `delete_scene`

Delete a .tscn scene file from the project. Only .tscn files inside the project are permitted.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Project-relative path to the .tscn file to delete |

## Scene inspection (read)

### `get_scene_tree`

Inspect a scene: returns its full node tree (names, types, paths, scripts, groups) as JSON

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file (relative to project, e.g. scenes/main.tscn) |

### `get_node_properties`

Read the properties of a single node in a scene. mode "overrides" returns only non-default values, "effective" returns all stored values.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node within the scene (e.g. Player/Sprite2D). Empty/"root" for the root node. |
| `mode` | string | no | overrides (default) or effective |

### `get_scene_dependencies`

List the external resources (scripts, textures, instanced scenes) a scene references, and whether each exists

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |

### `get_scene_file_content`

Return the raw text content of a scene (.tscn) or resource (.tres) file.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Project-relative path to the .tscn/.tres file |

### `describe_class`

Introspect a Godot built-in class via ClassDB: its parent, properties, methods, and signals. Use to discover valid property/signal names before editing.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `className` | string | yes | The Godot class to describe (e.g. CharacterBody2D) |

### `list_classes`

List Godot engine classes from ClassDB, optionally filtered by a name substring and/or restricted to descendants of a base class.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `filter` | string | no | Optional case-insensitive substring to match in class names |
| `inherits` | string | no | Optional base class; only its descendants are returned |

### `find_nodes`

Search a scene for nodes by type (class, inheritance-aware), group, and/or a wildcard name pattern (e.g. "Enemy*"). Returns matching node paths.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `type` | string | no | Match nodes of this class or a subclass (e.g. Node2D) |
| `group` | string | no | Match nodes in this group |
| `namePattern` | string | no | Wildcard name pattern (case-insensitive, e.g. "Coin*") |

### `find_nodes_by_type`

Find all nodes of a given class (including subclasses, via is_class) within a scene.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Project-relative path to the .tscn file |
| `type` | string | yes | Class name to match (e.g. Area2D, Sprite2D, Button) |

### `find_nodes_in_group`

Find all nodes that belong to a given group within a scene.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Project-relative path to the .tscn file |
| `group` | string | yes | The group name |

### `get_node_groups`

Return the groups a specific node belongs to within a scene.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Project-relative path to the .tscn file |
| `nodePath` | string | yes | Path to the node within the scene |

### `get_scene_exports`

List the exported (@export) variables of a scene root's script, with their types and current values.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Project-relative path to the .tscn file |

### `validate_scene`

Validate a scene headless: reports whether it loads/instantiates and lists any missing dependencies

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |

## Node editing

### `set_node_property`

Set a property on an existing node in a scene. Values are coerced to the property type (e.g. [x,y] -> Vector2, "res://..." -> resource).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node within the scene |
| `property` | string | yes | Property name (e.g. position, modulate, text) |
| `value` | any | yes | The value to set (number, string, bool, [x,y] array, {r,g,b,a} object, etc.) |

### `set_node_properties`

Set several properties on a single node in one load/save. Values are type-coerced like set_node_property.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node within the scene |
| `properties` | object | yes | Map of property name -> value |

### `update_property`

Convenience alias of set_node_property: set a single property on a node in a scene and save. Returns the coerced value that was written.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node (relative to the scene root) |
| `property` | string | yes | Name of the property to set |
| `value` | any | yes | New value for the property (coerced to the property type) |

### `delete_node`

Delete a node (and its descendants) from a scene

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node to delete |

### `rename_node`

Rename a node in a scene

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node to rename |
| `newName` | string | yes | The new name for the node |

### `reparent_node`

Move a node to a new parent within the same scene

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node to move |
| `newParentPath` | string | yes | Path to the new parent node |
| `keepGlobalTransform` | boolean | no | Preserve global transform (default true) |

### `move_node`

Reparent a node to a new parent within the scene, preserving its global transform when keepGlobalTransform is true (for Node2D/Node3D/Control). Saves and returns the new node path.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node to move |
| `newParent` | string | yes | Path to the new parent node |
| `keepGlobalTransform` | boolean | no | Preserve the global transform across the move (default: true) |

### `duplicate_node`

Duplicate a node subtree within a scene

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node to duplicate |
| `newName` | string | no | Optional name for the duplicate |

### `reorder_node`

Move a node to a different index among its siblings (controls draw order / child order).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node to move |
| `toIndex` | number | yes | Target sibling index (0-based) |

### `add_to_group`

Add a node to a group (persistent, saved in the scene)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node |
| `group` | string | yes | Group name |

### `remove_from_group`

Remove a node from a group

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node |
| `group` | string | yes | Group name |

### `set_node_groups`

Replace a node's group membership with the provided list (persistent so the groups serialize into the scene), then save. Returns the resulting groups.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node |
| `groups` | array<string> | yes | The full set of groups the node should belong to |

### `set_anchor_preset`

Apply a layout preset to a Control node's anchors only (not offsets), then save. preset is one of top_left ... full_rect. Fails if the node is not a Control.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the Control node |
| `preset` | string | yes | Layout preset name: top_left, top_right, bottom_left, bottom_right, center_left, center_top, center_right, center_bottom, center, left_wide, top_wide, right_wide, bottom_wide, vcenter_wide, hcenter_wide, full_rect |

### `add_resource`

Instantiate a named Resource subclass (e.g. RectangleShape2D, CircleShape2D, GradientTexture1D), apply optional properties, and assign it to a node property, then save. Fails if the class is not a Resource or the property does not exist.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node receiving the resource |
| `property` | string | yes | Name of the node property to assign the resource to |
| `resourceType` | string | yes | Resource subclass name to instantiate (e.g. RectangleShape2D) |
| `properties` | object | no | Optional properties to apply to the new resource |

### `batch_add_nodes`

Add multiple nodes to a scene in a single load/save pass. Each spec has parent (default root), type, name, and optional properties. Returns per-node results and counts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodes` | array<object> | yes | Node specs to create |

### `batch_set_property`

Set one property on many nodes in a single load/save pass. Targets either an explicit nodePaths list or every node matching nodeType (is_class). Returns affected count and node list.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `property` | string | yes | Name of the property to set |
| `value` | any | yes | New value (coerced to the property type) |
| `nodePaths` | array<string> | no | Explicit node paths to update |
| `nodeType` | string | no | Class filter: update every node that is_class(nodeType) |

### `cross_scene_set_property`

Across multiple scenes: set a property on every node matching nodeType (is_class) and save each scene (unless dryRun). Returns per-scene affected counts, totals, and the dry_run flag.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePaths` | array<string> | yes | Project-relative .tscn paths to process |
| `nodeType` | string | yes | Class filter for nodes to update |
| `property` | string | yes | Name of the property to set |
| `value` | any | yes | New value (coerced to the property type) |
| `dryRun` | boolean | no | If true, compute affected nodes without saving (default: false) |

## Scripts & signals

### `create_script`

Create a new GDScript file. Optionally specify extends, class_name, and body.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scriptPath` | string | yes | Path for the new .gd file (relative to project) |
| `extends` | string | no | Base class to extend (default Node) |
| `className` | string | no | Optional class_name to register globally |
| `content` | string | no | Full script content. If provided, extends/className are ignored. |
| `overwrite` | boolean | no | Overwrite if the file already exists (default false) |

### `attach_script`

Attach an existing script to a node in a scene

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node |
| `scriptPath` | string | yes | Path to the .gd script (relative to project) |

### `list_scripts`

List all GDScript (.gd) files in the project (or a subdirectory)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `directory` | string | no | Optional subdirectory (relative to project) to limit the search |

### `read_script`

Read the source of a script file in the project

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scriptPath` | string | yes | Path to the .gd file (relative to project) |

### `edit_script`

Overwrite an existing .gd script file with new content. The file must already exist.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scriptPath` | string | yes | Project-relative path to the existing .gd file |
| `content` | string | yes | New full content for the script |

### `check_script`

Parse/compile-check a GDScript file using Godot --check-only. Returns parse errors/warnings without running the game.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scriptPath` | string | yes | Path to the .gd file to check (relative to project) |

### `validate_script`

Alias of check_script: parse-check a GDScript file headlessly and report whether it is valid along with any compiler output.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scriptPath` | string | yes | Project-relative path to the .gd script to validate |

### `connect_signal`

Persist a signal connection from one node to a method on another node in the same scene

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `fromNode` | string | yes | Path to the emitting node |
| `signalName` | string | yes | Signal name (e.g. pressed, body_entered) |
| `toNode` | string | yes | Path to the receiving node |
| `method` | string | yes | Method name to call on the receiver |

### `disconnect_signal`

Remove a stored signal connection from a scene

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `fromNode` | string | yes | Path to the emitting node |
| `signalName` | string | yes | Signal name |
| `toNode` | string | yes | Path to the receiving node |
| `method` | string | yes | Method name |

### `list_connections`

List all signal connections stored within a scene

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |

### `analyze_signal_flow`

List every signal connection in a scene with the emitting node, signal name, target node and target method (resolved from the live scene tree).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Project-relative path to the .tscn file |

### `find_signal_connections`

List the signal connections declared in a scene file (from node, signal, to node, method, flags) by parsing its [connection] entries.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Project-relative path to the .tscn file |

## Project configuration & resources

### `get_project_setting`

Read a project setting from project.godot

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `setting` | string | yes | Setting key (e.g. application/config/name) |

### `set_project_setting`

Set a project setting in project.godot

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `setting` | string | yes | Setting key (e.g. display/window/size/viewport_width) |
| `value` | any | yes | The value to set |

### `get_project_settings`

Return all project settings (from ProjectSettings), optionally filtered to keys containing a substring.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `filter` | string | no | Optional case-insensitive substring filter on the setting key (e.g. "physics", "display") |

### `set_main_scene`

Set the project main scene (application/run/main_scene)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene to set as main (relative to project) |

### `list_autoloads`

List the autoload singletons configured in the project

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |

### `add_autoload`

Add (or update) an autoload singleton

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `autoloadName` | string | yes | Singleton name (e.g. GameState) |
| `path` | string | yes | Path to the script or scene (relative to project) |
| `enabled` | boolean | no | Enable the singleton (default true) |

### `remove_autoload`

Remove an autoload singleton

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `autoloadName` | string | yes | Singleton name to remove |

### `add_input_action`

Add or extend an input map action with events. Each event: {type:"key", key:"Space"} \| {type:"mouse_button", button_index:1} \| {type:"joypad_button", button_index:0} \| {type:"joypad_motion", axis:0, axis_value:1.0}.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `action` | string | yes | Action name (e.g. jump) |
| `events` | array<object> | yes | Array of event specs |
| `deadzone` | number | no | Deadzone (default 0.5) |
| `replace` | boolean | no | Replace existing events instead of appending (default false) |

### `remove_input_action`

Remove an input map action

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `action` | string | yes | Action name to remove |

### `set_input_action`

Define or replace an input action in the InputMap and persist it to project settings. Each event descriptor is like {type:"key", keycode:"Space"}, {type:"mouse_button", button_index:1}, {type:"joypad_button", button_index:0}, or {type:"joypad_motion", axis:0, axis_value:1.0}. Returns the action and event count.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `action` | string | yes | Name of the input action |
| `events` | array<object> | yes | Event descriptors that define the action |
| `deadzone` | number | no | Optional deadzone (default: 0.5) |

### `get_input_actions`

List the project's input actions and their bound events (from the InputMap). Built-in ui_* actions are excluded unless includeBuiltin is true.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `includeBuiltin` | boolean | no | Include built-in ui_* actions (default false) |

### `create_resource`

Create a new .tres/.res resource of a given class with optional properties (e.g. StandardMaterial3D, custom Resource)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `resourcePath` | string | yes | Path for the new resource (relative to project) |
| `resourceClass` | string | yes | Resource class name (e.g. StandardMaterial3D) |
| `properties` | object | no | Optional initial properties |

### `edit_resource`

Edit properties of an existing resource file

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `resourcePath` | string | yes | Path to the resource (relative to project) |
| `properties` | object | yes | Properties to set |

### `get_resource_properties`

Read the stored properties of a resource file as JSON

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `resourcePath` | string | yes | Path to the resource (relative to project) |

### `read_resource`

Read a resource file. For text resources (.tres/.tscn/.gd/.gdshader/.cfg) returns the file text; for binary resources reports the type and size.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `resourcePath` | string | yes | Project-relative path to the resource file |

### `list_export_presets`

List the export presets defined in export_presets.cfg (name, platform, runnable, export path).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |

### `get_export_info`

Return the full configuration of a single export preset from export_presets.cfg by name.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `presetName` | string | yes | The export preset name |

### `get_android_preset_info`

Return the configuration of the Android export preset from export_presets.cfg (package name, version, keystores, SDK levels, and full options). Defaults to the first Android preset, or pass presetName.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `presetName` | string | no | Specific export preset name (optional; defaults to the first platform="Android" preset) |

## UID management

### `get_uid`

Get the UID for a specific file in a Godot project (for Godot 4.4+)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `filePath` | string | yes | Path to the file (relative to project) for which to get the UID |

### `update_project_uids`

Update UID references in a Godot project by resaving resources (for Godot 4.4+)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |

### `path_to_uid`

Resolve a project file to its resource UID (uid://...). The reverse of get_uid. Requires Godot 4.4+.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `filePath` | string | yes | Path to the file (relative to project) |

### `project_path_to_uid`

Resolve a res:// (or project-relative) resource path to its uid:// identifier. Fails if no UID is assigned.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `path` | string | yes | A res:// or project-relative resource path |

### `uid_to_project_path`

Resolve a uid:// identifier to its res:// resource path. Fails if the UID is unknown.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `uid` | string | yes | A uid:// identifier string |

## Project analysis

### `get_filesystem_tree`

Return the project file/folder hierarchy as a nested tree (directories, files, extensions, sizes). Skips hidden and .import folders.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `subPath` | string | no | Optional project-relative sub-folder to start from (default: project root) |

### `search_files`

Find project files by name substring or simple glob (use * and ?), optionally filtered by extension. Returns matching project-relative paths.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `pattern` | string | yes | Name substring, or glob with * / ? (matched against the relative path) |
| `extension` | string | no | Optional extension filter without the dot (e.g. "gd", "tscn") |
| `maxResults` | number | no | Maximum results to return (default 500) |

### `search_in_files`

Search file contents (grep) across the project for a text query. Returns file/line/text matches. Defaults to text-ish extensions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `query` | string | yes | Text to search for |
| `extensions` | array<string> | no | Extensions to search (default: gd, tscn, tres, cfg, godot, json, md, txt, cs, gdshader) |
| `caseSensitive` | boolean | no | Case-sensitive match (default false) |
| `maxResults` | number | no | Maximum matches to return (default 200) |

### `get_project_statistics`

Summarize the project: counts of scenes, scripts and resources, total script lines, total node instances across scenes, autoloads, and a file-count-by-extension breakdown.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |

### `find_script_references`

Find every place a given script is referenced across scenes, resources, scripts and project.godot. Returns file/line/text matches.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scriptPath` | string | yes | Project-relative path to the script (e.g. player.gd or res://player.gd) |

### `find_node_references`

Find references to a node by name in scripts: get_node("Name"), $Name, %Name and NodePath usages. Returns file/line/text matches.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `nodeName` | string | yes | The node name to search for |

### `find_unused_resources`

Heuristically list resource/asset files (textures, audio, .tres, fonts, meshes, shaders) that are not referenced by any scene, resource, script or project.godot. May report false positives for dynamically-loaded paths.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |

### `detect_circular_dependencies`

Detect circular scene dependencies (scene A instances scene B which instances A ...) by scanning ext_resource references in .tscn files. Returns any cycles found.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |

### `analyze_scene_complexity`

Analyze a scene: total node count, maximum tree depth, node count by class, and number of attached scripts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Project-relative path to the .tscn file |

## TileMap

### `tilemap_set_cell`

Set a single cell on a TileMapLayer (or legacy TileMap) node. sourceId -1 erases the cell. Coordinates are integer cell coordinates; atlasCoords is the tile within the source atlas.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the TileMapLayer/TileMap node within the scene |
| `x` | number | yes | Cell X coordinate |
| `y` | number | yes | Cell Y coordinate |
| `sourceId` | number | no | TileSet source id (default -1, which erases the cell) |
| `atlasCoords` | array<number> | no | Atlas coordinates [ax, ay] within the source (default [0,0]) |
| `alternative` | number | no | Alternative tile id (default 0) |

### `tilemap_fill_rect`

Fill a w x h rectangle of cells on a TileMapLayer (or legacy TileMap) node starting at (x,y) with the given tile. sourceId -1 erases the rectangle.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the TileMapLayer/TileMap node within the scene |
| `x` | number | yes | Top-left cell X coordinate |
| `y` | number | yes | Top-left cell Y coordinate |
| `w` | number | yes | Width in cells |
| `h` | number | yes | Height in cells |
| `sourceId` | number | no | TileSet source id (default -1, which erases the cells) |
| `atlasCoords` | array<number> | no | Atlas coordinates [ax, ay] within the source (default [0,0]) |
| `alternative` | number | no | Alternative tile id (default 0) |

### `tilemap_get_cell`

Read a single cell from a TileMapLayer (or legacy TileMap) node. Returns its source_id, atlas_coords, alternative, and whether it is empty.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the TileMapLayer/TileMap node within the scene |
| `x` | number | yes | Cell X coordinate |
| `y` | number | yes | Cell Y coordinate |

### `tilemap_clear`

Clear all cells on a TileMapLayer (or legacy TileMap) node and save the scene.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the TileMapLayer/TileMap node within the scene |

### `tilemap_get_info`

Read-only summary of a TileMapLayer (or legacy TileMap) node: the TileSet tile size, the number of used cells, and the list of TileSet source ids.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the TileMapLayer/TileMap node within the scene |

### `tilemap_get_used_cells`

Read-only list of all used (non-empty) cells on a TileMapLayer (or legacy TileMap) node, each with its coordinates, source_id, atlas_coords, and alternative.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the TileMapLayer/TileMap node within the scene |

## Animation & AnimationTree

### `create_animation`

Create a value-track Animation on an AnimationPlayer node and store it in one of its libraries. tracks = [{path: "NodePath:property", keys: [{time, value}]}]. Key values may be numbers, strings, or arrays ([x,y]->Vector2, [x,y,z]->Vector3, [r,g,b,a]->Color).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `playerNode` | string | yes | Path to the AnimationPlayer node within the scene |
| `name` | string | yes | Animation name (default new_animation) |
| `tracks` | array<object> | yes | Track specs (see description) |
| `length` | number | no | Animation length in seconds (default 1.0) |
| `loop` | boolean | no | Loop the animation (default false) |
| `library` | string | no | Animation library name (default "") |

### `list_animations`

List the animations stored on an AnimationPlayer node (names and count). Read-only.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationPlayer node within the scene |

### `add_animation_track`

Add a track to an existing animation on an AnimationPlayer and save. trackPath is a NodePath such as "Sprite2D:position". Returns the new track index.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationPlayer node within the scene |
| `animation` | string | yes | Name of the existing animation to modify |
| `trackPath` | string | yes | NodePath of the track target, e.g. "Sprite2D:position" |
| `trackType` | string | no | Track type: value (default), position_3d, rotation_3d, scale_3d, method, bezier, audio, animation |

### `set_animation_keyframe`

Insert a keyframe on a track of an animation and save. Identify the track by trackIndex or trackPath. easing is the optional key transition. Returns the inserted key index.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationPlayer node within the scene |
| `animation` | string | yes | Name of the existing animation to modify |
| `time` | number | yes | Time in seconds at which to insert the key |
| `trackIndex` | number | no | Index of the track to key (alternative to trackPath) |
| `trackPath` | string | no | NodePath of the track to key (alternative to trackIndex) |
| `value` | any | no | Value for the keyframe (coerced to the track target type for value tracks) |
| `easing` | number | no | Optional key transition / easing factor (default 1.0) |

### `get_animation_info`

Read-only details of an animation on an AnimationPlayer: length, loop_mode, step, track_count and per-track {index, path, type, key_count}.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationPlayer node within the scene |
| `animation` | string | yes | Name of the animation to inspect |

### `remove_animation`

Remove a named animation from its AnimationPlayer library and save. Returns removed:true.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationPlayer node within the scene |
| `animation` | string | yes | Name of the animation to remove |

### `create_animation_tree`

Create an AnimationTree node under a parent, set its tree_root (state_machine or blend_tree) and anim_player NodePath, then save. Returns the created node path.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Name for the new AnimationTree node |
| `parentPath` | string | no | Path of the parent node to add under (default scene root) |
| `animPlayer` | string | no | NodePath (relative to the AnimationTree) of an AnimationPlayer |
| `rootType` | string | no | Tree root type: state_machine (default) or blend_tree |

### `get_animation_tree_structure`

Read-only structure of an AnimationTree node: root_type, and for a state machine its state names and transitions, or for a blend tree its sub-node names.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationTree node within the scene |

### `add_state_machine_state`

Add a state node to the state machine root of an AnimationTree and save. stateType selects the sub-node kind; animation states can reference an animation name.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationTree node within the scene |
| `stateName` | string | yes | Name of the new state |
| `stateType` | string | no | State type: animation (default), blend_tree, blend_space_1d, blend_space_2d, state_machine |
| `animation` | string | no | Animation name for an animation state |
| `position` | array<number> | no | Editor position [x, y] (default [0, 0]) |

### `remove_state_machine_state`

Remove a state node from the state machine root of an AnimationTree and save.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationTree node within the scene |
| `stateName` | string | yes | Name of the state to remove |

### `add_state_machine_transition`

Add a transition between two states of a state machine AnimationTree root and save. switchMode (immediate\|sync\|at_end) and advanceMode (disabled\|enabled\|auto) configure the transition.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationTree node within the scene |
| `from` | string | yes | Source state name |
| `to` | string | yes | Destination state name |
| `switchMode` | string | no | Switch mode: immediate (default), sync, at_end |
| `advanceMode` | string | no | Advance mode: disabled, enabled (default), auto |
| `advanceExpression` | string | no | Optional advance expression string |

### `remove_state_machine_transition`

Remove the transition between two states of a state machine AnimationTree root and save.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationTree node within the scene |
| `from` | string | yes | Source state name |
| `to` | string | yes | Destination state name |

### `set_blend_tree_node`

Add or replace a sub-node on a blend tree AnimationTree root and save. btNodeType selects the blend node kind (e.g. animation, blend2, blend3, add2, oneshot, timescale, output).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationTree node within the scene |
| `btNodeName` | string | yes | Name of the blend tree sub-node |
| `btNodeType` | string | yes | Sub-node type: animation, blend2, blend3, add2, add3, oneshot, timescale, timeseek, transition, output |
| `position` | array<number> | no | Editor position [x, y] (default [0, 0]) |

### `set_tree_parameter`

Set a runtime parameter on an AnimationTree (e.g. "conditions/jump" or "Blend2/blend_amount") via parameters/<parameter> and save. Returns the value that was set.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the AnimationTree node within the scene |
| `parameter` | string | yes | Parameter path under parameters/, e.g. "conditions/jump" |
| `value` | any | yes | Value to assign to the parameter |

## Audio

### `add_audio_bus`

Add a new audio bus to the project audio bus layout, set its name and send target, and persist the layout. Returns the new bus index and name.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `name` | string | yes | Name for the new bus |
| `sendBus` | string | no | Name of the bus this bus sends to (default "Master") |

### `set_audio_bus`

Set properties on an existing audio bus (identified by busName or busIndex) and persist the layout. Any of volumeDb, solo, mute, bypassEffects, send may be provided. Returns the bus resulting state.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `busName` | string | no | Name of the bus to modify (alternative to busIndex) |
| `busIndex` | number | no | Index of the bus to modify (alternative to busName) |
| `volumeDb` | number | no | Bus volume in decibels |
| `solo` | boolean | no | Whether the bus is soloed |
| `mute` | boolean | no | Whether the bus is muted |
| `bypassEffects` | boolean | no | Whether the bus bypasses its effects |
| `send` | string | no | Name of the bus this bus sends to |

### `add_audio_bus_effect`

Add an audio effect to a bus (identified by busName or busIndex) and persist the layout. effectType is one of: reverb, chorus, delay, compressor, limiter, distortion, eq, lowpass, highpass, bandpass, amplify, phaser. Returns the effect index and type.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `effectType` | string | yes | Effect type: reverb, chorus, delay, compressor, limiter, distortion, eq, lowpass, highpass, bandpass, amplify, phaser |
| `busName` | string | no | Name of the bus to add the effect to (alternative to busIndex) |
| `busIndex` | number | no | Index of the bus to add the effect to (alternative to busName) |
| `volumeDb` | number | no | Optional amplify volume in dB (amplify effect) |
| `cutoffHz` | number | no | Optional filter cutoff frequency in Hz (filter effects) |
| `wet` | number | no | Optional wet mix (reverb/chorus/delay) |
| `dry` | number | no | Optional dry mix (reverb/chorus) |

### `get_audio_bus_layout`

Read-only listing of every audio bus in the project audio bus layout: index, name, volume_db, solo, mute, bypass_effects, send, and the list of effects (type per effect). Does not modify the layout.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |

### `add_audio_player`

Add an AudioStreamPlayer (or AudioStreamPlayer2D if is2d, AudioStreamPlayer3D if is3d) under parentPath in a scene, configure stream/bus/volume/autoplay, and save the scene. Returns the created node path.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `name` | string | yes | Name for the new audio player node |
| `parentPath` | string | no | Path to the parent node (default: scene root) |
| `stream` | string | no | Optional res:// path to an audio stream resource to assign |
| `bus` | string | no | Target audio bus name (default "Master") |
| `volumeDb` | number | no | Volume in decibels |
| `autoplay` | boolean | no | Whether the player auto-plays on ready |
| `is3d` | boolean | no | Create an AudioStreamPlayer3D |
| `is2d` | boolean | no | Create an AudioStreamPlayer2D |

### `get_audio_info`

Read-only listing of every AudioStreamPlayer/2D/3D node in a scene, each with path, type, stream resource path, bus, volume_db, autoplay, and playing. Does not modify the scene.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |

## Shaders, Themes & UI

### `create_shader`

Create a new .gdshader file in the project. If content is omitted, a minimal valid template for the given shaderType is written. Refuses to overwrite an existing file.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `path` | string | yes | Project-relative path for the new .gdshader file |
| `shaderType` | string | no | Shader type: canvas_item (default), spatial, particles, sky, or fog |
| `content` | string | no | Optional full shader source; if omitted a minimal template is generated |

### `read_shader`

Return the text of a .gdshader file in the project. Read-only.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `path` | string | yes | Project-relative path to the .gdshader file |

### `edit_shader`

Overwrite an existing .gdshader file with new content. The file must already exist.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `path` | string | yes | Project-relative path to the .gdshader file |
| `content` | string | yes | New full shader source to write |

### `assign_shader_material`

Create a ShaderMaterial wrapping the shader at shaderPath and assign it to the node (CanvasItem.material for 2D/Control, GeometryInstance3D.material_override for 3D). Saves the scene.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node within the scene |
| `shaderPath` | string | yes | Project-relative path to the .gdshader to load |

### `set_shader_param`

Set a shader uniform parameter on the ShaderMaterial assigned to a node, then save the scene. Fails if the node has no ShaderMaterial.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node within the scene |
| `param` | string | yes | Name of the shader uniform parameter to set |
| `value` | any | yes | Value to assign (coerced to the appropriate Godot type) |

### `get_shader_params`

List the uniforms (name, type, hint) of a shader. Provide shaderPath to read a shader directly, or scenePath+nodePath to read the shader on a node's ShaderMaterial. Read-only.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | no | Path to the scene file (when reading a node's material) |
| `nodePath` | string | no | Path to the node within the scene (when reading a node's material) |
| `shaderPath` | string | no | Project-relative path to a .gdshader to inspect directly |

### `create_theme`

Create a new empty Theme resource (.tres) at the given project-relative path. Refuses to overwrite an existing file.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `path` | string | yes | Project-relative path for the new .tres theme file |

### `set_theme_color`

Set a named color on a Theme for a given theme type (e.g. Button, Label) and save the resource.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `themePath` | string | yes | Project-relative path to the .tres theme file |
| `name` | string | yes | Color item name (e.g. font_color) |
| `themeType` | string | yes | Theme type the item belongs to (e.g. Button, Label) |
| `color` | any | yes | Color as a hex string (e.g. "#ff8800") or [r,g,b,a] array |

### `set_theme_constant`

Set a named integer constant on a Theme for a given theme type and save the resource.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `themePath` | string | yes | Project-relative path to the .tres theme file |
| `name` | string | yes | Constant item name (e.g. h_separation) |
| `themeType` | string | yes | Theme type the item belongs to (e.g. HBoxContainer) |
| `value` | number | yes | Integer value |

### `set_theme_font_size`

Set a named font size on a Theme for a given theme type and save the resource.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `themePath` | string | yes | Project-relative path to the .tres theme file |
| `name` | string | yes | Font size item name (e.g. font_size) |
| `themeType` | string | yes | Theme type the item belongs to (e.g. Label) |
| `size` | number | yes | Font size in pixels (integer) |

### `set_theme_stylebox`

Create a StyleBox (flat, empty, texture, or line), apply optional properties (e.g. bg_color, content_margin_*, corner_radius_*), set it on a Theme for a given theme type, and save.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `themePath` | string | yes | Project-relative path to the .tres theme file |
| `name` | string | yes | StyleBox item name (e.g. normal, hover) |
| `themeType` | string | yes | Theme type the item belongs to (e.g. Button) |
| `styleboxType` | string | no | StyleBox kind: flat (default), empty, texture, or line |
| `properties` | object | no | Optional map of StyleBox properties to set (coerced to Godot types) |

### `get_theme_info`

List every color, constant, font size, and stylebox item defined in a Theme, grouped by theme type. Read-only.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `themePath` | string | yes | Project-relative path to the .tres theme file |

### `setup_control`

Configure a Control node: apply an anchor layout preset (e.g. full_rect, center, top_wide) and/or horizontal/vertical size flags, then save the scene. Fails if the node is not a Control.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the Control node within the scene |
| `anchorPreset` | string | no | Layout preset name: top_left, top_right, bottom_left, bottom_right, center_left, center_top, center_right, center_bottom, center, left_wide, top_wide, right_wide, bottom_wide, vcenter_wide, hcenter_wide, full_rect |
| `hSizeFlags` | number | no | Horizontal size flags bitmask (Control.SizeFlags) |
| `vSizeFlags` | number | no | Vertical size flags bitmask (Control.SizeFlags) |

## Particles

### `create_particles`

Create a GPUParticles2D (or GPUParticles3D if is3d) node under parentPath with a fresh ParticleProcessMaterial. Sets amount, lifetime, oneShot, and the emission shape, then saves the scene. Returns the created node path.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `name` | string | yes | Name for the new particles node |
| `parentPath` | string | no | Path to the parent node (default: scene root) |
| `is3d` | boolean | no | Create a GPUParticles3D (default false -> GPUParticles2D) |
| `amount` | number | no | Number of particles (default 8) |
| `lifetime` | number | no | Particle lifetime in seconds (default 1.0) |
| `oneShot` | boolean | no | Emit a single burst instead of looping |
| `emissionShape` | string | no | Emission shape: point (default), sphere, sphere_surface, box, or ring |

### `set_particle_material`

Configure a GPUParticles2D/3D node and its ParticleProcessMaterial. Node fields: amount, lifetime, oneShot, emitting. Material fields: explosiveness, randomness, direction, spread, initialVelocityMin/Max, gravity, scaleMin/Max, color, angularVelocityMin/Max, orbitVelocityMin/Max, dampingMin/Max. Creates the process material if missing, then saves. Returns the changed keys.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the GPUParticles2D/3D node |
| `amount` | number | no | Number of particles (node) |
| `lifetime` | number | no | Particle lifetime in seconds (node) |
| `oneShot` | boolean | no | One-shot emission (node) |
| `emitting` | boolean | no | Whether the node is emitting (node) |
| `explosiveness` | number | no | Explosiveness ratio 0..1 (material) |
| `randomness` | number | no | Randomness ratio 0..1 (material) |
| `direction` | array<number> | no | Initial emission direction as [x,y] or [x,y,z] (material) |
| `spread` | number | no | Spread angle in degrees (material) |
| `initialVelocityMin` | number | no | Minimum initial velocity (material) |
| `initialVelocityMax` | number | no | Maximum initial velocity (material) |
| `gravity` | array<number> | no | Gravity vector as [x,y] or [x,y,z] (material) |
| `scaleMin` | number | no | Minimum scale (material) |
| `scaleMax` | number | no | Maximum scale (material) |
| `color` | any | no | Particle color as hex string or [r,g,b,a] array (material) |
| `angularVelocityMin` | number | no | Minimum angular velocity (material) |
| `angularVelocityMax` | number | no | Maximum angular velocity (material) |
| `orbitVelocityMin` | number | no | Minimum orbit velocity (material) |
| `orbitVelocityMax` | number | no | Maximum orbit velocity (material) |
| `dampingMin` | number | no | Minimum damping (material) |
| `dampingMax` | number | no | Maximum damping (material) |

### `set_particle_color_gradient`

Build a Gradient + GradientTexture1D from the given stops and assign it to the particle ParticleProcessMaterial color_ramp, then save the scene. Returns the number of stops applied.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the GPUParticles2D/3D node |
| `stops` | array<object> | yes | Gradient stops, each { offset: 0..1, color: hex string or [r,g,b,a] } |

### `apply_particle_preset`

Apply a tasteful bundle of node and ParticleProcessMaterial settings for a named preset, then save the scene. Returns the preset applied.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the GPUParticles2D/3D node |
| `preset` | string | yes | Preset name: fire, smoke, sparks, explosion, rain, snow, magic, or dust |

### `get_particle_info`

Read-only inspection of a GPUParticles2D/3D node: type, amount, lifetime, one_shot, emitting, and key ParticleProcessMaterial fields. Does not modify the scene.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the GPUParticles2D/3D node |

## Physics

### `setup_physics_body`

Configure an existing physics body or area node (CharacterBody2D/3D, RigidBody2D/3D, StaticBody2D/3D, Area2D/3D). Sets whichever provided properties exist on it (collisionLayer, collisionMask, motionMode, mass, gravityScale, linearDamp, angularDamp, freeze, freezeMode, contactMonitor, maxContactsReported), then saves. Fails if the node is not a physics body/area. Returns changed keys.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the physics body/area node |
| `collisionLayer` | number | no | Collision layer bitmask |
| `collisionMask` | number | no | Collision mask bitmask |
| `motionMode` | string | no | CharacterBody motion mode: grounded or floating |
| `mass` | number | no | RigidBody mass |
| `gravityScale` | number | no | RigidBody gravity scale |
| `linearDamp` | number | no | Linear damping |
| `angularDamp` | number | no | Angular damping |
| `freeze` | boolean | no | RigidBody freeze flag |
| `freezeMode` | string | no | RigidBody freeze mode: static or kinematic |
| `contactMonitor` | boolean | no | RigidBody contact monitoring |
| `maxContactsReported` | number | no | Maximum contacts reported |

### `setup_collision`

Add a CollisionShape2D (or CollisionShape3D if dimension is 3d) child to a body, holding the matching shape resource (rectangle/circle/capsule/segment/polygon for 2d; box/sphere/cylinder/capsule for 3d), set its size/radius/height/points, and oneWayCollision/disabled where applicable. Saves and returns the created shape node path.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the parent body node |
| `shapeType` | string | yes | rectangle, circle, capsule, segment, polygon (2d) or box, sphere, cylinder, capsule (3d) |
| `dimension` | string | no | 2d (default) or 3d |
| `size` | array<number> | no | Size for rectangle/box as [x,y] or [x,y,z] |
| `radius` | number | no | Radius for circle/sphere/capsule/cylinder |
| `height` | number | no | Height for capsule/cylinder |
| `points` | array<array> | no | Points for polygon/segment as [[x,y], ...] |
| `oneWayCollision` | boolean | no | One-way collision (2d CollisionShape2D) |
| `disabled` | boolean | no | Disable the collision shape |

### `add_raycast`

Add a RayCast2D (or RayCast3D if dimension is 3d) node under parentPath, set target_position, collision_mask, and enabled, then save the scene. Returns the created node path.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `name` | string | yes | Name for the new raycast node |
| `parentPath` | string | no | Path to the parent node (default: scene root) |
| `dimension` | string | no | 2d (default) or 3d |
| `targetPosition` | array<number> | no | Target position as [x,y] (default [0,50]) or [x,y,z] |
| `collisionMask` | number | no | Collision mask bitmask |
| `enabled` | boolean | no | Whether the raycast is enabled (default true) |

### `set_physics_layers`

Project-level: assign human-readable names to physics collision layers via layer_names/<2d\|3d>_physics/layer_<n> in ProjectSettings, then save. Returns the names set.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `names` | object | yes | Map of layer number (1..32) to name, e.g. { "1": "world", "2": "player" } |
| `dimension` | string | no | 2d (default) or 3d |

### `get_physics_layers`

Read-only project-level listing of named 2D and 3D physics collision layers from ProjectSettings. Returns the non-empty layer names for both dimensions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |

### `get_collision_info`

Read-only scene op returning a node's collision_layer and collision_mask (if present) plus the decoded active layer numbers. Does not modify the scene.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the node to inspect |

## Navigation & 3D

### `setup_navigation_region`

Add a NavigationRegion2D (with a fresh NavigationPolygon) or NavigationRegion3D (with a fresh NavigationMesh) under parentPath in a scene, optionally set navigationLayers, and save. Returns the created node path.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `name` | string | yes | Name for the new navigation region node |
| `parentPath` | string | no | Path to the parent node (default: scene root) |
| `dimension` | string | no | 2d (default) or 3d |
| `navigationLayers` | number | no | Optional navigation_layers bitmask |

### `bake_navigation_mesh`

Best-effort bake of a NavigationRegion2D/3D node. For a NavigationRegion2D with outlineVertices, builds a NavigationPolygon outline and bakes it. Headless 3D baking needs source geometry and reports baked:false gracefully. Saves the scene if the polygon was modified.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the NavigationRegion2D/3D node within the scene |
| `outlineVertices` | array<array> | no | Optional outline polygon vertices as [[x,y], ...] for a 2D region |

### `setup_navigation_agent`

Add a NavigationAgent2D or NavigationAgent3D under parentPath in a scene, set the provided agent properties, and save. Returns the created node path.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `name` | string | yes | Name for the new navigation agent node |
| `parentPath` | string | no | Path to the parent node (default: scene root) |
| `dimension` | string | no | 2d (default) or 3d |
| `radius` | number | no | Agent radius |
| `maxSpeed` | number | no | Maximum movement speed |
| `pathDesiredDistance` | number | no | Distance to a path point considered reached |
| `targetDesiredDistance` | number | no | Distance to the target considered reached |
| `avoidanceEnabled` | boolean | no | Enable avoidance |
| `navigationLayers` | number | no | Optional navigation_layers bitmask |

### `set_navigation_layers`

Set the navigation_layers bitmask on a NavigationRegion or NavigationAgent node, then save the scene. Fails if the node has no navigation_layers property.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the navigation node within the scene |
| `navigationLayers` | number | yes | navigation_layers bitmask |

### `get_navigation_info`

Read-only scene op that recursively counts NavigationRegion2D/3D and NavigationAgent2D/3D nodes (returning their paths) and lists the project's non-empty 2D/3D navigation layer names. Does not modify the scene.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |

### `add_mesh_instance`

Add a MeshInstance3D with a primitive mesh (box, sphere, cylinder, capsule, plane, prism, or torus) under parentPath in a scene, set size/radius/height where supported, and save. Returns the created node path and mesh type.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `name` | string | yes | Name for the new MeshInstance3D node |
| `parentPath` | string | no | Path to the parent node (default: scene root) |
| `meshType` | string | no | box (default), sphere, cylinder, capsule, plane, prism, or torus |
| `size` | array<number> | no | Optional size as [x,y] or [x,y,z] for meshes that support it |
| `radius` | number | no | Radius for sphere/cylinder/capsule/torus |
| `height` | number | no | Height for cylinder/capsule |

### `set_material_3d`

Create and assign a StandardMaterial3D surface override on a MeshInstance3D, setting albedo color, metallic, and roughness, then save the scene. Fails if the node is not a MeshInstance3D.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `nodePath` | string | yes | Path to the MeshInstance3D node within the scene |
| `surfaceIndex` | number | no | Surface index (default 0) |
| `albedoColor` | any | no | Albedo color as a hex string or [r,g,b(,a)] array |
| `metallic` | number | no | Metallic value 0..1 |
| `roughness` | number | no | Roughness value 0..1 |

### `setup_lighting`

Add a DirectionalLight3D, OmniLight3D, or SpotLight3D under parentPath in a scene. An optional preset (sun, indoor, dramatic) applies tasteful energy/color/rotation; otherwise the provided energy/color are used. Saves the scene.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `parentPath` | string | no | Path to the parent node (default: scene root) |
| `name` | string | no | Optional name for the new light node |
| `lightType` | string | no | directional (default), omni, or spot |
| `preset` | string | no | Optional preset: sun, indoor, or dramatic |
| `energy` | number | no | Light energy |
| `color` | any | no | Light color as a hex string or [r,g,b(,a)] array |

### `setup_environment`

Add a WorldEnvironment node with a new Environment under parentPath in a scene, set its background mode (sky, color, or clear_color), optional clearColor, and enable features (ssao, glow, fog), then save. Returns the created node path.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `parentPath` | string | no | Path to the parent node (default: scene root) |
| `name` | string | no | Name for the new WorldEnvironment node (default "WorldEnvironment") |
| `backgroundMode` | string | no | sky (default), color, or clear_color |
| `features` | array<string> | no | Optional features to enable, e.g. ssao, glow, fog |
| `clearColor` | any | no | Optional background color as a hex string or [r,g,b(,a)] array |

### `setup_camera_3d`

Add a Camera3D under parentPath in a scene, set projection (perspective or orthogonal), fov, position, and current, then save. Returns the created node path.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `parentPath` | string | no | Path to the parent node (default: scene root) |
| `name` | string | no | Name for the new Camera3D node (default "Camera3D") |
| `projection` | string | no | perspective (default) or orthogonal |
| `fov` | number | no | Field of view (perspective) in degrees |
| `position` | array<number> | no | Optional position as [x,y,z] |
| `current` | boolean | no | Make this the current camera |

### `add_gridmap`

Add a GridMap node under parentPath in a scene, optionally assign a MeshLibrary resource and set cell_size, then save. Returns the created node path and whether a MeshLibrary was assigned.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene file |
| `name` | string | yes | Name for the new GridMap node |
| `parentPath` | string | no | Path to the parent node (default: scene root) |
| `meshLibrary` | string | no | Optional res:// path to a MeshLibrary resource |
| `cellSize` | array<number> | no | Optional cell size as [x,y,z] |

## Automated e2e / UAT

### `run_scene_test`

Automated end-to-end / UAT test of a scene. Boots the scene headless (real game loop, no rendering), runs a sequence of steps, and evaluates assertions against live game state. Returns per-assertion pass/fail. Each step is an object with an "action". Driver actions: {action:"wait_frames",frames:N} \| {action:"wait_seconds",seconds:S} \| {action:"press_action",name:"jump",strength:1.0} \| {action:"release_action",name:"jump"} \| {action:"tap_action",name:"jump",frames:2} \| {action:"key",key:"Space",pressed:true} \| {action:"mouse_button",button:1,position:[x,y],pressed:true} \| {action:"mouse_move",position:[x,y]} \| {action:"set_property",node:"Path",property:"x",value:1} \| {action:"call_method",node:"Path",method:"start",args:[]} \| {action:"emit_signal",node:"Path",signal_name:"hit",args:[]} \| {action:"watch_signal",node:"Path",signal_name:"hit"} \| {action:"wait_for_signal",node:"Path",signal_name:"hit",timeout_seconds:2}. Assertion actions: {action:"assert_property",node:"Path",property:"position",op:">",value:{x:0}} (op: ==,!=,>,<,>=,<=; for vectors/colors only the provided components are checked) \| {action:"assert_node_exists",node:"Path",exists:true} \| {action:"assert_in_group",node:"Path",group:"mobs",expected:true} \| {action:"assert_signal_emitted",node:"Path",signal_name:"hit",min_count:1} (requires a prior watch_signal) \| {action:"assert_method_returns",node:"Path",method:"get_score",args:[],op:">=",value:10} \| {action:"assert_node_count",group:"mobs",op:">",value:0}. Node paths are relative to the scene root ("" or "root" = root).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene to test (relative to project) |
| `steps` | array<object> | yes | Ordered list of step objects (see description) |
| `timeoutSeconds` | number | no | Max wall-clock seconds for the whole scenario (default 10) |

### `run_tests`

Run a GUT or GdUnit4 test suite headless and return the pass/fail summary. Auto-detects the framework from the project addons.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `testPath` | string | no | Optional directory or file of tests to run (relative to project, e.g. test/ or res://test) |
| `framework` | string | no | Force a framework (default auto-detect) |

### `capture_scene_screenshot`

EXPERIMENTAL visual UAT: boot a scene with a rendering driver and save a PNG screenshot. Requires a GPU/display or a software rasterizer; may fail in pure-headless CI. Returns the image.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `scenePath` | string | yes | Path to the scene to capture (relative to project) |
| `outputPath` | string | no | Where to save the PNG (relative to project, default user://screenshot.png) |
| `waitFrames` | number | no | Frames to advance before capturing (default 5) |
| `width` | number | no | Viewport width (default from project settings) |
| `height` | number | no | Viewport height (default from project settings) |

### `find_broken_references`

Scan scenes and resources under a directory and report references to files that no longer exist (dangling ext_resource / stale UID paths). A project-wide safety net.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectPath` | string | yes | Path to the Godot project directory |
| `directory` | string | no | Subdirectory to scan (relative to project, default whole project) |

---

_Generated from the server tool schemas. Regenerate after adding or changing tools._
