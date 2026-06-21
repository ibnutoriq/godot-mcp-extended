#!/usr/bin/env -S godot --headless --script
extends SceneTree

# Debug mode flag
var debug_mode = false
# Process exit code: 0 = success, non-zero = failure. Set via fail().
var exit_code = 0

func _init():
    var args = OS.get_cmdline_args()
    
    # Check for debug flag
    debug_mode = "--debug-godot" in args
    
    # Find the script argument and determine the positions of operation and params
    var script_index = args.find("--script")
    if script_index == -1:
        log_error("Could not find --script argument")
        quit(1)
    
    # The operation should be 2 positions after the script path (script_index + 1 is the script path itself)
    var operation_index = script_index + 2
    # The params should be 3 positions after the script path
    var params_index = script_index + 3
    
    if args.size() <= params_index:
        log_error("Usage: godot --headless --script godot_operations.gd <operation> <json_params>")
        log_error("Not enough command-line arguments provided.")
        quit(1)
    
    # Log all arguments for debugging
    log_debug("All arguments: " + str(args))
    log_debug("Script index: " + str(script_index))
    log_debug("Operation index: " + str(operation_index))
    log_debug("Params index: " + str(params_index))
    
    var operation = args[operation_index]
    var params_json = args[params_index]
    
    log_info("Operation: " + operation)
    log_debug("Params JSON: " + params_json)
    
    # Parse JSON using Godot 4.x API
    var json = JSON.new()
    var error = json.parse(params_json)
    var params = null
    
    if error == OK:
        params = json.get_data()
    else:
        log_error("Failed to parse JSON parameters: " + params_json)
        log_error("JSON Error: " + json.get_error_message() + " at line " + str(json.get_error_line()))
        quit(1)
    
    # Note: an empty Dictionary ({}) is falsy in GDScript, so test for null
    # explicitly — operations that take no parameters pass "{}" legitimately.
    if params == null:
        log_error("Failed to parse JSON parameters: " + params_json)
        quit(1)
    
    log_info("Executing operation: " + operation)

    # Async operations need the main loop to keep ticking, so we await them and
    # only quit once the coroutine has fully completed.
    if operation == "run_scene_test":
        await run_scene_test(params)
        quit(exit_code)
        return

    match operation:
        "create_scene":
            create_scene(params)
        "add_node":
            add_node(params)
        "load_sprite":
            load_sprite(params)
        "export_mesh_library":
            export_mesh_library(params)
        "save_scene":
            save_scene(params)
        "get_uid":
            get_uid(params)
        "resave_resources":
            resave_resources(params)
        # --- Phase 1: READ / inspect ---
        "get_scene_tree":
            get_scene_tree(params)
        "get_node_properties":
            get_node_properties(params)
        "get_scene_dependencies":
            get_scene_dependencies(params)
        "describe_class":
            describe_class(params)
        # --- Phase 2: VALIDATE ---
        "validate_scene":
            validate_scene(params)
        # --- Phase 3: EDIT / structural ---
        "set_node_property":
            set_node_property_op(params)
        "delete_node":
            delete_node(params)
        "rename_node":
            rename_node(params)
        "reparent_node":
            reparent_node(params)
        "duplicate_node":
            duplicate_node(params)
        "add_to_group":
            add_to_group_op(params)
        "remove_from_group":
            remove_from_group_op(params)
        # --- Phase 4: BEHAVIOR ---
        "attach_script":
            attach_script(params)
        "connect_signal":
            connect_signal_op(params)
        "disconnect_signal":
            disconnect_signal_op(params)
        "list_connections":
            list_connections(params)
        "instance_scene":
            instance_scene(params)
        # --- Phase 5: PROJECT settings + resources ---
        "get_project_setting":
            get_project_setting_op(params)
        "set_project_setting":
            set_project_setting_op(params)
        "list_autoloads":
            list_autoloads(params)
        "add_autoload":
            add_autoload(params)
        "remove_autoload":
            remove_autoload(params)
        "add_input_action":
            add_input_action(params)
        "remove_input_action":
            remove_input_action(params)
        "create_resource":
            create_resource(params)
        "edit_resource":
            edit_resource(params)
        "get_resource_properties":
            get_resource_properties(params)
        # --- Performance: single-boot multi-op ---
        "batch":
            batch(params)
        "build_scene":
            build_scene(params)
        # --- Capability breadth ---
        "find_nodes":
            find_nodes(params)
        "list_classes":
            list_classes(params)
        "path_to_uid":
            path_to_uid(params)
        "find_broken_references":
            find_broken_references(params)
        "create_animation":
            create_animation(params)
        "set_node_properties":
            set_node_properties(params)
        "reorder_node":
            reorder_node(params)
        # --- Inspection / analysis (engine-backed) ---
        "analyze_scene_complexity":
            analyze_scene_complexity(params)
        "analyze_signal_flow":
            analyze_signal_flow(params)
        "get_project_settings":
            get_project_settings_op(params)
        "get_scene_exports":
            get_scene_exports(params)
        "get_node_groups":
            get_node_groups(params)
        "find_nodes_by_type":
            find_nodes_by_type(params)
        "find_nodes_in_group":
            find_nodes_in_group(params)
        "get_input_actions":
            get_input_actions(params)
        # --- TileMap (TileMapLayer / legacy TileMap) ---
        "tilemap_set_cell":
            tilemap_set_cell(params)
        "tilemap_fill_rect":
            tilemap_fill_rect(params)
        "tilemap_get_cell":
            tilemap_get_cell(params)
        "tilemap_clear":
            tilemap_clear(params)
        "tilemap_get_info":
            tilemap_get_info(params)
        "tilemap_get_used_cells":
            tilemap_get_used_cells(params)
        # --- Animation (AnimationPlayer) ---
        "list_animations":
            list_animations(params)
        "add_animation_track":
            add_animation_track(params)
        "set_animation_keyframe":
            set_animation_keyframe(params)
        "get_animation_info":
            get_animation_info(params)
        "remove_animation":
            remove_animation(params)
        # --- AnimationTree ---
        "create_animation_tree":
            create_animation_tree(params)
        "get_animation_tree_structure":
            get_animation_tree_structure(params)
        "add_state_machine_state":
            add_state_machine_state(params)
        "remove_state_machine_state":
            remove_state_machine_state(params)
        "add_state_machine_transition":
            add_state_machine_transition(params)
        "remove_state_machine_transition":
            remove_state_machine_transition(params)
        "set_blend_tree_node":
            set_blend_tree_node(params)
        "set_tree_parameter":
            set_tree_parameter(params)
        # --- Audio (AudioServer buses + AudioStreamPlayer nodes) ---
        "add_audio_bus":
            add_audio_bus(params)
        "set_audio_bus":
            set_audio_bus(params)
        "add_audio_bus_effect":
            add_audio_bus_effect(params)
        "get_audio_bus_layout":
            get_audio_bus_layout(params)
        "add_audio_player":
            add_audio_player(params)
        "get_audio_info":
            get_audio_info(params)
        "assign_shader_material":
            assign_shader_material(params)
        "set_shader_param":
            set_shader_param(params)
        "get_shader_params":
            get_shader_params(params)
        "create_theme":
            create_theme(params)
        "set_theme_color":
            set_theme_color(params)
        "set_theme_constant":
            set_theme_constant(params)
        "set_theme_font_size":
            set_theme_font_size(params)
        "set_theme_stylebox":
            set_theme_stylebox(params)
        "get_theme_info":
            get_theme_info(params)
        "setup_control":
            setup_control(params)
        "create_particles":
            create_particles(params)
        "set_particle_material":
            set_particle_material(params)
        "set_particle_color_gradient":
            set_particle_color_gradient(params)
        "apply_particle_preset":
            apply_particle_preset(params)
        "get_particle_info":
            get_particle_info(params)
        "setup_physics_body":
            setup_physics_body(params)
        "setup_collision":
            setup_collision(params)
        "set_physics_layers":
            set_physics_layers(params)
        "get_physics_layers":
            get_physics_layers(params)
        "add_raycast":
            add_raycast(params)
        "get_collision_info":
            get_collision_info(params)
        "setup_navigation_region":
            setup_navigation_region(params)
        "bake_navigation_mesh":
            bake_navigation_mesh(params)
        "setup_navigation_agent":
            setup_navigation_agent(params)
        "set_navigation_layers":
            set_navigation_layers(params)
        "get_navigation_info":
            get_navigation_info(params)
        "add_mesh_instance":
            add_mesh_instance(params)
        "setup_lighting":
            setup_lighting(params)
        "set_material_3d":
            set_material_3d(params)
        "setup_environment":
            setup_environment(params)
        "setup_camera_3d":
            setup_camera_3d(params)
        "add_gridmap":
            add_gridmap(params)
        "move_node":
            move_node_op(params)
        "add_resource":
            add_resource_op(params)
        "set_anchor_preset":
            set_anchor_preset_op(params)
        "set_node_groups":
            set_node_groups_op(params)
        "batch_add_nodes":
            batch_add_nodes_op(params)
        "batch_set_property":
            batch_set_property_op(params)
        "cross_scene_set_property":
            cross_scene_set_property_op(params)
        "set_input_action":
            set_input_action_op(params)
        "uid_to_project_path":
            uid_to_project_path_op(params)
        "project_path_to_uid":
            project_path_to_uid_op(params)
        _:
            log_error("Unknown operation: " + operation)
            quit(1)

    quit(exit_code)

# Logging functions
func log_debug(message):
    if debug_mode:
        print("[DEBUG] " + message)

func log_info(message):
    print("[INFO] " + message)

func log_error(message):
    printerr("[ERROR] " + message)

# ---------------------------------------------------------------------------
# Result protocol & shared helpers (added for the extended toolset)
#
# Every new operation reports failure via fail() (sets exit_code = 1 and prints
# a "Failed to ..." line so both the exit code AND the legacy stderr heuristic
# on the server side agree) and returns structured data via emit_result(), which
# prints a single machine-readable line the server parses:
#     __RESULT__<json>
# ---------------------------------------------------------------------------
const RESULT_PREFIX = "__RESULT__"

# When capturing (inside a batch), ops record their result/error into
# _last_result instead of printing, so the batch driver can collect them and
# emit a single aggregate __RESULT__ line.
var _capture = false
var _last_result = null

func fail(message):
    exit_code = 1
    _last_result = {"error": "Failed to " + message}
    if not _capture:
        printerr("[ERROR] Failed to " + message)

# Emit a structured JSON result for the server to parse.
func emit_result(data):
    _last_result = data
    if not _capture:
        print(RESULT_PREFIX + JSON.stringify(data))

# Load a scene file and return its instantiated root, or null on failure.
# Reports a standardized error through fail() so callers can simply bail.
func load_scene_root(scene_path):
    if not ResourceLoader.exists(scene_path):
        fail("load scene: file does not exist: " + scene_path)
        return null
    var packed = load(scene_path)
    if packed == null or not (packed is PackedScene):
        fail("load scene: not a valid PackedScene: " + scene_path)
        return null
    var root = packed.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
    if root == null:
        fail("load scene: could not instantiate: " + scene_path)
        return null
    return root

# Resolve a node within a scene from a user-supplied path. Accepts paths with or
# without a leading "root/" / "root" prefix and treats "" / "." / "root" as the
# root itself. Returns null (without failing) if not found so callers can craft
# a specific error message.
func resolve_node(scene_root, node_path):
    if node_path == null:
        return scene_root
    var p = str(node_path).strip_edges()
    if p == "" or p == "." or p == "root":
        return scene_root
    # Strip a single leading "root/" prefix only (not every occurrence).
    if p.begins_with("root/"):
        p = p.substr(5)
    elif p.begins_with("/root/"):
        p = p.substr(6)
    if p == "":
        return scene_root
    return scene_root.get_node_or_null(NodePath(p))

# Recursively set `owner` on every descendant so PackedScene.pack() keeps the
# whole subtree. The root itself must have a null owner. Instanced children
# (those with a scene_file_path) are owned by the root but NOT recursed into,
# so they serialize as `instance=` rather than being flattened into this scene.
func set_owner_recursive(node, owner_root):
    for child in node.get_children():
        child.owner = owner_root
        if child.scene_file_path == "":
            set_owner_recursive(child, owner_root)

# Pack a (possibly mutated) scene tree and save it, fixing ownership first.
# Returns true on success.
func save_scene_tree(scene_root, save_path):
    set_owner_recursive(scene_root, scene_root)
    var packed = PackedScene.new()
    var pack_err = packed.pack(scene_root)
    if pack_err != OK:
        fail("pack scene (error " + str(pack_err) + ")")
        return false
    var dir = save_path.get_base_dir()
    if dir != "" and not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(dir)):
        DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
    var save_err = ResourceSaver.save(packed, save_path)
    if save_err != OK:
        fail("save scene to " + save_path + " (error " + str(save_err) + ")")
        return false
    return true

# Coerce a JSON-decoded value into the Godot type expected by `obj.prop`.
# JSON only yields bool/int/float/String/Array/Dictionary, so vectors, colors,
# enums, NodePaths and resources need reconstruction. Falls back to the raw
# value when no special handling applies.
func coerce_value(obj, prop, value):
    var prop_type = TYPE_NIL
    var found = false
    for info in obj.get_property_list():
        if info.name == prop:
            prop_type = info.type
            found = true
            break
    # res:// strings always load as resources regardless of declared type.
    if typeof(value) == TYPE_STRING and value.begins_with("res://"):
        var res = load(value)
        if res != null:
            return res
    if not found:
        return value
    match prop_type:
        TYPE_VECTOR2:
            return _to_vec(value, 2, false)
        TYPE_VECTOR2I:
            return _to_vec(value, 2, true)
        TYPE_VECTOR3:
            return _to_vec(value, 3, false)
        TYPE_VECTOR3I:
            return _to_vec(value, 3, true)
        TYPE_VECTOR4:
            return _to_vec(value, 4, false)
        TYPE_COLOR:
            return _to_color(value)
        TYPE_RECT2:
            var a = _num_array(value)
            if a.size() >= 4:
                return Rect2(a[0], a[1], a[2], a[3])
        TYPE_NODE_PATH:
            return NodePath(str(value))
        TYPE_STRING_NAME:
            return StringName(str(value))
        TYPE_INT:
            return int(value)
        TYPE_FLOAT:
            return float(value)
    return value

func _num_array(value):
    var out = []
    if typeof(value) == TYPE_ARRAY:
        for v in value:
            out.append(float(v))
    elif typeof(value) == TYPE_DICTIONARY:
        for key in ["x", "y", "z", "w"]:
            if value.has(key):
                out.append(float(value[key]))
    return out

func _to_vec(value, dim, is_int):
    var a = _num_array(value)
    while a.size() < dim:
        a.append(0)
    if dim == 2:
        return Vector2i(int(a[0]), int(a[1])) if is_int else Vector2(a[0], a[1])
    elif dim == 3:
        return Vector3i(int(a[0]), int(a[1]), int(a[2])) if is_int else Vector3(a[0], a[1], a[2])
    elif dim == 4:
        return Vector4(a[0], a[1], a[2], a[3])
    return value

func _to_color(value):
    if typeof(value) == TYPE_STRING:
        return Color(value)
    var a = _num_array(value)
    if a.size() >= 4:
        return Color(a[0], a[1], a[2], a[3])
    elif a.size() == 3:
        return Color(a[0], a[1], a[2])
    return Color.WHITE

# Serialize a node subtree into a plain dictionary (name, type, path, script,
# groups, children). `from` is the scene root used to compute relative paths.
func node_to_dict(node, from_root):
    var rel = from_root.get_path_to(node)
    var script_path = ""
    var node_script = node.get_script()
    if node_script != null and node_script.resource_path != "":
        script_path = node_script.resource_path
    var data = {
        "name": str(node.name),
        "type": node.get_class(),
        "path": str(rel),
        "script": script_path,
        "groups": node.get_groups(),
        "child_count": node.get_child_count(),
        "children": [],
    }
    for child in node.get_children():
        data["children"].append(node_to_dict(child, from_root))
    return data

# Get a script by registered class name.
# Only looks up names via the project's global class registry. Raw paths
# (e.g. "res://evil.gd") are intentionally not accepted here to prevent
# arbitrary script instantiation from agent-supplied input.
func get_script_by_name(name_of_class):
    if debug_mode:
        print("Attempting to get script for class: " + name_of_class)

    # Search for it in the global class registry if it's a class name
    var global_classes = ProjectSettings.get_global_class_list()
    if debug_mode:
        print("Searching through " + str(global_classes.size()) + " global classes")
    
    for global_class in global_classes:
        var found_name_of_class = global_class["class"]
        var found_path = global_class["path"]
        
        if found_name_of_class == name_of_class:
            if debug_mode:
                print("Found matching class in registry: " + found_name_of_class + " at path: " + found_path)
            var script = load(found_path) as Script
            if script:
                if debug_mode:
                    print("Successfully loaded script from registry")
                return script
            else:
                printerr("Failed to load script from registry path: " + found_path)
                break
    
    printerr("Could not find script for class: " + name_of_class)
    return null

# Instantiate a class by name
func instantiate_class(name_of_class):
    if name_of_class.is_empty():
        printerr("Cannot instantiate class: name is empty")
        return null
    
    var result = null
    if debug_mode:
        print("Attempting to instantiate class: " + name_of_class)
    
    # Check if it's a built-in class
    if ClassDB.class_exists(name_of_class):
        if debug_mode:
            print("Class exists in ClassDB, using ClassDB.instantiate()")
        if ClassDB.can_instantiate(name_of_class):
            result = ClassDB.instantiate(name_of_class)
            if result == null:
                printerr("ClassDB.instantiate() returned null for class: " + name_of_class)
        else:
            printerr("Class exists but cannot be instantiated: " + name_of_class)
            printerr("This may be an abstract class or interface that cannot be directly instantiated")
    else:
        # Try to get the script
        if debug_mode:
            print("Class not found in ClassDB, trying to get script")
        var script = get_script_by_name(name_of_class)
        if script is GDScript:
            if debug_mode:
                print("Found GDScript, creating instance")
            result = script.new()
        else:
            printerr("Failed to get script for class: " + name_of_class)
            return null
    
    if result == null:
        printerr("Failed to instantiate class: " + name_of_class)
    elif debug_mode:
        print("Successfully instantiated class: " + name_of_class + " of type: " + result.get_class())
    
    return result

# Create a new scene with a specified root node type
func create_scene(params):
    print("Creating scene: " + params.scene_path)
    
    # Get project paths and log them for debugging
    var project_res_path = "res://"
    var project_user_path = "user://"
    var global_res_path = ProjectSettings.globalize_path(project_res_path)
    var global_user_path = ProjectSettings.globalize_path(project_user_path)
    
    if debug_mode:
        print("Project paths:")
        print("- res:// path: " + project_res_path)
        print("- user:// path: " + project_user_path)
        print("- Globalized res:// path: " + global_res_path)
        print("- Globalized user:// path: " + global_user_path)
        
        # Print some common environment variables for debugging
        print("Environment variables:")
        var env_vars = ["PATH", "HOME", "USER", "TEMP", "GODOT_PATH"]
        for env_var in env_vars:
            if OS.has_environment(env_var):
                print("  " + env_var + " = " + OS.get_environment(env_var))
    
    # Normalize the scene path
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    # Convert resource path to an absolute path
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    # Get the scene directory paths
    var scene_dir_res = full_scene_path.get_base_dir()
    var scene_dir_abs = absolute_scene_path.get_base_dir()
    if debug_mode:
        print("Scene directory (resource path): " + scene_dir_res)
        print("Scene directory (absolute path): " + scene_dir_abs)
    
    # Only do extensive testing in debug mode
    if debug_mode:
        # Try to create a simple test file in the project root to verify write access
        var initial_test_file_path = "res://godot_mcp_test_write.tmp"
        var initial_test_file = FileAccess.open(initial_test_file_path, FileAccess.WRITE)
        if initial_test_file:
            initial_test_file.store_string("Test write access")
            initial_test_file.close()
            print("Successfully wrote test file to project root: " + initial_test_file_path)
            
            # Verify the test file exists
            var initial_test_file_exists = FileAccess.file_exists(initial_test_file_path)
            print("Test file exists check: " + str(initial_test_file_exists))
            
            # Clean up the test file
            if initial_test_file_exists:
                var remove_error = DirAccess.remove_absolute(ProjectSettings.globalize_path(initial_test_file_path))
                print("Test file removal result: " + str(remove_error))
        else:
            var write_error = FileAccess.get_open_error()
            printerr("Failed to write test file to project root: " + str(write_error))
            printerr("This indicates a serious permission issue with the project directory")
    
    # Use traditional if-else statement for better compatibility
    var root_node_type = "Node2D"  # Default value
    if params.has("root_node_type"):
        root_node_type = params.root_node_type
    if debug_mode:
        print("Root node type: " + root_node_type)
    
    # Create the root node
    var scene_root = instantiate_class(root_node_type)
    if not scene_root:
        printerr("Failed to instantiate node of type: " + root_node_type)
        printerr("Make sure the class exists and can be instantiated")
        printerr("Check if the class is registered in ClassDB or available as a script")
        quit(1)
    
    scene_root.name = "root"
    if debug_mode:
        print("Root node created with name: " + scene_root.name)
    
    # Set the owner of the root node to itself (important for scene saving)
    scene_root.owner = scene_root
    
    # Pack the scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        # Only do extensive testing in debug mode
        if debug_mode:
            # First, let's verify we can write to the project directory
            print("Testing write access to project directory...")
            var test_write_path = "res://test_write_access.tmp"
            var test_write_abs = ProjectSettings.globalize_path(test_write_path)
            var test_file = FileAccess.open(test_write_path, FileAccess.WRITE)
            
            if test_file:
                test_file.store_string("Write test")
                test_file.close()
                print("Successfully wrote test file to project directory")
                
                # Clean up test file
                if FileAccess.file_exists(test_write_path):
                    var remove_error = DirAccess.remove_absolute(test_write_abs)
                    print("Test file removal result: " + str(remove_error))
            else:
                var write_error = FileAccess.get_open_error()
                printerr("Failed to write test file to project directory: " + str(write_error))
                printerr("This may indicate permission issues with the project directory")
                # Continue anyway, as the scene directory might still be writable
        
        # Ensure the scene directory exists using DirAccess
        if debug_mode:
            print("Ensuring scene directory exists...")
        
        # Get the scene directory relative to res://
        var scene_dir_relative = scene_dir_res.substr(6)  # Remove "res://" prefix
        if debug_mode:
            print("Scene directory (relative to res://): " + scene_dir_relative)
        
        # Create the directory if needed
        if not scene_dir_relative.is_empty():
            # First check if it exists
            var dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
            if debug_mode:
                print("Directory exists check (absolute): " + str(dir_exists))
            
            if not dir_exists:
                if debug_mode:
                    print("Directory doesn't exist, creating: " + scene_dir_relative)
                
                # Try to create the directory using DirAccess
                var dir = DirAccess.open("res://")
                if dir == null:
                    var open_error = DirAccess.get_open_error()
                    printerr("Failed to open res:// directory: " + str(open_error))
                    
                    # Try alternative approach with absolute path
                    if debug_mode:
                        print("Trying alternative directory creation approach...")
                    var make_dir_error = DirAccess.make_dir_recursive_absolute(scene_dir_abs)
                    if debug_mode:
                        print("Make directory result (absolute): " + str(make_dir_error))
                    
                    if make_dir_error != OK:
                        printerr("Failed to create directory using absolute path")
                        printerr("Error code: " + str(make_dir_error))
                        quit(1)
                else:
                    # Create the directory using the DirAccess instance
                    if debug_mode:
                        print("Creating directory using DirAccess: " + scene_dir_relative)
                    var make_dir_error = dir.make_dir_recursive(scene_dir_relative)
                    if debug_mode:
                        print("Make directory result: " + str(make_dir_error))
                    
                    if make_dir_error != OK:
                        printerr("Failed to create directory: " + scene_dir_relative)
                        printerr("Error code: " + str(make_dir_error))
                        quit(1)
                
                # Verify the directory was created
                dir_exists = DirAccess.dir_exists_absolute(scene_dir_abs)
                if debug_mode:
                    print("Directory exists check after creation: " + str(dir_exists))
                
                if not dir_exists:
                    printerr("Directory reported as created but does not exist: " + scene_dir_abs)
                    printerr("This may indicate a problem with path resolution or permissions")
                    quit(1)
            elif debug_mode:
                print("Directory already exists: " + scene_dir_abs)
        
        # Save the scene
        if debug_mode:
            print("Saving scene to: " + full_scene_path)
        var save_error = ResourceSaver.save(packed_scene, full_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        
        if save_error == OK:
            # Only do extensive testing in debug mode
            if debug_mode:
                # Wait a moment to ensure file system has time to complete the write
                print("Waiting for file system to complete write operation...")
                OS.delay_msec(500)  # 500ms delay
                
                # Verify the file was actually created using multiple methods
                var file_check_abs = FileAccess.file_exists(absolute_scene_path)
                print("File exists check (absolute path): " + str(file_check_abs))
                
                var file_check_res = FileAccess.file_exists(full_scene_path)
                print("File exists check (resource path): " + str(file_check_res))
                
                var res_exists = ResourceLoader.exists(full_scene_path)
                print("Resource exists check: " + str(res_exists))
                
                # If file doesn't exist by absolute path, try to create a test file in the same directory
                if not file_check_abs and not file_check_res:
                    printerr("Scene file not found after save. Trying to diagnose the issue...")
                    
                    # Try to write a test file to the same directory
                    var test_scene_file_path = scene_dir_res + "/test_scene_file.tmp"
                    var test_scene_file = FileAccess.open(test_scene_file_path, FileAccess.WRITE)
                    
                    if test_scene_file:
                        test_scene_file.store_string("Test scene directory write")
                        test_scene_file.close()
                        print("Successfully wrote test file to scene directory: " + test_scene_file_path)
                        
                        # Check if the test file exists
                        var test_file_exists = FileAccess.file_exists(test_scene_file_path)
                        print("Test file exists: " + str(test_file_exists))
                        
                        if test_file_exists:
                            # Directory is writable, so the issue is with scene saving
                            printerr("Directory is writable but scene file wasn't created.")
                            printerr("This suggests an issue with ResourceSaver.save() or the packed scene.")
                            
                            # Try saving with a different approach
                            print("Trying alternative save approach...")
                            var alt_save_error = ResourceSaver.save(packed_scene, test_scene_file_path + ".tscn")
                            print("Alternative save result: " + str(alt_save_error))
                            
                            # Clean up test files
                            DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path))
                            if alt_save_error == OK:
                                DirAccess.remove_absolute(ProjectSettings.globalize_path(test_scene_file_path + ".tscn"))
                        else:
                            printerr("Test file couldn't be verified. This suggests filesystem access issues.")
                    else:
                        var write_error = FileAccess.get_open_error()
                        printerr("Failed to write test file to scene directory: " + str(write_error))
                        printerr("This confirms there are permission or path issues with the scene directory.")
                    
                    # Return error since we couldn't create the scene file
                    printerr("Failed to create scene: " + params.scene_path)
                    quit(1)
                
                # If we get here, at least one of our file checks passed
                if file_check_abs or file_check_res or res_exists:
                    print("Scene file verified to exist!")
                    
                    # Try to load the scene to verify it's valid
                    var test_load = ResourceLoader.load(full_scene_path)
                    if test_load:
                        print("Scene created and verified successfully at: " + params.scene_path)
                        print("Scene file can be loaded correctly.")
                    else:
                        print("Scene file exists but cannot be loaded. It may be corrupted or incomplete.")
                        # Continue anyway since the file exists
                    
                    print("Scene created successfully at: " + params.scene_path)
                else:
                    printerr("All file existence checks failed despite successful save operation.")
                    printerr("This indicates a serious issue with file system access or path resolution.")
                    quit(1)
            else:
                # In non-debug mode, just check if the file exists
                var file_exists = FileAccess.file_exists(full_scene_path)
                if file_exists:
                    print("Scene created successfully at: " + params.scene_path)
                else:
                    printerr("Failed to create scene: " + params.scene_path)
                    quit(1)
        else:
            # Handle specific error codes
            var error_message = "Failed to save scene. Error code: " + str(save_error)
            
            if save_error == ERR_CANT_CREATE:
                error_message += " (ERR_CANT_CREATE - Cannot create the scene file)"
            elif save_error == ERR_CANT_OPEN:
                error_message += " (ERR_CANT_OPEN - Cannot open the scene file for writing)"
            elif save_error == ERR_FILE_CANT_WRITE:
                error_message += " (ERR_FILE_CANT_WRITE - Cannot write to the scene file)"
            elif save_error == ERR_FILE_NO_PERMISSION:
                error_message += " (ERR_FILE_NO_PERMISSION - No permission to write the scene file)"
            
            printerr(error_message)
            quit(1)
    else:
        printerr("Failed to pack scene: " + str(result))
        printerr("Error code: " + str(result))
        quit(1)

# Add a node to an existing scene
func add_node(params):
    print("Adding node to scene: " + params.scene_path)
    
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    if debug_mode:
        print("Scene path (with res://): " + full_scene_path)
    
    var absolute_scene_path = ProjectSettings.globalize_path(full_scene_path)
    if debug_mode:
        print("Absolute scene path: " + absolute_scene_path)
    
    if not FileAccess.file_exists(absolute_scene_path):
        printerr("Scene file does not exist at: " + absolute_scene_path)
        quit(1)
    
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Use traditional if-else statement for better compatibility
    var parent_path = "root"  # Default value
    if params.has("parent_node_path"):
        parent_path = params.parent_node_path
    if debug_mode:
        print("Parent path: " + parent_path)
    
    var parent = scene_root
    if parent_path != "root":
        parent = scene_root.get_node(parent_path.replace("root/", ""))
        if not parent:
            printerr("Parent node not found: " + parent_path)
            quit(1)
    if debug_mode:
        print("Parent node found: " + parent.name)
    
    if debug_mode:
        print("Instantiating node of type: " + params.node_type)
    var new_node = instantiate_class(params.node_type)
    if not new_node:
        printerr("Failed to instantiate node of type: " + params.node_type)
        printerr("Make sure the class exists and can be instantiated")
        printerr("Check if the class is registered in ClassDB or available as a script")
        quit(1)
    new_node.name = params.node_name
    if debug_mode:
        print("New node created with name: " + new_node.name)
    
    if params.has("properties"):
        if debug_mode:
            print("Setting properties on node")
        var properties = params.properties
        for property in properties:
            if debug_mode:
                print("Setting property: " + property + " = " + str(properties[property]))
            # Coerce JSON values into the property's Godot type so vectors,
            # colors, enums, NodePaths and res:// resources work at creation
            # time (previously only set_node_property did this).
            new_node.set(property, coerce_value(new_node, property, properties[property]))
    
    parent.add_child(new_node)
    new_node.owner = scene_root
    if debug_mode:
        print("Node added to parent and ownership set")
    
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + absolute_scene_path)
        var save_error = ResourceSaver.save(packed_scene, absolute_scene_path)
        if debug_mode:
            print("Save result: " + str(save_error) + " (OK=" + str(OK) + ")")
        if save_error == OK:
            if debug_mode:
                var file_check_after = FileAccess.file_exists(absolute_scene_path)
                print("File exists check after save: " + str(file_check_after))
                if file_check_after:
                    print("Node '" + params.node_name + "' of type '" + params.node_type + "' added successfully")
                else:
                    printerr("File reported as saved but does not exist at: " + absolute_scene_path)
            else:
                print("Node '" + params.node_name + "' of type '" + params.node_type + "' added successfully")
        else:
            printerr("Failed to save scene: " + str(save_error))
    else:
        printerr("Failed to pack scene: " + str(result))

# Load a sprite into a Sprite2D node
func load_sprite(params):
    print("Loading sprite into scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Ensure the texture path starts with res:// for Godot's resource system
    var full_texture_path = params.texture_path
    if not full_texture_path.begins_with("res://"):
        full_texture_path = "res://" + full_texture_path
    
    if debug_mode:
        print("Full texture path (with res://): " + full_texture_path)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Find the sprite node
    var node_path = params.node_path
    if debug_mode:
        print("Original node path: " + node_path)
    
    if node_path.begins_with("root/"):
        node_path = node_path.substr(5)  # Remove "root/" prefix
        if debug_mode:
            print("Node path after removing 'root/' prefix: " + node_path)
    
    var sprite_node = null
    if node_path == "":
        # If no node path, assume root is the sprite
        sprite_node = scene_root
        if debug_mode:
            print("Using root node as sprite node")
    else:
        sprite_node = scene_root.get_node(node_path)
        if sprite_node and debug_mode:
            print("Found sprite node: " + sprite_node.name)
    
    if not sprite_node:
        printerr("Node not found: " + params.node_path)
        quit(1)
    
    # Check if the node is a Sprite2D or compatible type
    if debug_mode:
        print("Node class: " + sprite_node.get_class())
    if not (sprite_node is Sprite2D or sprite_node is Sprite3D or sprite_node is TextureRect):
        printerr("Node is not a sprite-compatible type: " + sprite_node.get_class())
        quit(1)
    
    # Load the texture
    if debug_mode:
        print("Loading texture from: " + full_texture_path)
    var texture = load(full_texture_path)
    if not texture:
        printerr("Failed to load texture: " + full_texture_path)
        quit(1)
    
    if debug_mode:
        print("Texture loaded successfully")
    
    # Set the texture on the sprite
    if sprite_node is Sprite2D or sprite_node is Sprite3D:
        sprite_node.texture = texture
        if debug_mode:
            print("Set texture on Sprite2D/Sprite3D node")
    elif sprite_node is TextureRect:
        sprite_node.texture = texture
        if debug_mode:
            print("Set texture on TextureRect node")
    
    # Save the modified scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + full_scene_path)
        var error = ResourceSaver.save(packed_scene, full_scene_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually updated
            if debug_mode:
                var file_check_after = FileAccess.file_exists(full_scene_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("Sprite loaded successfully with texture: " + full_texture_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(full_scene_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + full_scene_path)
            else:
                print("Sprite loaded successfully with texture: " + full_texture_path)
        else:
            printerr("Failed to save scene: " + str(error))
    else:
        printerr("Failed to pack scene: " + str(result))

# Export a scene as a MeshLibrary resource
func export_mesh_library(params):
    print("Exporting MeshLibrary from scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Ensure the output path starts with res:// for Godot's resource system
    var full_output_path = params.output_path
    if not full_output_path.begins_with("res://"):
        full_output_path = "res://" + full_output_path
    
    if debug_mode:
        print("Full output path (with res://): " + full_output_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Load the scene
    if debug_mode:
        print("Loading scene from: " + full_scene_path)
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Create a new MeshLibrary
    var mesh_library = MeshLibrary.new()
    if debug_mode:
        print("Created new MeshLibrary")
    
    # Get mesh item names if provided
    var mesh_item_names = params.mesh_item_names if params.has("mesh_item_names") else []
    var use_specific_items = mesh_item_names.size() > 0
    
    if debug_mode:
        if use_specific_items:
            print("Using specific mesh items: " + str(mesh_item_names))
        else:
            print("Using all mesh items in the scene")
    
    # Process all child nodes
    var item_id = 0
    if debug_mode:
        print("Processing child nodes...")
    
    for child in scene_root.get_children():
        if debug_mode:
            print("Checking child node: " + child.name)
        
        # Skip if not using all items and this item is not in the list
        if use_specific_items and not (child.name in mesh_item_names):
            if debug_mode:
                print("Skipping node " + child.name + " (not in specified items list)")
            continue
            
        # Check if the child has a mesh
        var mesh_instance = null
        if child is MeshInstance3D:
            mesh_instance = child
            if debug_mode:
                print("Node " + child.name + " is a MeshInstance3D")
        else:
            # Try to find a MeshInstance3D in the child's descendants
            if debug_mode:
                print("Searching for MeshInstance3D in descendants of " + child.name)
            for descendant in child.get_children():
                if descendant is MeshInstance3D:
                    mesh_instance = descendant
                    if debug_mode:
                        print("Found MeshInstance3D in descendant: " + descendant.name)
                    break
        
        if mesh_instance and mesh_instance.mesh:
            if debug_mode:
                print("Adding mesh: " + child.name)
            
            # Add the mesh to the library
            mesh_library.create_item(item_id)
            mesh_library.set_item_name(item_id, child.name)
            mesh_library.set_item_mesh(item_id, mesh_instance.mesh)
            if debug_mode:
                print("Added mesh to library with ID: " + str(item_id))
            
            # Add collision shape if available
            var collision_added = false
            for collision_child in child.get_children():
                if collision_child is CollisionShape3D and collision_child.shape:
                    mesh_library.set_item_shapes(item_id, [collision_child.shape])
                    if debug_mode:
                        print("Added collision shape from: " + collision_child.name)
                    collision_added = true
                    break
            
            if debug_mode and not collision_added:
                print("No collision shape found for mesh: " + child.name)
            
            # Add preview if available
            if mesh_instance.mesh:
                mesh_library.set_item_preview(item_id, mesh_instance.mesh)
                if debug_mode:
                    print("Added preview for mesh: " + child.name)
            
            item_id += 1
        elif debug_mode:
            print("Node " + child.name + " has no valid mesh")
    
    if debug_mode:
        print("Processed " + str(item_id) + " meshes")
    
    # Create directory if it doesn't exist
    var dir = DirAccess.open("res://")
    if dir == null:
        printerr("Failed to open res:// directory")
        printerr("DirAccess error: " + str(DirAccess.get_open_error()))
        quit(1)
        
    var output_dir = full_output_path.get_base_dir()
    if debug_mode:
        print("Output directory: " + output_dir)
    
    if output_dir != "res://" and not dir.dir_exists(output_dir.substr(6)):  # Remove "res://" prefix
        if debug_mode:
            print("Creating directory: " + output_dir)
        var error = dir.make_dir_recursive(output_dir.substr(6))  # Remove "res://" prefix
        if error != OK:
            printerr("Failed to create directory: " + output_dir + ", error: " + str(error))
            quit(1)
    
    # Save the mesh library
    if item_id > 0:
        if debug_mode:
            print("Saving MeshLibrary to: " + full_output_path)
        var error = ResourceSaver.save(mesh_library, full_output_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually created
            if debug_mode:
                var file_check_after = FileAccess.file_exists(full_output_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("MeshLibrary exported successfully with " + str(item_id) + " items to: " + full_output_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(full_output_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + full_output_path)
            else:
                print("MeshLibrary exported successfully with " + str(item_id) + " items to: " + full_output_path)
        else:
            printerr("Failed to save MeshLibrary: " + str(error))
    else:
        printerr("No valid meshes found in the scene")

# Find files with a specific extension recursively
func find_files(path, extension):
    var files = []
    var dir = DirAccess.open(path)
    
    if dir:
        dir.list_dir_begin()
        var file_name = dir.get_next()
        
        while file_name != "":
            if dir.current_is_dir() and not file_name.begins_with("."):
                files.append_array(find_files(path + file_name + "/", extension))
            elif file_name.ends_with(extension):
                files.append(path + file_name)
            
            file_name = dir.get_next()
    
    return files

# Get UID for a specific file
func get_uid(params):
    if not params.has("file_path"):
        printerr("File path is required")
        quit(1)
    
    # Ensure the file path starts with res:// for Godot's resource system
    var file_path = params.file_path
    if not file_path.begins_with("res://"):
        file_path = "res://" + file_path
    
    print("Getting UID for file: " + file_path)
    if debug_mode:
        print("Full file path (with res://): " + file_path)
    
    # Get the absolute path for reference
    var absolute_path = ProjectSettings.globalize_path(file_path)
    if debug_mode:
        print("Absolute file path: " + absolute_path)
    
    # Ensure the file exists
    var file_check = FileAccess.file_exists(file_path)
    if debug_mode:
        print("File exists check: " + str(file_check))
    
    if not file_check:
        printerr("File does not exist at: " + file_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Check if the UID file exists
    var uid_path = file_path + ".uid"
    if debug_mode:
        print("UID file path: " + uid_path)
    
    var uid_check = FileAccess.file_exists(uid_path)
    if debug_mode:
        print("UID file exists check: " + str(uid_check))
    
    var f = FileAccess.open(uid_path, FileAccess.READ)
    
    if f:
        # Read the UID content
        var uid_content = f.get_as_text()
        f.close()
        if debug_mode:
            print("UID content read successfully")
        
        # Return the UID content
        var result = {
            "file": file_path,
            "absolutePath": absolute_path,
            "uid": uid_content.strip_edges(),
            "exists": true
        }
        if debug_mode:
            print("UID result: " + JSON.stringify(result))
        print(JSON.stringify(result))
    else:
        if debug_mode:
            print("UID file does not exist or could not be opened")
        
        # UID file doesn't exist
        var result = {
            "file": file_path,
            "absolutePath": absolute_path,
            "exists": false,
            "message": "UID file does not exist for this file. Use resave_resources to generate UIDs."
        }
        if debug_mode:
            print("UID result: " + JSON.stringify(result))
        print(JSON.stringify(result))

# Resave all resources to update UID references
func resave_resources(params):
    print("Resaving all resources to update UID references...")
    
    # Get project path if provided
    var project_path = "res://"
    if params.has("project_path"):
        project_path = params.project_path
        if not project_path.begins_with("res://"):
            project_path = "res://" + project_path
        if not project_path.ends_with("/"):
            project_path += "/"
    
    if debug_mode:
        print("Using project path: " + project_path)
    
    # Get all .tscn files
    if debug_mode:
        print("Searching for scene files in: " + project_path)
    var scenes = find_files(project_path, ".tscn")
    if debug_mode:
        print("Found " + str(scenes.size()) + " scenes")
    
    # Resave each scene
    var success_count = 0
    var error_count = 0
    
    for scene_path in scenes:
        if debug_mode:
            print("Processing scene: " + scene_path)
        
        # Check if the scene file exists
        var file_check = FileAccess.file_exists(scene_path)
        if debug_mode:
            print("Scene file exists check: " + str(file_check))
        
        if not file_check:
            printerr("Scene file does not exist at: " + scene_path)
            error_count += 1
            continue
        
        # Load the scene
        var scene = load(scene_path)
        if scene:
            if debug_mode:
                print("Scene loaded successfully, saving...")
            var error = ResourceSaver.save(scene, scene_path)
            if debug_mode:
                print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
            
            if error == OK:
                success_count += 1
                if debug_mode:
                    print("Scene saved successfully: " + scene_path)
                
                    # Verify the file was actually updated
                    var file_check_after = FileAccess.file_exists(scene_path)
                    print("File exists check after save: " + str(file_check_after))
                
                    if not file_check_after:
                        printerr("File reported as saved but does not exist at: " + scene_path)
            else:
                error_count += 1
                printerr("Failed to save: " + scene_path + ", error: " + str(error))
        else:
            error_count += 1
            printerr("Failed to load: " + scene_path)
    
    # Get all .gd and .shader files
    if debug_mode:
        print("Searching for script and shader files in: " + project_path)
    var scripts = find_files(project_path, ".gd") + find_files(project_path, ".shader") + find_files(project_path, ".gdshader")
    if debug_mode:
        print("Found " + str(scripts.size()) + " scripts/shaders")
    
    # Check for missing .uid files
    var missing_uids = 0
    var generated_uids = 0
    
    for script_path in scripts:
        if debug_mode:
            print("Checking UID for: " + script_path)
        var uid_path = script_path + ".uid"
        
        var uid_check = FileAccess.file_exists(uid_path)
        if debug_mode:
            print("UID file exists check: " + str(uid_check))
        
        var f = FileAccess.open(uid_path, FileAccess.READ)
        if not f:
            missing_uids += 1
            if debug_mode:
                print("Missing UID file for: " + script_path + ", generating...")
            
            # Force a save to generate UID
            var res = load(script_path)
            if res:
                var error = ResourceSaver.save(res, script_path)
                if debug_mode:
                    print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
                
                if error == OK:
                    generated_uids += 1
                    if debug_mode:
                        print("Generated UID for: " + script_path)
                    
                        # Verify the UID file was actually created
                        var uid_check_after = FileAccess.file_exists(uid_path)
                        print("UID file exists check after save: " + str(uid_check_after))
                    
                        if not uid_check_after:
                            printerr("UID file reported as generated but does not exist at: " + uid_path)
                else:
                    printerr("Failed to generate UID for: " + script_path + ", error: " + str(error))
            else:
                printerr("Failed to load resource: " + script_path)
        elif debug_mode:
            print("UID file already exists for: " + script_path)
    
    if debug_mode:
        print("Summary:")
        print("- Scenes processed: " + str(scenes.size()))
        print("- Scenes successfully saved: " + str(success_count))
        print("- Scenes with errors: " + str(error_count))
        print("- Scripts/shaders missing UIDs: " + str(missing_uids))
        print("- UIDs successfully generated: " + str(generated_uids))
    print("Resave operation complete")

# Save changes to a scene file
func save_scene(params):
    print("Saving scene: " + params.scene_path)
    
    # Ensure the scene path starts with res:// for Godot's resource system
    var full_scene_path = params.scene_path
    if not full_scene_path.begins_with("res://"):
        full_scene_path = "res://" + full_scene_path
    
    if debug_mode:
        print("Full scene path (with res://): " + full_scene_path)
    
    # Check if the scene file exists
    var file_check = FileAccess.file_exists(full_scene_path)
    if debug_mode:
        print("Scene file exists check: " + str(file_check))
    
    if not file_check:
        printerr("Scene file does not exist at: " + full_scene_path)
        # Get the absolute path for reference
        var absolute_path = ProjectSettings.globalize_path(full_scene_path)
        printerr("Absolute file path that doesn't exist: " + absolute_path)
        quit(1)
    
    # Load the scene
    var scene = load(full_scene_path)
    if not scene:
        printerr("Failed to load scene: " + full_scene_path)
        quit(1)
    
    if debug_mode:
        print("Scene loaded successfully")
    
    # Instance the scene
    var scene_root = scene.instantiate()
    if debug_mode:
        print("Scene instantiated")
    
    # Determine save path
    var save_path = params.new_path if params.has("new_path") else full_scene_path
    if params.has("new_path") and not save_path.begins_with("res://"):
        save_path = "res://" + save_path
    
    if debug_mode:
        print("Save path: " + save_path)
    
    # Create directory if it doesn't exist
    if params.has("new_path"):
        var dir = DirAccess.open("res://")
        if dir == null:
            printerr("Failed to open res:// directory")
            printerr("DirAccess error: " + str(DirAccess.get_open_error()))
            quit(1)
            
        var scene_dir = save_path.get_base_dir()
        if debug_mode:
            print("Scene directory: " + scene_dir)
        
        if scene_dir != "res://" and not dir.dir_exists(scene_dir.substr(6)):  # Remove "res://" prefix
            if debug_mode:
                print("Creating directory: " + scene_dir)
            var error = dir.make_dir_recursive(scene_dir.substr(6))  # Remove "res://" prefix
            if error != OK:
                printerr("Failed to create directory: " + scene_dir + ", error: " + str(error))
                quit(1)
    
    # Create a packed scene
    var packed_scene = PackedScene.new()
    var result = packed_scene.pack(scene_root)
    if debug_mode:
        print("Pack result: " + str(result) + " (OK=" + str(OK) + ")")
    
    if result == OK:
        if debug_mode:
            print("Saving scene to: " + save_path)
        var error = ResourceSaver.save(packed_scene, save_path)
        if debug_mode:
            print("Save result: " + str(error) + " (OK=" + str(OK) + ")")
        
        if error == OK:
            # Verify the file was actually created/updated
            if debug_mode:
                var file_check_after = FileAccess.file_exists(save_path)
                print("File exists check after save: " + str(file_check_after))
                
                if file_check_after:
                    print("Scene saved successfully to: " + save_path)
                    # Get the absolute path for reference
                    var absolute_path = ProjectSettings.globalize_path(save_path)
                    print("Absolute file path: " + absolute_path)
                else:
                    printerr("File reported as saved but does not exist at: " + save_path)
            else:
                print("Scene saved successfully to: " + save_path)
        else:
            printerr("Failed to save scene: " + str(error))
    else:
        printerr("Failed to pack scene: " + str(result))

# ===========================================================================
# Extended toolset
# ===========================================================================

func _res_path(p):
    # Normalize a user path to a res:// path.
    if p == null:
        return ""
    var s = str(p)
    if not s.begins_with("res://"):
        s = "res://" + s
    return s

# Convert a Godot Variant into a JSON-serializable value.
func json_safe(value):
    var t = typeof(value)
    match t:
        TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING:
            return value
        TYPE_STRING_NAME, TYPE_NODE_PATH:
            return str(value)
        TYPE_VECTOR2, TYPE_VECTOR2I:
            return {"x": value.x, "y": value.y}
        TYPE_VECTOR3, TYPE_VECTOR3I:
            return {"x": value.x, "y": value.y, "z": value.z}
        TYPE_VECTOR4:
            return {"x": value.x, "y": value.y, "z": value.z, "w": value.w}
        TYPE_COLOR:
            return {"r": value.r, "g": value.g, "b": value.b, "a": value.a}
        TYPE_RECT2, TYPE_RECT2I:
            return {"x": value.position.x, "y": value.position.y, "w": value.size.x, "h": value.size.y}
        TYPE_ARRAY, TYPE_PACKED_INT32_ARRAY, TYPE_PACKED_INT64_ARRAY, TYPE_PACKED_FLOAT32_ARRAY, TYPE_PACKED_FLOAT64_ARRAY, TYPE_PACKED_STRING_ARRAY:
            var arr = []
            for v in value:
                arr.append(json_safe(v))
            return arr
        TYPE_DICTIONARY:
            var d = {}
            for k in value:
                d[str(k)] = json_safe(value[k])
            return d
        TYPE_OBJECT:
            if value == null:
                return null
            if value is Resource and value.resource_path != "":
                return {"__resource__": value.resource_path, "class": value.get_class()}
            return {"__object__": value.get_class()}
        _:
            return str(value)

# --- Phase 1: READ / inspect -----------------------------------------------

func get_scene_tree(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    emit_result({"scene": scene_path, "tree": node_to_dict(root, root)})
    root.free()

func get_node_properties(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.get("node_path", ""))
    if node == null:
        fail("find node at path: " + str(params.get("node_path", "")))
        root.free()
        return
    var mode = params.get("mode", "overrides")  # "overrides" | "effective"
    var props = {}
    for info in node.get_property_list():
        var usage = info.usage
        if not (usage & PROPERTY_USAGE_STORAGE):
            continue
        var pname = info.name
        if pname.begins_with("_") or pname == "script":
            continue
        var value = node.get(pname)
        if mode == "overrides":
            # Skip values equal to the class default to keep the payload small.
            var default = null
            if ClassDB.class_exists(node.get_class()):
                default = ClassDB.class_get_property_default_value(node.get_class(), pname)
            if default != null and value == default:
                continue
        props[pname] = json_safe(value)
    var script_path = ""
    if node.get_script() != null and node.get_script().resource_path != "":
        script_path = node.get_script().resource_path
    emit_result({
        "node": str(params.get("node_path", "")),
        "type": node.get_class(),
        "script": script_path,
        "groups": node.get_groups(),
        "mode": mode,
        "properties": props,
    })
    root.free()

func get_scene_dependencies(params):
    var scene_path = _res_path(params.scene_path)
    if not ResourceLoader.exists(scene_path):
        fail("read dependencies: scene does not exist: " + scene_path)
        return
    var deps = ResourceLoader.get_dependencies(scene_path)
    var out = []
    for d in deps:
        # Dependency strings are "uid::type::path" or "path"; expose the tail path.
        var parts = str(d).split("::")
        var path = parts[parts.size() - 1]
        out.append({"raw": str(d), "path": path, "exists": ResourceLoader.exists(path)})
    emit_result({"scene": scene_path, "dependencies": out})

func describe_class(params):
    var cls = str(params.class_name_query)
    if not ClassDB.class_exists(cls):
        fail("describe class: unknown class: " + cls)
        return
    var prop_list = []
    for info in ClassDB.class_get_property_list(cls, true):
        if info.usage & PROPERTY_USAGE_EDITOR or info.usage & PROPERTY_USAGE_STORAGE:
            prop_list.append({"name": info.name, "type": type_string(info.type)})
    var method_list = []
    for m in ClassDB.class_get_method_list(cls, true):
        method_list.append(m.name)
    var signal_list = []
    for s in ClassDB.class_get_signal_list(cls, true):
        signal_list.append(s.name)
    emit_result({
        "class": cls,
        "inherits": ClassDB.get_parent_class(cls),
        "can_instantiate": ClassDB.can_instantiate(cls),
        "properties": prop_list,
        "methods": method_list,
        "signals": signal_list,
    })

# --- Phase 2: VALIDATE ------------------------------------------------------

func validate_scene(params):
    var scene_path = _res_path(params.scene_path)
    if not ResourceLoader.exists(scene_path):
        fail("validate: scene does not exist: " + scene_path)
        return
    var deps = ResourceLoader.get_dependencies(scene_path)
    var missing = []
    for d in deps:
        var parts = str(d).split("::")
        var path = parts[parts.size() - 1]
        if not ResourceLoader.exists(path):
            missing.append(path)
    var loadable = true
    var packed = load(scene_path)
    if packed == null or not (packed is PackedScene):
        loadable = false
    var instantiable = false
    if loadable:
        var inst = (packed as PackedScene).instantiate()
        if inst != null:
            instantiable = true
            inst.free()
    emit_result({
        "scene": scene_path,
        "loadable": loadable,
        "instantiable": instantiable,
        "missing_dependencies": missing,
        "valid": loadable and instantiable and missing.is_empty(),
    })
    if not (loadable and instantiable and missing.is_empty()):
        fail("validate scene: " + scene_path + " has issues")

# --- Phase 3: EDIT / structural --------------------------------------------

func set_node_property_op(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    var prop = str(params.property)
    var value = coerce_value(node, prop, params.value)
    node.set(prop, value)
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node": str(params.node_path), "property": prop, "set": json_safe(node.get(prop))})
    root.free()

func delete_node(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    if node == root:
        fail("delete node: cannot delete the scene root")
        root.free()
        return
    node.get_parent().remove_child(node)
    node.free()
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "deleted": str(params.node_path)})
    root.free()

func rename_node(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    node.name = str(params.new_name)
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "renamed": str(params.node_path), "new_name": str(node.name)})
    root.free()

func reparent_node(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    var new_parent = resolve_node(root, params.new_parent_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    if new_parent == null:
        fail("find new parent: " + str(params.new_parent_path))
        root.free()
        return
    if node == root:
        fail("reparent: cannot reparent the scene root")
        root.free()
        return
    var keep_transform = params.get("keep_global_transform", true)
    if node is Node2D or node is Node3D or node is Control:
        node.reparent(new_parent, keep_transform)
    else:
        node.get_parent().remove_child(node)
        new_parent.add_child(node)
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "reparented": str(node.name), "new_parent": str(params.new_parent_path)})
    root.free()

func duplicate_node(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    if node == root:
        fail("duplicate: cannot duplicate the scene root")
        root.free()
        return
    var dup = node.duplicate()
    if params.has("new_name") and params.new_name != null:
        dup.name = str(params.new_name)
    node.get_parent().add_child(dup)
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "duplicated": str(params.node_path), "new_name": str(dup.name)})
    root.free()

func add_to_group_op(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    node.add_to_group(str(params.group), true)  # persistent
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node": str(params.node_path), "added_to_group": str(params.group)})
    root.free()

func remove_from_group_op(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    node.remove_from_group(str(params.group))
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node": str(params.node_path), "removed_from_group": str(params.group)})
    root.free()

# --- Phase 4: BEHAVIOR ------------------------------------------------------

func attach_script(params):
    var scene_path = _res_path(params.scene_path)
    var script_path = _res_path(params.script_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    if not ResourceLoader.exists(script_path):
        fail("attach script: script does not exist: " + script_path)
        root.free()
        return
    var script = load(script_path)
    if script == null or not (script is Script):
        fail("attach script: not a valid script: " + script_path)
        root.free()
        return
    node.set_script(script)
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node": str(params.node_path), "script": script_path})
    root.free()

func connect_signal_op(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var from_node = resolve_node(root, params.from_node)
    var to_node = resolve_node(root, params.to_node)
    if from_node == null:
        fail("find from_node: " + str(params.from_node))
        root.free()
        return
    if to_node == null:
        fail("find to_node: " + str(params.to_node))
        root.free()
        return
    var sig = str(params.signal_name)
    var method = str(params.method)
    if not from_node.has_signal(sig):
        fail("connect: node has no signal '" + sig + "'")
        root.free()
        return
    var callable = Callable(to_node, method)
    var flags = int(params.get("flags", CONNECT_PERSIST))
    # Persistent connections are required for the connection to be serialized.
    if not (flags & CONNECT_PERSIST):
        flags |= CONNECT_PERSIST
    var err = from_node.connect(sig, callable, flags)
    if err != OK and err != ERR_INVALID_PARAMETER:
        fail("connect signal (error " + str(err) + ")")
        root.free()
        return
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "from": str(params.from_node), "signal": sig, "to": str(params.to_node), "method": method})
    root.free()

func disconnect_signal_op(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var from_node = resolve_node(root, params.from_node)
    var to_node = resolve_node(root, params.to_node)
    if from_node == null or to_node == null:
        fail("find nodes for disconnect")
        root.free()
        return
    var sig = str(params.signal_name)
    var callable = Callable(to_node, str(params.method))
    if from_node.is_connected(sig, callable):
        from_node.disconnect(sig, callable)
    else:
        fail("disconnect: connection not found")
        root.free()
        return
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "disconnected": sig})
    root.free()

func list_connections(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var conns = []
    _collect_connections(root, root, conns)
    emit_result({"scene": scene_path, "connections": conns})
    root.free()

func _collect_connections(node, scene_root, out):
    for sig in node.get_signal_list():
        for c in node.get_signal_connection_list(sig.name):
            var target = c.callable.get_object()
            if target != null and target is Node and scene_root.is_ancestor_of(target):
                out.append({
                    "from": str(scene_root.get_path_to(node)),
                    "signal": sig.name,
                    "to": str(scene_root.get_path_to(target)),
                    "method": c.callable.get_method(),
                })
    for child in node.get_children():
        _collect_connections(child, scene_root, out)

func instance_scene(params):
    var parent_scene = _res_path(params.scene_path)
    var instanced = _res_path(params.instance_scene_path)
    var root = load_scene_root(parent_scene)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_node_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_node_path", "")))
        root.free()
        return
    if not ResourceLoader.exists(instanced):
        fail("instance: scene does not exist: " + instanced)
        root.free()
        return
    var packed = load(instanced)
    if packed == null or not (packed is PackedScene):
        fail("instance: not a valid PackedScene: " + instanced)
        root.free()
        return
    var child = packed.instantiate()
    if params.has("node_name") and params.node_name != null:
        child.name = str(params.node_name)
    parent.add_child(child)
    if save_scene_tree(root, parent_scene):
        emit_result({"scene": parent_scene, "instanced": instanced, "as": str(child.name), "under": str(params.get("parent_node_path", ""))})
    root.free()

# --- Phase 5: PROJECT settings + resources ---------------------------------

func get_project_setting_op(params):
    var setting = str(params.setting)
    if not ProjectSettings.has_setting(setting):
        emit_result({"setting": setting, "exists": false, "value": null})
        return
    emit_result({"setting": setting, "exists": true, "value": json_safe(ProjectSettings.get_setting(setting))})

func set_project_setting_op(params):
    var setting = str(params.setting)
    ProjectSettings.set_setting(setting, params.value)
    var err = ProjectSettings.save()
    if err != OK:
        fail("save project settings (error " + str(err) + ")")
        return
    emit_result({"setting": setting, "value": json_safe(ProjectSettings.get_setting(setting))})

func list_autoloads(_params):
    var autoloads = []
    for prop in ProjectSettings.get_property_list():
        var aname = str(prop.name)
        if aname.begins_with("autoload/"):
            autoloads.append({"name": aname.substr(9), "value": str(ProjectSettings.get_setting(aname))})
    emit_result({"autoloads": autoloads})

func add_autoload(params):
    var aname = str(params.autoload_name)
    var path = _res_path(params.path)
    var enabled = params.get("enabled", true)
    # A leading "*" marks the autoload as an enabled singleton.
    var value = ("*" if enabled else "") + path
    ProjectSettings.set_setting("autoload/" + aname, value)
    var err = ProjectSettings.save()
    if err != OK:
        fail("save project settings (error " + str(err) + ")")
        return
    emit_result({"autoload": aname, "value": value})

func remove_autoload(params):
    var aname = str(params.autoload_name)
    var key = "autoload/" + aname
    if not ProjectSettings.has_setting(key):
        fail("remove autoload: '" + aname + "' not found")
        return
    ProjectSettings.set_setting(key, null)
    var err = ProjectSettings.save()
    if err != OK:
        fail("save project settings (error " + str(err) + ")")
        return
    emit_result({"removed_autoload": aname})

func _build_input_event(spec):
    var t = str(spec.get("type", "key"))
    match t:
        "key":
            var ev = InputEventKey.new()
            if spec.has("keycode"):
                ev.keycode = int(spec.keycode)
            elif spec.has("key"):
                ev.keycode = OS.find_keycode_from_string(str(spec.key))
            if spec.has("physical_keycode"):
                ev.physical_keycode = int(spec.physical_keycode)
            ev.pressed = true
            return ev
        "mouse_button":
            var ev = InputEventMouseButton.new()
            ev.button_index = int(spec.get("button_index", 1))
            ev.pressed = true
            return ev
        "joypad_button":
            var ev = InputEventJoypadButton.new()
            ev.button_index = int(spec.get("button_index", 0))
            ev.pressed = true
            return ev
        "joypad_motion":
            var ev = InputEventJoypadMotion.new()
            ev.axis = int(spec.get("axis", 0))
            ev.axis_value = float(spec.get("axis_value", 1.0))
            return ev
    return null

func add_input_action(params):
    var action = str(params.action)
    var key = "input/" + action
    var deadzone = float(params.get("deadzone", 0.5))
    var events = []
    # Preserve existing events unless replace is requested.
    if ProjectSettings.has_setting(key) and not params.get("replace", false):
        var existing = ProjectSettings.get_setting(key)
        if existing is Dictionary and existing.has("events"):
            events = existing["events"]
    for spec in params.get("events", []):
        var ev = _build_input_event(spec)
        if ev != null:
            events.append(ev)
    ProjectSettings.set_setting(key, {"deadzone": deadzone, "events": events})
    var err = ProjectSettings.save()
    if err != OK:
        fail("save project settings (error " + str(err) + ")")
        return
    emit_result({"action": action, "event_count": events.size()})

func remove_input_action(params):
    var action = str(params.action)
    var key = "input/" + action
    if not ProjectSettings.has_setting(key):
        fail("remove input action: '" + action + "' not found")
        return
    ProjectSettings.set_setting(key, null)
    var err = ProjectSettings.save()
    if err != OK:
        fail("save project settings (error " + str(err) + ")")
        return
    emit_result({"removed_action": action})

func create_resource(params):
    var res_path = _res_path(params.resource_path)
    var cls = str(params.resource_class)
    var res = instantiate_class(cls)
    if res == null or not (res is Resource):
        fail("create resource: cannot instantiate Resource class: " + cls)
        return
    for prop in params.get("properties", {}):
        var value = coerce_value(res, prop, params.properties[prop])
        res.set(prop, value)
    var dir = res_path.get_base_dir()
    if dir != "" and not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(dir)):
        DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
    var err = ResourceSaver.save(res, res_path)
    if err != OK:
        fail("save resource to " + res_path + " (error " + str(err) + ")")
        return
    emit_result({"resource": res_path, "class": cls})

func edit_resource(params):
    var res_path = _res_path(params.resource_path)
    if not ResourceLoader.exists(res_path):
        fail("edit resource: does not exist: " + res_path)
        return
    var res = load(res_path)
    if res == null or not (res is Resource):
        fail("edit resource: not a valid resource: " + res_path)
        return
    var changed = []
    for prop in params.get("properties", {}):
        var value = coerce_value(res, prop, params.properties[prop])
        res.set(prop, value)
        changed.append(prop)
    var err = ResourceSaver.save(res, res_path)
    if err != OK:
        fail("save resource to " + res_path + " (error " + str(err) + ")")
        return
    emit_result({"resource": res_path, "changed": changed})

func get_resource_properties(params):
    var res_path = _res_path(params.resource_path)
    if not ResourceLoader.exists(res_path):
        fail("get resource: does not exist: " + res_path)
        return
    var res = load(res_path)
    if res == null or not (res is Resource):
        fail("get resource: not a valid resource: " + res_path)
        return
    var props = {}
    for info in res.get_property_list():
        if not (info.usage & PROPERTY_USAGE_STORAGE):
            continue
        var rname = info.name
        if rname.begins_with("_"):
            continue
        props[rname] = json_safe(res.get(rname))
    emit_result({"resource": res_path, "class": res.get_class(), "properties": props})

# ===========================================================================
# Automated e2e / UAT: headless scenario runner
#
# Boots the game's scene inside this SceneTree (no rendering), advances real
# frames, injects synthetic input, drives methods/signals, and evaluates
# assertions against live game state. Each scenario is a list of step dicts;
# results are reported as __RESULT__ with per-assertion pass/fail.
# ===========================================================================

func _e2e_wait_seconds(seconds):
    if seconds <= 0:
        return
    await create_timer(seconds).timeout

func _e2e_compare(actual, expected, op):
    # Vector/struct comparison: only the components present in `expected` are checked.
    if typeof(expected) == TYPE_DICTIONARY:
        var all_ok = true
        for k in expected:
            var sub = actual.get(k) if typeof(actual) == TYPE_DICTIONARY else actual.get(k)
            # For Vector*/Color, component access works via .x/.y/etc through get().
            var av = null
            if typeof(actual) == TYPE_DICTIONARY:
                av = actual.get(k)
            else:
                av = actual.get(k)
            if not _e2e_scalar_compare(av, expected[k], op):
                all_ok = false
        return all_ok
    return _e2e_scalar_compare(actual, expected, op)

func _e2e_scalar_compare(actual, expected, op):
    match op:
        "==":
            return actual == expected or (_is_num(actual) and _is_num(expected) and abs(float(actual) - float(expected)) < 0.0001)
        "!=":
            return not (actual == expected)
        ">":
            return _is_num(actual) and _is_num(expected) and float(actual) > float(expected)
        "<":
            return _is_num(actual) and _is_num(expected) and float(actual) < float(expected)
        ">=":
            return _is_num(actual) and _is_num(expected) and float(actual) >= float(expected)
        "<=":
            return _is_num(actual) and _is_num(expected) and float(actual) <= float(expected)
    return actual == expected

func _is_num(v):
    return typeof(v) == TYPE_INT or typeof(v) == TYPE_FLOAT

func run_scene_test(params):
    var scene_path = _res_path(params.scene_path)
    if not ResourceLoader.exists(scene_path):
        fail("e2e: scene does not exist: " + scene_path)
        return
    var packed = load(scene_path)
    if packed == null or not (packed is PackedScene):
        fail("e2e: not a valid PackedScene: " + scene_path)
        return
    var inst = packed.instantiate()
    if inst == null:
        fail("e2e: could not instantiate scene: " + scene_path)
        return
    get_root().add_child(inst)

    var results = []
    var sig_counts = {}
    var logs = []
    var max_seconds = float(params.get("timeout_seconds", 10))
    var start_ms = Time.get_ticks_msec()

    # Let _ready() run on the whole subtree before the first step.
    await process_frame

    for step in params.get("steps", []):
        if (Time.get_ticks_msec() - start_ms) > max_seconds * 1000:
            logs.append("scenario timeout (" + str(max_seconds) + "s) reached; remaining steps skipped")
            break
        var action = str(step.get("action", ""))
        match action:
            "wait_frames":
                for i in int(step.get("frames", 1)):
                    await process_frame
            "wait_seconds":
                await _e2e_wait_seconds(float(step.get("seconds", 0)))
            "press_action":
                if InputMap.has_action(str(step.get("name", ""))):
                    Input.action_press(str(step.name), float(step.get("strength", 1.0)))
                else:
                    logs.append("press_action: no such action '" + str(step.get("name", "")) + "'")
            "release_action":
                if InputMap.has_action(str(step.get("name", ""))):
                    Input.action_release(str(step.name))
            "tap_action":
                if InputMap.has_action(str(step.get("name", ""))):
                    Input.action_press(str(step.name))
                    for i in int(step.get("frames", 2)):
                        await process_frame
                    Input.action_release(str(step.name))
            "key":
                var kev = InputEventKey.new()
                if step.has("key"):
                    kev.keycode = OS.find_keycode_from_string(str(step.key))
                else:
                    kev.keycode = int(step.get("keycode", 0))
                kev.pressed = step.get("pressed", true)
                Input.parse_input_event(kev)
            "mouse_button":
                var mev = InputEventMouseButton.new()
                mev.button_index = int(step.get("button", 1))
                mev.pressed = step.get("pressed", true)
                if step.has("position"):
                    mev.position = _to_vec(step.position, 2, false)
                Input.parse_input_event(mev)
            "mouse_move":
                var mmev = InputEventMouseMotion.new()
                if step.has("position"):
                    mmev.position = _to_vec(step.position, 2, false)
                Input.parse_input_event(mmev)
            "set_property":
                var n1 = resolve_node(inst, step.get("node", ""))
                if n1 != null:
                    n1.set(str(step.property), coerce_value(n1, str(step.property), step.value))
                else:
                    logs.append("set_property: node not found '" + str(step.get("node", "")) + "'")
            "call_method":
                var n2 = resolve_node(inst, step.get("node", ""))
                if n2 != null and n2.has_method(str(step.method)):
                    n2.callv(str(step.method), step.get("args", []))
                else:
                    logs.append("call_method: node/method not found '" + str(step.get("method", "")) + "'")
            "emit_signal":
                var n3 = resolve_node(inst, step.get("node", ""))
                if n3 != null:
                    n3.callv("emit_signal", [str(step.signal_name)] + step.get("args", []))
            "watch_signal":
                var n4 = resolve_node(inst, step.get("node", ""))
                if n4 != null and n4.has_signal(str(step.signal_name)):
                    var wkey = str(step.get("node", "")) + "|" + str(step.signal_name)
                    if not sig_counts.has(wkey):
                        sig_counts[wkey] = 0
                    var cb = func(_a = 0, _b = 0, _c = 0, _d = 0): sig_counts[wkey] = sig_counts[wkey] + 1
                    n4.connect(str(step.signal_name), cb)
            "wait_for_signal":
                var n5 = resolve_node(inst, step.get("node", ""))
                var got = [false]
                if n5 != null and n5.has_signal(str(step.signal_name)):
                    n5.connect(str(step.signal_name), func(_a = 0, _b = 0, _c = 0, _d = 0): got.set(0, true), CONNECT_ONE_SHOT)
                var to_s = float(step.get("timeout_seconds", 2))
                var w0 = Time.get_ticks_msec()
                while not got[0] and (Time.get_ticks_msec() - w0) < to_s * 1000:
                    await process_frame
                results.append({"assert": "wait_for_signal", "signal": str(step.signal_name), "ok": got[0], "detail": ("received" if got[0] else "timed out after " + str(to_s) + "s")})
            "assert_property":
                var an = resolve_node(inst, step.get("node", ""))
                var aok = false
                var adetail = ""
                if an == null:
                    adetail = "node not found: " + str(step.get("node", ""))
                else:
                    var actual = json_safe(an.get(str(step.property)))
                    aok = _e2e_compare(actual, step.value, str(step.get("op", "==")))
                    adetail = str(step.property) + " " + str(step.get("op", "==")) + " " + str(step.value) + " (actual=" + str(actual) + ")"
                results.append({"assert": "property", "node": str(step.get("node", "")), "ok": aok, "detail": adetail})
            "assert_node_exists":
                var en = resolve_node(inst, step.get("node", ""))
                var expected_exists = step.get("exists", true)
                var eok = (en != null) == expected_exists
                results.append({"assert": "node_exists", "node": str(step.get("node", "")), "ok": eok, "detail": "exists=" + str(en != null) + " expected=" + str(expected_exists)})
            "assert_in_group":
                var gn = resolve_node(inst, step.get("node", ""))
                var expected_in = step.get("expected", true)
                var in_grp = gn != null and gn.is_in_group(str(step.group))
                results.append({"assert": "in_group", "node": str(step.get("node", "")), "ok": in_grp == expected_in, "detail": "in '" + str(step.group) + "'=" + str(in_grp) + " expected=" + str(expected_in)})
            "assert_signal_emitted":
                var skey = str(step.get("node", "")) + "|" + str(step.signal_name)
                var count = sig_counts.get(skey, 0)
                var minc = int(step.get("min_count", 1))
                results.append({"assert": "signal_emitted", "signal": str(step.signal_name), "ok": count >= minc, "detail": "count=" + str(count) + " min=" + str(minc) + " (needs prior watch_signal)"})
            "assert_method_returns":
                var mn = resolve_node(inst, step.get("node", ""))
                var mok = false
                var mdetail = ""
                if mn != null and mn.has_method(str(step.method)):
                    var ret = json_safe(mn.callv(str(step.method), step.get("args", [])))
                    mok = _e2e_compare(ret, step.value, str(step.get("op", "==")))
                    mdetail = str(step.method) + "() " + str(step.get("op", "==")) + " " + str(step.value) + " (returned=" + str(ret) + ")"
                else:
                    mdetail = "method not found: " + str(step.get("method", ""))
                results.append({"assert": "method_returns", "ok": mok, "detail": mdetail})
            "assert_node_count":
                var nodes = get_nodes_in_group(str(step.group))
                var cnt = nodes.size()
                results.append({"assert": "node_count", "ok": _e2e_scalar_compare(cnt, step.value, str(step.get("op", "=="))), "detail": "group '" + str(step.group) + "' count=" + str(cnt) + " " + str(step.get("op", "==")) + " " + str(step.value)})
            _:
                logs.append("unknown step action: '" + action + "'")

    var passed = 0
    var failed = 0
    for r in results:
        if r.get("ok", false):
            passed += 1
        else:
            failed += 1

    if is_instance_valid(inst):
        inst.queue_free()
    await process_frame

    emit_result({
        "scene": scene_path,
        "passed": passed,
        "failed": failed,
        "total": results.size(),
        "all_passed": failed == 0 and results.size() > 0,
        "results": results,
        "log": logs,
    })

# ===========================================================================
# Performance: single-boot multi-operation
#
# Each tool call normally spawns a fresh headless Godot (~1-3s boot). batch and
# build_scene amortize that cost by doing many things inside one process.
# ===========================================================================

# Route a single structured (quit-free) operation by name. Only operations that
# report via fail()/emit_result() (never quit()) are batchable; the legacy ops
# and the async run_scene_test are intentionally excluded.
func _dispatch_structured(op, params):
    match op:
        "get_scene_tree": get_scene_tree(params)
        "get_node_properties": get_node_properties(params)
        "get_scene_dependencies": get_scene_dependencies(params)
        "describe_class": describe_class(params)
        "validate_scene": validate_scene(params)
        "set_node_property": set_node_property_op(params)
        "set_node_properties": set_node_properties(params)
        "delete_node": delete_node(params)
        "rename_node": rename_node(params)
        "reparent_node": reparent_node(params)
        "duplicate_node": duplicate_node(params)
        "reorder_node": reorder_node(params)
        "add_to_group": add_to_group_op(params)
        "remove_from_group": remove_from_group_op(params)
        "attach_script": attach_script(params)
        "connect_signal": connect_signal_op(params)
        "disconnect_signal": disconnect_signal_op(params)
        "list_connections": list_connections(params)
        "instance_scene": instance_scene(params)
        "get_project_setting": get_project_setting_op(params)
        "set_project_setting": set_project_setting_op(params)
        "list_autoloads": list_autoloads(params)
        "add_autoload": add_autoload(params)
        "remove_autoload": remove_autoload(params)
        "add_input_action": add_input_action(params)
        "remove_input_action": remove_input_action(params)
        "create_resource": create_resource(params)
        "edit_resource": edit_resource(params)
        "get_resource_properties": get_resource_properties(params)
        "build_scene": build_scene(params)
        "find_nodes": find_nodes(params)
        "list_classes": list_classes(params)
        "path_to_uid": path_to_uid(params)
        "find_broken_references": find_broken_references(params)
        "create_animation": create_animation(params)
        _:
            fail("batch: unknown or non-batchable operation: " + str(op))

# Run a list of operations in a single process. Each entry is
# {"operation": "...", "params": {...}}. By default the batch stops at the
# first failure; pass "stop_on_error": false to run them all.
func batch(params):
    var ops = params.get("operations", [])
    var stop_on_error = params.get("stop_on_error", true)
    var results = []
    _capture = true
    for idx in ops.size():
        var entry = ops[idx]
        var op = str(entry.get("operation", entry.get("op", "")))
        var p = entry.get("params", {})
        exit_code = 0
        _last_result = null
        _dispatch_structured(op, p)
        var ok = exit_code == 0
        results.append({"index": idx, "operation": op, "ok": ok, "result": _last_result})
        if not ok and stop_on_error:
            break
    _capture = false
    var all_ok = true
    var ran = results.size()
    for r in results:
        if not r["ok"]:
            all_ok = false
    # Process exit code reflects the batch as a whole; per-op status is in the payload.
    exit_code = 0 if all_ok else 1
    emit_result({
        "batch": true,
        "requested": ops.size(),
        "ran": ran,
        "all_ok": all_ok,
        "results": results,
    })

# ---------------------------------------------------------------------------
# build_scene: construct an entire scene tree from a nested spec in one boot.
# spec.root is a node spec; each node spec may carry:
#   type | instance, name, script, properties{}, groups[], children[]
# spec.signals[] = [{from, signal, to, method}] is applied after the tree exists.
# ---------------------------------------------------------------------------
func build_scene(params):
    var scene_path = _res_path(params.scene_path)
    var root_spec = params.get("root", null)
    if root_spec == null or typeof(root_spec) != TYPE_DICTIONARY:
        fail("build_scene: missing 'root' node spec")
        return
    var root = _build_node(root_spec, null)
    if root == null:
        return  # _build_node already called fail()
    if not root_spec.has("name"):
        root.name = "root"
    for sig in params.get("signals", []):
        var fnode = resolve_node(root, sig.get("from", ""))
        var tnode = resolve_node(root, sig.get("to", ""))
        var sname = str(sig.get("signal", sig.get("signal_name", "")))
        if fnode != null and tnode != null and fnode.has_signal(sname):
            fnode.connect(sname, Callable(tnode, str(sig.get("method", ""))), CONNECT_PERSIST)
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node_count": _count_nodes(root)})
    root.free()

func _build_node(spec, parent):
    var node = null
    if spec.has("instance") and spec.instance != null and str(spec.instance) != "":
        var ip = _res_path(spec.instance)
        if not ResourceLoader.exists(ip):
            fail("build_scene: instance scene does not exist: " + ip)
            return null
        var packed = load(ip)
        if packed == null or not (packed is PackedScene):
            fail("build_scene: not a valid PackedScene: " + ip)
            return null
        node = packed.instantiate()
    else:
        var t = str(spec.get("type", "Node"))
        node = instantiate_class(t)
        if node == null:
            fail("build_scene: cannot instantiate type: " + t)
            return null
    if spec.has("name") and spec.name != null:
        node.name = str(spec.name)
    if spec.has("script") and spec.script != null and str(spec.script) != "":
        var sp = _res_path(spec.script)
        if ResourceLoader.exists(sp):
            var scr = load(sp)
            if scr is Script:
                node.set_script(scr)
        else:
            fail("build_scene: script does not exist: " + sp)
            return null
    for prop in spec.get("properties", {}):
        node.set(prop, coerce_value(node, prop, spec.properties[prop]))
    for g in spec.get("groups", []):
        node.add_to_group(str(g), true)
    if parent != null:
        parent.add_child(node)
    for child_spec in spec.get("children", []):
        var c = _build_node(child_spec, node)
        if c == null:
            return null
    return node

func _count_nodes(node):
    var n = 1
    for child in node.get_children():
        n += _count_nodes(child)
    return n

# ===========================================================================
# Capability breadth
# ===========================================================================

# Find nodes in a scene by type (class, inheritance-aware), group and/or a
# wildcard name pattern. Any combination of filters may be supplied.
func find_nodes(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var matches = []
    _find_nodes_rec(root, root, params, matches)
    emit_result({"scene": scene_path, "count": matches.size(), "matches": matches})
    root.free()

func _find_nodes_rec(node, root, params, out):
    var ok = true
    var want_type = str(params.get("type", ""))
    if want_type != "":
        if not (node.is_class(want_type) or node.get_class() == want_type):
            ok = false
    if ok:
        var want_group = str(params.get("group", ""))
        if want_group != "" and not node.is_in_group(want_group):
            ok = false
    if ok:
        var pattern = str(params.get("name_pattern", ""))
        if pattern != "" and not str(node.name).matchn(pattern):
            ok = false
    if ok:
        out.append({
            "path": str(root.get_path_to(node)),
            "name": str(node.name),
            "type": node.get_class(),
            "groups": node.get_groups(),
        })
    for child in node.get_children():
        _find_nodes_rec(child, root, params, out)

# List engine classes from ClassDB, optionally filtered by a name substring
# and/or restricted to descendants of a base class.
func list_classes(params):
    var filter = str(params.get("filter", "")).to_lower()
    var inherits = str(params.get("inherits", ""))
    var out = []
    for c in ClassDB.get_class_list():
        if filter != "" and not c.to_lower().contains(filter):
            continue
        if inherits != "" and not (c == inherits or ClassDB.is_parent_class(c, inherits)):
            continue
        out.append(c)
    out.sort()
    emit_result({"count": out.size(), "filter": str(params.get("filter", "")), "inherits": inherits, "classes": out})

# Resolve a file's resource UID (uid://...) — the reverse of get_uid.
func path_to_uid(params):
    var fp = _res_path(params.file_path)
    if not (ResourceLoader.exists(fp) or FileAccess.file_exists(fp)):
        fail("path_to_uid: file does not exist: " + fp)
        return
    var id = ResourceLoader.get_resource_uid(fp)
    if id == ResourceUID.INVALID_ID:
        emit_result({"file": fp, "exists": true, "uid": null, "message": "No UID assigned. Run update_project_uids to generate one."})
        return
    emit_result({"file": fp, "exists": true, "uid": ResourceUID.id_to_text(id)})

# Scan scenes/resources under a directory and report references to files that
# no longer exist (dangling ext_resource / stale UID paths).
func find_broken_references(params):
    var dir = _res_path(params.get("directory", "res://"))
    if not dir.ends_with("/"):
        dir += "/"
    var files = find_files(dir, ".tscn")
    files.append_array(find_files(dir, ".scn"))
    files.append_array(find_files(dir, ".tres"))
    files.append_array(find_files(dir, ".res"))
    var broken = []
    for f in files:
        for d in ResourceLoader.get_dependencies(f):
            var parts = str(d).split("::")
            var p = parts[parts.size() - 1]
            if p == "":
                continue
            if not (ResourceLoader.exists(p) or FileAccess.file_exists(p)):
                broken.append({"file": f, "missing": p, "raw": str(d)})
    emit_result({"scanned": files.size(), "broken_count": broken.size(), "broken": broken})

# Best-effort JSON->Variant coercion when no declared property type is known
# (used for animation key values).
func _generic_coerce(value):
    if typeof(value) == TYPE_STRING and value.begins_with("res://"):
        var r = load(value)
        if r != null:
            return r
    if typeof(value) == TYPE_ARRAY:
        var a = _num_array(value)
        if a.size() == 2:
            return Vector2(a[0], a[1])
        elif a.size() == 3:
            return Vector3(a[0], a[1], a[2])
        elif a.size() == 4:
            return Color(a[0], a[1], a[2], a[3])
    return value

# Create a value-track Animation on an AnimationPlayer and store it in one of
# its animation libraries. tracks = [{path: "Node:property", keys: [{time,value}]}].
func create_animation(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var player = resolve_node(root, params.get("player_node", ""))
    if player == null or not (player is AnimationPlayer):
        fail("create_animation: AnimationPlayer not found at: " + str(params.get("player_node", "")))
        root.free()
        return
    var anim = Animation.new()
    anim.length = float(params.get("length", 1.0))
    if params.get("loop", false):
        anim.loop_mode = Animation.LOOP_LINEAR
    for track in params.get("tracks", []):
        var ti = anim.add_track(Animation.TYPE_VALUE)
        anim.track_set_path(ti, NodePath(str(track.get("path", ""))))
        for key in track.get("keys", []):
            anim.track_insert_key(ti, float(key.get("time", 0.0)), _generic_coerce(key.get("value")))
    var lib_name = str(params.get("library", ""))
    var lib = null
    if player.has_animation_library(lib_name):
        lib = player.get_animation_library(lib_name)
    else:
        lib = AnimationLibrary.new()
        player.add_animation_library(lib_name, lib)
    var anim_name = str(params.get("name", "new_animation"))
    if lib.has_animation(anim_name):
        lib.remove_animation(anim_name)
    lib.add_animation(anim_name, anim)
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "player": str(params.get("player_node", "")), "animation": anim_name, "tracks": anim.get_track_count(), "length": anim.length})
    root.free()

# Set several properties on one node in a single load/save.
func set_node_properties(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    var changed = []
    for prop in params.get("properties", {}):
        node.set(prop, coerce_value(node, prop, params.properties[prop]))
        changed.append(prop)
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node": str(params.node_path), "set": changed})
    root.free()

# Move a node to a different index among its siblings.
func reorder_node(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null or node == root:
        fail("reorder: node not found or is the scene root: " + str(params.node_path))
        root.free()
        return
    var parent = node.get_parent()
    var idx = int(params.get("to_index", 0))
    idx = clamp(idx, 0, parent.get_child_count() - 1)
    parent.move_child(node, idx)
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node": str(params.node_path), "index": node.get_index()})
    root.free()

# ---------------------------------------------------------------------------
# Inspection / analysis ops (read-only, engine-backed)
# ---------------------------------------------------------------------------

# Count nodes, depth, per-type breakdown and attached scripts for a scene.
func analyze_scene_complexity(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var stats = {"total_nodes": 0, "max_depth": 0, "nodes_by_type": {}, "scripts_attached": 0}
    _analyze_rec(root, 0, stats)
    emit_result({
        "scene": scene_path,
        "total_nodes": stats.total_nodes,
        "max_depth": stats.max_depth,
        "nodes_by_type": stats.nodes_by_type,
        "scripts_attached": stats.scripts_attached,
    })
    root.free()

func _analyze_rec(node, depth, stats):
    stats.total_nodes += 1
    if depth > stats.max_depth:
        stats.max_depth = depth
    var t = node.get_class()
    stats.nodes_by_type[t] = int(stats.nodes_by_type.get(t, 0)) + 1
    if node.get_script() != null:
        stats.scripts_attached += 1
    for child in node.get_children():
        _analyze_rec(child, depth + 1, stats)

# List every signal connection defined in a scene (from -> to, signal, method).
func analyze_signal_flow(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var connections = []
    _signal_flow_rec(root, root, connections)
    emit_result({"scene": scene_path, "count": connections.size(), "connections": connections})
    root.free()

func _signal_flow_rec(node, root, out):
    for sig in node.get_signal_list():
        for c in node.get_signal_connection_list(sig.name):
            var method_name = ""
            var target_path = ""
            if c.has("callable"):
                method_name = str(c.callable.get_method())
                var obj = c.callable.get_object()
                if obj != null and obj is Node:
                    target_path = str(root.get_path_to(obj))
            out.append({
                "from": str(root.get_path_to(node)),
                "signal": str(sig.name),
                "to": target_path,
                "method": method_name,
            })
    for child in node.get_children():
        _signal_flow_rec(child, root, out)

# Return all project settings (optionally filtered by a substring of the key).
func get_project_settings_op(params):
    var filter = str(params.get("filter", ""))
    var out = {}
    for prop in ProjectSettings.get_property_list():
        var name = str(prop.name)
        if name.begins_with("_"):
            continue
        if filter != "" and name.findn(filter) < 0:
            continue
        if ProjectSettings.has_setting(name):
            out[name] = json_safe(ProjectSettings.get_setting(name))
    emit_result({"count": out.size(), "settings": out})

# Return the exported variables of a scene root's script with current values.
func get_scene_exports(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var script = root.get_script()
    var exports = []
    if script != null:
        for prop in script.get_script_property_list():
            if (prop.usage & PROPERTY_USAGE_EDITOR) and (prop.usage & PROPERTY_USAGE_SCRIPT_VARIABLE):
                exports.append({
                    "name": str(prop.name),
                    "type": type_string(prop.type),
                    "value": json_safe(root.get(prop.name)),
                    "hint_string": str(prop.get("hint_string", "")),
                })
    emit_result({"scene": scene_path, "root_type": root.get_class(), "exports": exports})
    root.free()

# Return the groups a node belongs to.
func get_node_groups(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    var groups = []
    for g in node.get_groups():
        groups.append(str(g))
    emit_result({"scene": scene_path, "node": str(params.node_path), "groups": groups})
    root.free()

# Find nodes of a given class (including subclasses) within a scene.
func find_nodes_by_type(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var want = str(params.type)
    var matches = []
    _find_by_type_rec(root, root, want, matches)
    emit_result({"scene": scene_path, "type": want, "count": matches.size(), "matches": matches})
    root.free()

func _find_by_type_rec(node, root, want, out):
    if node.is_class(want) or node.get_class() == want:
        out.append({"name": str(node.name), "path": str(root.get_path_to(node)), "type": node.get_class()})
    for child in node.get_children():
        _find_by_type_rec(child, root, want, out)

# Find nodes that belong to a given group within a scene.
func find_nodes_in_group(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var group = str(params.group)
    var matches = []
    _find_in_group_rec(root, root, group, matches)
    emit_result({"scene": scene_path, "group": group, "count": matches.size(), "matches": matches})
    root.free()

func _find_in_group_rec(node, root, group, out):
    if node.is_in_group(group):
        out.append({"name": str(node.name), "path": str(root.get_path_to(node)), "type": node.get_class()})
    for child in node.get_children():
        _find_in_group_rec(child, root, group, out)

# List the project's input actions and their bound events.
func get_input_actions(params):
    var include_builtin = bool(params.get("include_builtin", false))
    var actions = []
    for a in InputMap.get_actions():
        var name = str(a)
        if not include_builtin and name.begins_with("ui_"):
            continue
        var events = []
        for ev in InputMap.action_get_events(a):
            events.append(ev.as_text())
        actions.append({"name": name, "deadzone": InputMap.action_get_deadzone(a), "events": events})
    emit_result({"count": actions.size(), "actions": actions})

# --- TileMap (TileMapLayer / legacy TileMap) -------------------------------
#
# These ops operate on Godot 4 TileMapLayer nodes and also support the legacy
# TileMap node. The two differ: TileMap's per-cell methods take a leading
# `layer` argument (we use layer 0), while TileMapLayer's do not. We detect the
# node class once and branch accordingly so a single op handles both.

# Returns "TileMapLayer", "TileMap", or "" if the node is neither.
func _tilemap_kind(node):
    if node.is_class("TileMapLayer"):
        return "TileMapLayer"
    if node.is_class("TileMap"):
        return "TileMap"
    return ""

# Build a Vector2i from a params field that may be an int x/y pair.
func _cell_coords(params):
    return Vector2i(int(params.x), int(params.y))

# Read an [ax, ay] atlas array into a Vector2i (defaults to (0,0)).
func _atlas_coords(value):
    var a = _num_array(value)
    while a.size() < 2:
        a.append(0)
    return Vector2i(int(a[0]), int(a[1]))

# Resolve a TileMapLayer/TileMap node from params, failing with a clear message
# otherwise. Returns null on any failure (the scene root is freed by the caller).
func _resolve_tilemap(root, params):
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        return null
    if _tilemap_kind(node) == "":
        fail("node is not a TileMap/TileMapLayer: " + str(params.node_path))
        return null
    return node

# Set a cell, abstracting over the TileMap (layer arg) / TileMapLayer signatures.
func _tm_set_cell(node, kind, coords, source_id, atlas, alternative):
    if kind == "TileMap":
        node.set_cell(0, coords, source_id, atlas, alternative)
    else:
        node.set_cell(coords, source_id, atlas, alternative)

func _tm_get_used_cells(node, kind):
    if kind == "TileMap":
        return node.get_used_cells(0)
    return node.get_used_cells()

func _tm_cell_dict(node, kind, coords):
    var source_id
    var atlas
    var alternative
    if kind == "TileMap":
        source_id = node.get_cell_source_id(0, coords)
        atlas = node.get_cell_atlas_coords(0, coords)
        alternative = node.get_cell_alternative_tile(0, coords)
    else:
        source_id = node.get_cell_source_id(coords)
        atlas = node.get_cell_atlas_coords(coords)
        alternative = node.get_cell_alternative_tile(coords)
    return {
        "x": coords.x,
        "y": coords.y,
        "source_id": source_id,
        "atlas_coords": {"x": atlas.x, "y": atlas.y},
        "alternative": alternative,
        "empty": source_id == -1,
    }

func tilemap_set_cell(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = _resolve_tilemap(root, params)
    if node == null:
        root.free()
        return
    var kind = _tilemap_kind(node)
    var coords = _cell_coords(params)
    var source_id = int(params.get("source_id", -1))
    # Source id -1 erases the cell; use Godot's canonical erase atlas in that case.
    var atlas = Vector2i(-1, -1) if source_id == -1 else _atlas_coords(params.get("atlas_coords", [0, 0]))
    var alternative = int(params.get("alternative", 0))
    _tm_set_cell(node, kind, coords, source_id, atlas, alternative)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "cell": {"x": coords.x, "y": coords.y},
            "source_id": source_id,
            "erased": source_id == -1,
        })
    root.free()

func tilemap_fill_rect(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = _resolve_tilemap(root, params)
    if node == null:
        root.free()
        return
    var kind = _tilemap_kind(node)
    var ox = int(params.x)
    var oy = int(params.y)
    var w = int(params.w)
    var h = int(params.h)
    var source_id = int(params.get("source_id", -1))
    var atlas = Vector2i(-1, -1) if source_id == -1 else _atlas_coords(params.get("atlas_coords", [0, 0]))
    var alternative = int(params.get("alternative", 0))
    var filled = 0
    for dy in range(max(0, h)):
        for dx in range(max(0, w)):
            _tm_set_cell(node, kind, Vector2i(ox + dx, oy + dy), source_id, atlas, alternative)
            filled += 1
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "rect": {"x": ox, "y": oy, "w": w, "h": h},
            "source_id": source_id,
            "filled": filled,
        })
    root.free()

func tilemap_get_cell(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = _resolve_tilemap(root, params)
    if node == null:
        root.free()
        return
    var kind = _tilemap_kind(node)
    var coords = _cell_coords(params)
    emit_result(_tm_cell_dict(node, kind, coords))
    root.free()

func tilemap_clear(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = _resolve_tilemap(root, params)
    if node == null:
        root.free()
        return
    node.clear()
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node": str(params.node_path), "cleared": true})
    root.free()

func tilemap_get_info(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = _resolve_tilemap(root, params)
    if node == null:
        root.free()
        return
    var kind = _tilemap_kind(node)
    var tile_set = node.tile_set
    var tile_size = null
    var source_ids = []
    if tile_set != null:
        var ts = tile_set.tile_size
        tile_size = {"x": ts.x, "y": ts.y}
        for i in range(tile_set.get_source_count()):
            source_ids.append(tile_set.get_source_id(i))
    emit_result({
        "scene": scene_path,
        "node": str(params.node_path),
        "class": kind,
        "tile_size": tile_size,
        "used_cells": _tm_get_used_cells(node, kind).size(),
        "source_ids": source_ids,
    })
    root.free()

func tilemap_get_used_cells(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = _resolve_tilemap(root, params)
    if node == null:
        root.free()
        return
    var kind = _tilemap_kind(node)
    var cells = []
    for coords in _tm_get_used_cells(node, kind):
        cells.append(_tm_cell_dict(node, kind, coords))
    emit_result({
        "scene": scene_path,
        "node": str(params.node_path),
        "count": cells.size(),
        "cells": cells,
    })
    root.free()

# ---------------------------------------------------------------------------
# Animation ops (operate on AnimationPlayer nodes)
# ---------------------------------------------------------------------------

# Resolve an AnimationPlayer from params, failing with a clear message otherwise.
# Returns null on failure (the caller is responsible for freeing the scene root).
func _resolve_anim_player(root, params):
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        return null
    if not (node is AnimationPlayer):
        fail("node is not an AnimationPlayer: " + str(params.node_path))
        return null
    return node

# Map a track-type string to an Animation.TYPE_* constant. Defaults to value.
func _anim_track_type(type_name):
    match str(type_name).to_lower():
        "value":
            return Animation.TYPE_VALUE
        "position_3d":
            return Animation.TYPE_POSITION_3D
        "rotation_3d":
            return Animation.TYPE_ROTATION_3D
        "scale_3d":
            return Animation.TYPE_SCALE_3D
        "blend_shape":
            return Animation.TYPE_BLEND_SHAPE
        "method":
            return Animation.TYPE_METHOD
        "bezier":
            return Animation.TYPE_BEZIER
        "audio":
            return Animation.TYPE_AUDIO
        "animation":
            return Animation.TYPE_ANIMATION
        _:
            return Animation.TYPE_VALUE

# Reverse mapping: Animation.TYPE_* -> readable string.
func _anim_track_type_name(t):
    match t:
        Animation.TYPE_VALUE:
            return "value"
        Animation.TYPE_POSITION_3D:
            return "position_3d"
        Animation.TYPE_ROTATION_3D:
            return "rotation_3d"
        Animation.TYPE_SCALE_3D:
            return "scale_3d"
        Animation.TYPE_BLEND_SHAPE:
            return "blend_shape"
        Animation.TYPE_METHOD:
            return "method"
        Animation.TYPE_BEZIER:
            return "bezier"
        Animation.TYPE_AUDIO:
            return "audio"
        Animation.TYPE_ANIMATION:
            return "animation"
        _:
            return str(t)

# List the animations stored on an AnimationPlayer (read-only).
func list_animations(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var player = _resolve_anim_player(root, params)
    if player == null:
        root.free()
        return
    var names = []
    for n in player.get_animation_list():
        names.append(str(n))
    emit_result({
        "scene": scene_path,
        "node": str(params.node_path),
        "animations": names,
        "count": names.size(),
    })
    root.free()

# Add a track to an existing animation and save.
func add_animation_track(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var player = _resolve_anim_player(root, params)
    if player == null:
        root.free()
        return
    var anim_name = str(params.animation)
    if not player.has_animation(anim_name):
        fail("animation not found on player: " + anim_name)
        root.free()
        return
    var anim = player.get_animation(anim_name)
    var track_type = _anim_track_type(params.get("track_type", "value"))
    var ti = anim.add_track(track_type)
    anim.track_set_path(ti, NodePath(str(params.track_path)))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "animation": anim_name,
            "track_index": ti,
            "track_path": str(params.track_path),
            "track_type": _anim_track_type_name(track_type),
        })
    root.free()

# Insert a keyframe on a track (by index or path) and save.
func set_animation_keyframe(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var player = _resolve_anim_player(root, params)
    if player == null:
        root.free()
        return
    var anim_name = str(params.animation)
    if not player.has_animation(anim_name):
        fail("animation not found on player: " + anim_name)
        root.free()
        return
    var anim = player.get_animation(anim_name)
    var ti = -1
    if params.has("track_index"):
        ti = int(params.track_index)
    elif params.has("track_path"):
        ti = anim.find_track(NodePath(str(params.track_path)), Animation.TYPE_VALUE)
        if ti < 0:
            # Fall back to a path match against any track type.
            for i in range(anim.get_track_count()):
                if str(anim.track_get_path(i)) == str(params.track_path):
                    ti = i
                    break
    if ti < 0 or ti >= anim.get_track_count():
        fail("track not found in animation '" + anim_name + "'")
        root.free()
        return
    var time = float(params.get("time", 0.0))
    var raw_value = params.get("value", null)
    var key_value = _coerce_track_value(player, anim, ti, raw_value)
    var easing = float(params.get("easing", 1.0))
    anim.track_insert_key(ti, time, key_value, easing)
    var key_index = anim.track_find_key(ti, time, Animation.FIND_MODE_APPROX)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "animation": anim_name,
            "track_index": ti,
            "time": time,
            "key_index": key_index,
        })
    root.free()

# Coerce a JSON keyframe value into the type the track expects. For value tracks
# we resolve the target node + property and reuse coerce_value; otherwise we fall
# back to the generic numeric-array coercion.
func _coerce_track_value(player, anim, track_index, raw_value):
    if anim.track_get_type(track_index) == Animation.TYPE_VALUE:
        var path = anim.track_get_path(track_index)
        var sub = str(path.get_concatenated_subnames())
        if sub != "":
            # Track node paths are resolved relative to the player's root node
            # (defaults to the player's parent), not the player itself.
            var base = player.get_node_or_null(player.root_node)
            if base != null:
                var target = base.get_node_or_null(NodePath(str(path.get_concatenated_names())))
                if target != null:
                    return coerce_value(target, sub, raw_value)
    return _generic_coerce(raw_value)

# Read-only details of an animation: length, loop mode, step, and tracks.
func get_animation_info(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var player = _resolve_anim_player(root, params)
    if player == null:
        root.free()
        return
    var anim_name = str(params.animation)
    if not player.has_animation(anim_name):
        fail("animation not found on player: " + anim_name)
        root.free()
        return
    var anim = player.get_animation(anim_name)
    var tracks = []
    for i in range(anim.get_track_count()):
        tracks.append({
            "index": i,
            "path": str(anim.track_get_path(i)),
            "type": _anim_track_type_name(anim.track_get_type(i)),
            "key_count": anim.track_get_key_count(i),
        })
    emit_result({
        "scene": scene_path,
        "node": str(params.node_path),
        "animation": anim_name,
        "length": anim.length,
        "loop_mode": int(anim.loop_mode),
        "step": anim.step,
        "track_count": anim.get_track_count(),
        "tracks": tracks,
    })
    root.free()

# Remove a named animation from whichever library holds it and save.
func remove_animation(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var player = _resolve_anim_player(root, params)
    if player == null:
        root.free()
        return
    var anim_name = str(params.animation)
    if not player.has_animation(anim_name):
        fail("animation not found on player: " + anim_name)
        root.free()
        return
    # Animation names are "libname/animname"; the default library is "" so its
    # animations are bare names. Split on the first "/" to locate the library.
    var lib_name = ""
    var bare = anim_name
    var slash = anim_name.find("/")
    if slash != -1:
        lib_name = anim_name.substr(0, slash)
        bare = anim_name.substr(slash + 1)
    if not player.has_animation_library(lib_name):
        fail("could not locate library for animation: " + anim_name)
        root.free()
        return
    var lib = player.get_animation_library(lib_name)
    lib.remove_animation(bare)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "animation": anim_name,
            "removed": true,
        })
    root.free()

# ---------------------------------------------------------------------------
# AnimationTree ops (operate on AnimationTree nodes)
# ---------------------------------------------------------------------------

# Resolve an AnimationTree node from params, failing with a clear message.
# Returns null on failure (the caller frees the scene root).
func _resolve_anim_tree(root, params):
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        return null
    if not (node is AnimationTree):
        fail("node is not an AnimationTree: " + str(params.node_path))
        return null
    return node

# Build a fresh tree_root AnimationNode for the given root-type string.
func _make_tree_root(root_type):
    match str(root_type).to_lower():
        "blend_tree":
            return AnimationNodeBlendTree.new()
        _:
            return AnimationNodeStateMachine.new()

# Build a state-machine sub-node for the given state-type string.
func _make_state_node(state_type):
    match str(state_type).to_lower():
        "blend_tree":
            return AnimationNodeBlendTree.new()
        "blend_space_1d":
            return AnimationNodeBlendSpace1D.new()
        "blend_space_2d":
            return AnimationNodeBlendSpace2D.new()
        "state_machine":
            return AnimationNodeStateMachine.new()
        _:
            return AnimationNodeAnimation.new()

# Build a blend-tree sub-node for the given node-type string.
func _make_blend_tree_node(bt_type):
    match str(bt_type).to_lower():
        "animation":
            return AnimationNodeAnimation.new()
        "blend2":
            return AnimationNodeBlend2.new()
        "blend3":
            return AnimationNodeBlend3.new()
        "add2":
            return AnimationNodeAdd2.new()
        "add3":
            return AnimationNodeAdd3.new()
        "oneshot":
            return AnimationNodeOneShot.new()
        "timescale":
            return AnimationNodeTimeScale.new()
        "timeseek":
            return AnimationNodeTimeSeek.new()
        "transition":
            return AnimationNodeTransition.new()
        "blend_space_1d":
            return AnimationNodeBlendSpace1D.new()
        "blend_space_2d":
            return AnimationNodeBlendSpace2D.new()
        "state_machine":
            return AnimationNodeStateMachine.new()
        "sub2", "output":
            return null
        _:
            return null

# Map a switch-mode string to AnimationNodeStateMachineTransition.SWITCH_MODE_*.
func _switch_mode(name):
    match str(name).to_lower():
        "sync":
            return AnimationNodeStateMachineTransition.SWITCH_MODE_SYNC
        "at_end":
            return AnimationNodeStateMachineTransition.SWITCH_MODE_AT_END
        _:
            return AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE

# Map an advance-mode string to AnimationNodeStateMachineTransition.ADVANCE_MODE_*.
func _advance_mode(name):
    match str(name).to_lower():
        "disabled":
            return AnimationNodeStateMachineTransition.ADVANCE_MODE_DISABLED
        "auto":
            return AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO
        _:
            return AnimationNodeStateMachineTransition.ADVANCE_MODE_ENABLED

# Create an AnimationTree under a parent, set its tree_root and anim_player.
func create_animation_tree(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_path", "")))
        root.free()
        return
    var tree = AnimationTree.new()
    tree.name = str(params.node_path)
    tree.tree_root = _make_tree_root(params.get("root_type", "state_machine"))
    if params.has("anim_player"):
        tree.anim_player = NodePath(str(params.anim_player))
    parent.add_child(tree)
    tree.owner = root
    var created_path = str(root.get_path_to(tree))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": created_path,
            "root_type": str(params.get("root_type", "state_machine")).to_lower(),
            "created": true,
        })
    root.free()

# Read-only structure of an AnimationTree (states/transitions or sub-nodes).
func get_animation_tree_structure(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var tree = _resolve_anim_tree(root, params)
    if tree == null:
        root.free()
        return
    var tree_root = tree.tree_root
    var result = {
        "scene": scene_path,
        "node": str(params.node_path),
        "anim_player": str(tree.anim_player),
    }
    if tree_root == null:
        result["root_type"] = null
    elif tree_root is AnimationNodeStateMachine:
        result["root_type"] = "state_machine"
        var states = []
        for n in tree_root.get_node_list():
            states.append(str(n))
        result["states"] = states
        var transitions = []
        for i in range(tree_root.get_transition_count()):
            transitions.append({
                "from": str(tree_root.get_transition_from(i)),
                "to": str(tree_root.get_transition_to(i)),
            })
        result["transitions"] = transitions
    elif tree_root is AnimationNodeBlendTree:
        result["root_type"] = "blend_tree"
        var nodes = []
        for n in tree_root.get_node_list():
            nodes.append(str(n))
        result["nodes"] = nodes
    else:
        result["root_type"] = tree_root.get_class()
    emit_result(result)
    root.free()

# Add a state node to a state-machine root and save.
func add_state_machine_state(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var tree = _resolve_anim_tree(root, params)
    if tree == null:
        root.free()
        return
    var sm = tree.tree_root
    if sm == null or not (sm is AnimationNodeStateMachine):
        fail("AnimationTree root is not a state machine")
        root.free()
        return
    var state_node = _make_state_node(params.get("state_type", "animation"))
    if state_node is AnimationNodeAnimation and params.has("animation"):
        state_node.animation = StringName(str(params.animation))
    var pos = _atlas_coords(params.get("position", [0, 0]))
    sm.add_node(StringName(str(params.state_name)), state_node, Vector2(pos.x, pos.y))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "state": str(params.state_name),
            "state_type": str(params.get("state_type", "animation")).to_lower(),
            "added": true,
        })
    root.free()

# Remove a state node from a state-machine root and save.
func remove_state_machine_state(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var tree = _resolve_anim_tree(root, params)
    if tree == null:
        root.free()
        return
    var sm = tree.tree_root
    if sm == null or not (sm is AnimationNodeStateMachine):
        fail("AnimationTree root is not a state machine")
        root.free()
        return
    var state_name = StringName(str(params.state_name))
    if not sm.has_node(state_name):
        fail("state not found in state machine: " + str(params.state_name))
        root.free()
        return
    sm.remove_node(state_name)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "state": str(params.state_name),
            "removed": true,
        })
    root.free()

# Add a transition between two states of a state-machine root and save.
func add_state_machine_transition(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var tree = _resolve_anim_tree(root, params)
    if tree == null:
        root.free()
        return
    var sm = tree.tree_root
    if sm == null or not (sm is AnimationNodeStateMachine):
        fail("AnimationTree root is not a state machine")
        root.free()
        return
    var transition = AnimationNodeStateMachineTransition.new()
    transition.switch_mode = _switch_mode(params.get("switch_mode", "immediate"))
    transition.advance_mode = _advance_mode(params.get("advance_mode", "enabled"))
    if params.has("advance_expression"):
        transition.advance_expression = str(params.advance_expression)
    sm.add_transition(StringName(str(params.from)), StringName(str(params.to)), transition)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "from": str(params.from),
            "to": str(params.to),
            "added": true,
        })
    root.free()

# Remove the transition between two states of a state-machine root and save.
func remove_state_machine_transition(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var tree = _resolve_anim_tree(root, params)
    if tree == null:
        root.free()
        return
    var sm = tree.tree_root
    if sm == null or not (sm is AnimationNodeStateMachine):
        fail("AnimationTree root is not a state machine")
        root.free()
        return
    var from_name = StringName(str(params.from))
    var to_name = StringName(str(params.to))
    if not sm.has_transition(from_name, to_name):
        fail("transition not found: " + str(params.from) + " -> " + str(params.to))
        root.free()
        return
    sm.remove_transition(from_name, to_name)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "from": str(params.from),
            "to": str(params.to),
            "removed": true,
        })
    root.free()

# Add or replace a sub-node on a blend-tree root and save.
func set_blend_tree_node(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var tree = _resolve_anim_tree(root, params)
    if tree == null:
        root.free()
        return
    var bt = tree.tree_root
    if bt == null or not (bt is AnimationNodeBlendTree):
        fail("AnimationTree root is not a blend tree")
        root.free()
        return
    var bt_name = StringName(str(params.bt_node_name))
    var bt_node = _make_blend_tree_node(params.bt_node_type)
    if bt_node == null:
        fail("unsupported blend tree node type: " + str(params.bt_node_type))
        root.free()
        return
    # Replacing means removing the existing sub-node of the same name first.
    if bt.has_node(bt_name):
        bt.remove_node(bt_name)
    var pos = _atlas_coords(params.get("position", [0, 0]))
    bt.add_node(bt_name, bt_node, Vector2(pos.x, pos.y))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "bt_node": str(params.bt_node_name),
            "bt_node_type": str(params.bt_node_type).to_lower(),
            "set": true,
        })
    root.free()

# Set a runtime parameter on an AnimationTree and save.
func set_tree_parameter(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var tree = _resolve_anim_tree(root, params)
    if tree == null:
        root.free()
        return
    var param_path = "parameters/" + str(params.parameter)
    var value = _generic_coerce(params.get("value", null))
    tree.set(param_path, value)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "parameter": str(params.parameter),
            "value": json_safe(tree.get(param_path)),
        })
    root.free()

# --- Audio (AudioServer buses + AudioStreamPlayer nodes) -------------------
#
# Bus operations are PROJECT-level: they edit the live AudioServer bus layout
# and persist it back to the project's bus-layout resource. They do NOT load a
# scene. Player operations are SCENE-level and use load_scene_root/save_scene.

# Resolve the project's bus-layout resource path and load it into the live
# AudioServer so mutations start from the saved state. The AudioServer always
# provides a "Master" bus at index 0 by default.
func _audio_layout_path():
    return str(ProjectSettings.get_setting("audio/buses/default_bus_layout", "res://default_bus_layout.tres"))

func _load_audio_layout():
    var layout_path = _audio_layout_path()
    if ResourceLoader.exists(layout_path):
        var layout = load(layout_path)
        if layout != null:
            AudioServer.set_bus_layout(layout)
    return layout_path

# Generate a fresh layout from the current AudioServer state and save it back to
# the project's bus-layout resource. Returns true on success (fails otherwise).
func _save_audio_layout(layout_path):
    var saved = ResourceSaver.save(AudioServer.generate_bus_layout(), layout_path)
    if saved != OK:
        fail("save bus layout to " + layout_path + " (error " + str(saved) + ")")
        return false
    return true

# Resolve a bus index from params (busName or busIndex). Returns -1 if not found
# or out of range.
func _resolve_bus_index(params):
    if params.has("bus_index"):
        var idx = int(params.bus_index)
        if idx >= 0 and idx < AudioServer.bus_count:
            return idx
        return -1
    if params.has("bus_name"):
        return AudioServer.get_bus_index(str(params.bus_name))
    return -1

# Serialize a single bus (and its effects) into a JSON-safe dictionary.
func _audio_bus_dict(idx):
    var effects = []
    for e in range(AudioServer.get_bus_effect_count(idx)):
        var effect = AudioServer.get_bus_effect(idx, e)
        effects.append({"index": e, "type": effect.get_class()})
    return {
        "index": idx,
        "name": str(AudioServer.get_bus_name(idx)),
        "volume_db": AudioServer.get_bus_volume_db(idx),
        "solo": AudioServer.is_bus_solo(idx),
        "mute": AudioServer.is_bus_mute(idx),
        "bypass_effects": AudioServer.is_bus_bypassing_effects(idx),
        "send": str(AudioServer.get_bus_send(idx)),
        "effects": effects,
    }

func add_audio_bus(params):
    var layout_path = _load_audio_layout()
    var idx = AudioServer.bus_count
    AudioServer.add_bus()
    AudioServer.set_bus_name(idx, str(params.name))
    # The first bus (Master) has no send target; later buses default to "Master".
    var send = str(params.get("send_bus", "Master"))
    if idx > 0:
        AudioServer.set_bus_send(idx, send)
    if not _save_audio_layout(layout_path):
        return
    emit_result({
        "bus_index": idx,
        "name": str(AudioServer.get_bus_name(idx)),
        "send": str(AudioServer.get_bus_send(idx)),
        "layout": layout_path,
    })

func set_audio_bus(params):
    var layout_path = _load_audio_layout()
    var idx = _resolve_bus_index(params)
    if idx < 0:
        fail("find audio bus: " + str(params.get("bus_name", params.get("bus_index", ""))))
        return
    if params.has("volume_db"):
        AudioServer.set_bus_volume_db(idx, float(params.volume_db))
    if params.has("solo"):
        AudioServer.set_bus_solo(idx, bool(params.solo))
    if params.has("mute"):
        AudioServer.set_bus_mute(idx, bool(params.mute))
    if params.has("bypass_effects"):
        AudioServer.set_bus_bypass_effects(idx, bool(params.bypass_effects))
    if params.has("send") and idx > 0:
        AudioServer.set_bus_send(idx, str(params.send))
    if not _save_audio_layout(layout_path):
        return
    emit_result(_audio_bus_dict(idx))

# Map a lowercase effect type name to its AudioEffect resource, or null.
func _make_audio_effect(effect_type):
    match effect_type:
        "reverb":
            return AudioEffectReverb.new()
        "chorus":
            return AudioEffectChorus.new()
        "delay":
            return AudioEffectDelay.new()
        "compressor":
            return AudioEffectCompressor.new()
        "limiter":
            return AudioEffectLimiter.new()
        "distortion":
            return AudioEffectDistortion.new()
        "eq":
            return AudioEffectEQ.new()
        "lowpass":
            return AudioEffectLowPassFilter.new()
        "highpass":
            return AudioEffectHighPassFilter.new()
        "bandpass":
            return AudioEffectBandPassFilter.new()
        "amplify":
            return AudioEffectAmplify.new()
        "phaser":
            return AudioEffectPhaser.new()
    return null

func add_audio_bus_effect(params):
    var layout_path = _load_audio_layout()
    var idx = _resolve_bus_index(params)
    if idx < 0:
        fail("find audio bus: " + str(params.get("bus_name", params.get("bus_index", ""))))
        return
    var effect_type = str(params.effect_type).to_lower()
    var effect = _make_audio_effect(effect_type)
    if effect == null:
        fail("unknown effect type: " + effect_type)
        return
    # Apply common parameters where the chosen effect resource exposes them.
    if params.has("volume_db") and "volume_db" in effect:
        effect.volume_db = float(params.volume_db)
    if params.has("cutoff_hz") and "cutoff_hz" in effect:
        effect.cutoff_hz = float(params.cutoff_hz)
    if params.has("wet") and "wet" in effect:
        effect.wet = float(params.wet)
    if params.has("dry") and "dry" in effect:
        effect.dry = float(params.dry)
    AudioServer.add_bus_effect(idx, effect)
    var effect_index = AudioServer.get_bus_effect_count(idx) - 1
    if not _save_audio_layout(layout_path):
        return
    emit_result({
        "bus_index": idx,
        "bus_name": str(AudioServer.get_bus_name(idx)),
        "effect_index": effect_index,
        "effect_type": effect.get_class(),
        "layout": layout_path,
    })

func get_audio_bus_layout(params):
    _load_audio_layout()
    var buses = []
    for i in range(AudioServer.bus_count):
        buses.append(_audio_bus_dict(i))
    emit_result({"count": buses.size(), "buses": buses})

func add_audio_player(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_path", "")))
        root.free()
        return
    var player
    if bool(params.get("is_3d", false)):
        player = AudioStreamPlayer3D.new()
    elif bool(params.get("is_2d", false)):
        player = AudioStreamPlayer2D.new()
    else:
        player = AudioStreamPlayer.new()
    player.name = str(params.name)
    if params.has("stream"):
        var stream_path = _res_path(str(params.stream))
        if not ResourceLoader.exists(stream_path):
            fail("load audio stream: file does not exist: " + stream_path)
            root.free()
            return
        var stream = load(stream_path)
        if stream == null:
            fail("load audio stream: " + stream_path)
            root.free()
            return
        player.stream = stream
    player.bus = StringName(str(params.get("bus", "Master")))
    if params.has("volume_db"):
        player.volume_db = float(params.volume_db)
    if params.has("autoplay"):
        player.autoplay = bool(params.autoplay)
    parent.add_child(player)
    player.owner = root
    var created_path = str(root.get_path_to(player))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": created_path,
            "type": player.get_class(),
            "bus": str(player.bus),
            "created": true,
        })
    root.free()

# Recursively collect AudioStreamPlayer/2D/3D nodes into `out`.
func _collect_audio_players(node, root, out):
    if node is AudioStreamPlayer or node is AudioStreamPlayer2D or node is AudioStreamPlayer3D:
        var stream_path = ""
        if node.stream != null:
            stream_path = str(node.stream.resource_path)
        out.append({
            "path": str(root.get_path_to(node)),
            "type": node.get_class(),
            "stream": stream_path,
            "bus": str(node.bus),
            "volume_db": node.volume_db,
            "autoplay": node.autoplay,
            "playing": node.playing,
        })
    for child in node.get_children():
        _collect_audio_players(child, root, out)

func get_audio_info(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var players = []
    _collect_audio_players(root, root, players)
    emit_result({"scene": scene_path, "count": players.size(), "players": players})
    root.free()

# --- Shaders ----------------------------------------------------------------

# Find the ShaderMaterial currently assigned to a node, checking both the 2D/UI
# `material` slot and the 3D `material_override` slot. Returns null if none.
func _node_shader_material(node):
    if node is CanvasItem:
        var m = node.material
        if m != null and m is ShaderMaterial:
            return m
    if "material_override" in node:
        var mo = node.material_override
        if mo != null and mo is ShaderMaterial:
            return mo
    return null

# Map a shader uniform type enum to a readable name.
func _shader_uniform_type_name(t):
    match t:
        TYPE_NIL:
            return "void"
        TYPE_BOOL:
            return "bool"
        TYPE_INT:
            return "int"
        TYPE_FLOAT:
            return "float"
        TYPE_VECTOR2:
            return "vec2"
        TYPE_VECTOR3:
            return "vec3"
        TYPE_VECTOR4:
            return "vec4"
        TYPE_COLOR:
            return "color"
        TYPE_TRANSFORM2D:
            return "mat3"
        TYPE_TRANSFORM3D, TYPE_PROJECTION:
            return "mat4"
        TYPE_OBJECT:
            return "sampler"
    return str(t)

func assign_shader_material(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    var shader_path = _res_path(params.shader_path)
    if not ResourceLoader.exists(shader_path):
        fail("load shader: file does not exist: " + shader_path)
        root.free()
        return
    var shader = load(shader_path)
    if shader == null or not (shader is Shader):
        fail("load shader: not a valid Shader: " + shader_path)
        root.free()
        return
    var mat = ShaderMaterial.new()
    mat.shader = shader
    var slot = ""
    if node is CanvasItem:
        node.material = mat
        slot = "material"
    elif "material_override" in node:
        node.material_override = mat
        slot = "material_override"
    else:
        fail("node has no material slot (not a CanvasItem or GeometryInstance3D): " + str(params.node_path))
        root.free()
        return
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "shader": shader_path,
            "slot": slot,
            "assigned": true,
        })
    root.free()

func set_shader_param(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    var mat = _node_shader_material(node)
    if mat == null:
        fail("node has no ShaderMaterial: " + str(params.node_path))
        root.free()
        return
    var param_name = str(params.param)
    # Coerce the JSON value to the type the shader uniform expects, when known.
    var raw = params.get("value")
    var value = raw
    if mat.shader != null:
        for info in mat.shader.get_shader_uniform_list():
            if info.name == param_name:
                value = _coerce_uniform_value(info.type, raw)
                break
    mat.set_shader_parameter(param_name, value)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "param": param_name,
            "value": json_safe(mat.get_shader_parameter(param_name)),
        })
    root.free()

# Convert a JSON value into the Godot type a shader uniform expects.
func _coerce_uniform_value(uniform_type, value):
    match uniform_type:
        TYPE_VECTOR2:
            return _to_vec(value, 2, false)
        TYPE_VECTOR3:
            return _to_vec(value, 3, false)
        TYPE_VECTOR4:
            return _to_vec(value, 4, false)
        TYPE_COLOR:
            return _to_color(value)
        TYPE_INT:
            return int(value)
        TYPE_FLOAT:
            return float(value)
        TYPE_BOOL:
            return bool(value)
        TYPE_OBJECT:
            if typeof(value) == TYPE_STRING:
                var res = load(_res_path(value))
                if res != null:
                    return res
    return value

func _shader_uniforms_list(shader):
    var out = []
    for info in shader.get_shader_uniform_list():
        out.append({
            "name": str(info.name),
            "type": _shader_uniform_type_name(info.type),
            "hint": int(info.get("hint", 0)),
            "hint_string": str(info.get("hint_string", "")),
        })
    return out

func get_shader_params(params):
    var shader = null
    if params.has("shader_path") and str(params.shader_path) != "":
        var shader_path = _res_path(params.shader_path)
        if not ResourceLoader.exists(shader_path):
            fail("load shader: file does not exist: " + shader_path)
            return
        shader = load(shader_path)
        if shader == null or not (shader is Shader):
            fail("load shader: not a valid Shader: " + shader_path)
            return
        emit_result({"shader": shader_path, "uniforms": _shader_uniforms_list(shader)})
        return
    # Otherwise resolve the shader from a node's ShaderMaterial.
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    var mat = _node_shader_material(node)
    if mat == null or mat.shader == null:
        fail("node has no ShaderMaterial with a shader: " + str(params.node_path))
        root.free()
        return
    emit_result({
        "scene": scene_path,
        "node": str(params.node_path),
        "uniforms": _shader_uniforms_list(mat.shader),
    })
    root.free()

# --- Themes -----------------------------------------------------------------

# Load a Theme resource for mutation. Reports a standardized error on failure.
func _load_theme(theme_path):
    if not ResourceLoader.exists(theme_path):
        fail("load theme: file does not exist: " + theme_path)
        return null
    var theme = load(theme_path)
    if theme == null or not (theme is Theme):
        fail("load theme: not a valid Theme: " + theme_path)
        return null
    return theme

func _save_resource(res, path):
    var dir = path.get_base_dir()
    if dir != "" and not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(dir)):
        DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
    var err = ResourceSaver.save(res, path)
    if err != OK:
        fail("save resource to " + path + " (error " + str(err) + ")")
        return false
    return true

func create_theme(params):
    var theme_path = _res_path(params.path)
    if ResourceLoader.exists(theme_path):
        fail("theme already exists: " + theme_path)
        return
    var t = Theme.new()
    if _save_resource(t, theme_path):
        emit_result({"path": theme_path, "created": true})

func set_theme_color(params):
    var theme_path = _res_path(params.theme_path)
    var theme = _load_theme(theme_path)
    if theme == null:
        return
    var color = _to_color(params.get("color"))
    theme.set_color(str(params.name), str(params.theme_type), color)
    if _save_resource(theme, theme_path):
        emit_result({
            "theme": theme_path,
            "name": str(params.name),
            "theme_type": str(params.theme_type),
            "color": json_safe(color),
        })

func set_theme_constant(params):
    var theme_path = _res_path(params.theme_path)
    var theme = _load_theme(theme_path)
    if theme == null:
        return
    var value = int(params.get("value", 0))
    theme.set_constant(str(params.name), str(params.theme_type), value)
    if _save_resource(theme, theme_path):
        emit_result({
            "theme": theme_path,
            "name": str(params.name),
            "theme_type": str(params.theme_type),
            "value": value,
        })

func set_theme_font_size(params):
    var theme_path = _res_path(params.theme_path)
    var theme = _load_theme(theme_path)
    if theme == null:
        return
    var size = int(params.get("size", 0))
    theme.set_font_size(str(params.name), str(params.theme_type), size)
    if _save_resource(theme, theme_path):
        emit_result({
            "theme": theme_path,
            "name": str(params.name),
            "theme_type": str(params.theme_type),
            "size": size,
        })

func _make_stylebox(stylebox_type):
    match stylebox_type:
        "flat":
            return StyleBoxFlat.new()
        "empty":
            return StyleBoxEmpty.new()
        "texture":
            return StyleBoxTexture.new()
        "line":
            return StyleBoxLine.new()
    return null

func set_theme_stylebox(params):
    var theme_path = _res_path(params.theme_path)
    var theme = _load_theme(theme_path)
    if theme == null:
        return
    var stylebox_type = str(params.get("stylebox_type", "flat")).to_lower()
    var sb = _make_stylebox(stylebox_type)
    if sb == null:
        fail("unknown stylebox type: " + stylebox_type)
        return
    var applied = []
    var props = params.get("properties", {})
    if typeof(props) == TYPE_DICTIONARY:
        for key in props:
            var prop_name = str(key)
            sb.set(prop_name, coerce_value(sb, prop_name, props[key]))
            applied.append(prop_name)
    theme.set_stylebox(str(params.name), str(params.theme_type), sb)
    if _save_resource(theme, theme_path):
        emit_result({
            "theme": theme_path,
            "name": str(params.name),
            "theme_type": str(params.theme_type),
            "stylebox_type": sb.get_class(),
            "applied": applied,
        })

func get_theme_info(params):
    var theme_path = _res_path(params.theme_path)
    var theme = _load_theme(theme_path)
    if theme == null:
        return
    var info = {"colors": {}, "constants": {}, "font_sizes": {}, "styleboxes": {}}
    for tt in theme.get_color_type_list():
        info.colors[str(tt)] = _string_list(theme.get_color_list(tt))
    for tt in theme.get_constant_type_list():
        info.constants[str(tt)] = _string_list(theme.get_constant_list(tt))
    for tt in theme.get_font_size_type_list():
        info.font_sizes[str(tt)] = _string_list(theme.get_font_size_list(tt))
    for tt in theme.get_stylebox_type_list():
        info.styleboxes[str(tt)] = _string_list(theme.get_stylebox_list(tt))
    emit_result({"theme": theme_path, "items": info})

func _string_list(values):
    var out = []
    for v in values:
        out.append(str(v))
    return out

# --- Control layout ---------------------------------------------------------

# Map a layout preset name to the Control.LayoutPreset enum value.
func _control_preset(name):
    match str(name).to_lower():
        "top_left":
            return Control.PRESET_TOP_LEFT
        "top_right":
            return Control.PRESET_TOP_RIGHT
        "bottom_left":
            return Control.PRESET_BOTTOM_LEFT
        "bottom_right":
            return Control.PRESET_BOTTOM_RIGHT
        "center_left":
            return Control.PRESET_CENTER_LEFT
        "center_top":
            return Control.PRESET_CENTER_TOP
        "center_right":
            return Control.PRESET_CENTER_RIGHT
        "center_bottom":
            return Control.PRESET_CENTER_BOTTOM
        "center":
            return Control.PRESET_CENTER
        "left_wide":
            return Control.PRESET_LEFT_WIDE
        "top_wide":
            return Control.PRESET_TOP_WIDE
        "right_wide":
            return Control.PRESET_RIGHT_WIDE
        "bottom_wide":
            return Control.PRESET_BOTTOM_WIDE
        "vcenter_wide":
            return Control.PRESET_VCENTER_WIDE
        "hcenter_wide":
            return Control.PRESET_HCENTER_WIDE
        "full_rect":
            return Control.PRESET_FULL_RECT
    return -1

func setup_control(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    if not (node is Control):
        fail("node is not a Control: " + str(params.node_path))
        root.free()
        return
    var result = {"scene": scene_path, "node": str(params.node_path)}
    if params.has("anchor_preset") and str(params.anchor_preset) != "":
        var preset = _control_preset(params.anchor_preset)
        if preset == -1:
            fail("unknown anchor preset: " + str(params.anchor_preset))
            root.free()
            return
        node.set_anchors_and_offsets_preset(preset)
        result["anchor_preset"] = str(params.anchor_preset)
    if params.has("h_size_flags"):
        node.size_flags_horizontal = int(params.h_size_flags)
        result["h_size_flags"] = int(params.h_size_flags)
    if params.has("v_size_flags"):
        node.size_flags_vertical = int(params.v_size_flags)
        result["v_size_flags"] = int(params.v_size_flags)
    if save_scene_tree(root, scene_path):
        result["ok"] = true
        emit_result(result)
    root.free()

# --- Particles --------------------------------------------------------------

# Return the GPUParticles2D/3D node, or null if the node is neither.
func _resolve_particles(root, node_path):
    var node = resolve_node(root, node_path)
    if node == null:
        fail("find node: " + str(node_path))
        return null
    if not (node is GPUParticles2D or node is GPUParticles3D):
        fail("node is not a GPUParticles2D/3D: " + str(node_path))
        return null
    return node

# Return the node's ParticleProcessMaterial, creating a fresh one if absent.
func _ensure_process_material(node):
    var mat = node.process_material
    if mat == null or not (mat is ParticleProcessMaterial):
        mat = ParticleProcessMaterial.new()
        node.process_material = mat
    return mat

# Map an emission shape name to the ParticleProcessMaterial enum.
func _emission_shape_value(name):
    match str(name).to_lower():
        "point":
            return ParticleProcessMaterial.EMISSION_SHAPE_POINT
        "sphere":
            return ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
        "sphere_surface":
            return ParticleProcessMaterial.EMISSION_SHAPE_SPHERE_SURFACE
        "box":
            return ParticleProcessMaterial.EMISSION_SHAPE_BOX
        "ring":
            return ParticleProcessMaterial.EMISSION_SHAPE_RING
        _:
            return -1

# Build a Vector3 from an array/dict; 2D inputs get z = 0.
func _to_vec3(value):
    var a = _num_array(value)
    while a.size() < 3:
        a.append(0.0)
    return Vector3(a[0], a[1], a[2])

func create_particles(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_path", "")))
        root.free()
        return
    var node
    if bool(params.get("is_3d", false)):
        node = GPUParticles3D.new()
    else:
        node = GPUParticles2D.new()
    node.name = str(params.name)
    node.amount = int(params.get("amount", 8))
    node.lifetime = float(params.get("lifetime", 1.0))
    node.one_shot = bool(params.get("one_shot", false))
    var mat = ParticleProcessMaterial.new()
    var shape_name = str(params.get("emission_shape", "point"))
    var shape_value = _emission_shape_value(shape_name)
    if shape_value == -1:
        fail("unknown emission shape: " + shape_name)
        root.free()
        return
    mat.emission_shape = shape_value
    node.process_material = mat
    parent.add_child(node)
    node.owner = root
    var created_path = str(root.get_path_to(node))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": created_path,
            "type": node.get_class(),
            "amount": node.amount,
            "lifetime": node.lifetime,
            "one_shot": node.one_shot,
            "emission_shape": shape_name,
            "created": true,
        })
    root.free()

func set_particle_material(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = _resolve_particles(root, params.node_path)
    if node == null:
        root.free()
        return
    var changed = []
    # Node-level properties.
    if params.has("amount"):
        node.amount = int(params.amount)
        changed.append("amount")
    if params.has("lifetime"):
        node.lifetime = float(params.lifetime)
        changed.append("lifetime")
    if params.has("one_shot"):
        node.one_shot = bool(params.one_shot)
        changed.append("one_shot")
    if params.has("emitting"):
        node.emitting = bool(params.emitting)
        changed.append("emitting")
    # explosiveness / randomness live on the GPUParticles node in Godot 4.
    if params.has("explosiveness"):
        node.explosiveness = float(params.explosiveness)
        changed.append("explosiveness")
    if params.has("randomness"):
        node.randomness = float(params.randomness)
        changed.append("randomness")
    # Material-level properties.
    var material_keys = ["direction", "spread", "initial_velocity_min", "initial_velocity_max",
        "gravity", "scale_min", "scale_max", "color", "angular_velocity_min", "angular_velocity_max",
        "orbit_velocity_min", "orbit_velocity_max", "damping_min", "damping_max"]
    var wants_material = false
    for key in material_keys:
        if params.has(key):
            wants_material = true
            break
    if wants_material:
        var mat = _ensure_process_material(node)
        if params.has("direction"):
            mat.direction = _to_vec3(params.direction)
            changed.append("direction")
        if params.has("spread"):
            mat.spread = float(params.spread)
            changed.append("spread")
        if params.has("initial_velocity_min"):
            mat.initial_velocity_min = float(params.initial_velocity_min)
            changed.append("initial_velocity_min")
        if params.has("initial_velocity_max"):
            mat.initial_velocity_max = float(params.initial_velocity_max)
            changed.append("initial_velocity_max")
        if params.has("gravity"):
            mat.gravity = _to_vec3(params.gravity)
            changed.append("gravity")
        if params.has("scale_min"):
            mat.scale_min = float(params.scale_min)
            changed.append("scale_min")
        if params.has("scale_max"):
            mat.scale_max = float(params.scale_max)
            changed.append("scale_max")
        if params.has("color"):
            mat.color = _to_color(params.color)
            changed.append("color")
        if params.has("angular_velocity_min"):
            mat.angular_velocity_min = float(params.angular_velocity_min)
            changed.append("angular_velocity_min")
        if params.has("angular_velocity_max"):
            mat.angular_velocity_max = float(params.angular_velocity_max)
            changed.append("angular_velocity_max")
        if params.has("orbit_velocity_min"):
            mat.orbit_velocity_min = float(params.orbit_velocity_min)
            changed.append("orbit_velocity_min")
        if params.has("orbit_velocity_max"):
            mat.orbit_velocity_max = float(params.orbit_velocity_max)
            changed.append("orbit_velocity_max")
        if params.has("damping_min"):
            mat.damping_min = float(params.damping_min)
            changed.append("damping_min")
        if params.has("damping_max"):
            mat.damping_max = float(params.damping_max)
            changed.append("damping_max")
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node": str(params.node_path), "changed": changed})
    root.free()

func set_particle_color_gradient(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = _resolve_particles(root, params.node_path)
    if node == null:
        root.free()
        return
    var stops = params.get("stops", [])
    if typeof(stops) != TYPE_ARRAY or stops.size() == 0:
        fail("stops must be a non-empty array")
        root.free()
        return
    var gradient = Gradient.new()
    var offsets = PackedFloat32Array()
    var colors = PackedColorArray()
    for stop in stops:
        if typeof(stop) != TYPE_DICTIONARY:
            continue
        var offset = clampf(float(stop.get("offset", 0.0)), 0.0, 1.0)
        var color = _to_color(stop.get("color"))
        offsets.append(offset)
        colors.append(color)
    if offsets.size() == 0:
        fail("no valid gradient stops provided")
        root.free()
        return
    gradient.offsets = offsets
    gradient.colors = colors
    var gradient_tex = GradientTexture1D.new()
    gradient_tex.gradient = gradient
    var mat = _ensure_process_material(node)
    mat.color_ramp = gradient_tex
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node": str(params.node_path), "stops": offsets.size()})
    root.free()

# Build a Gradient + GradientTexture1D color_ramp from {offset: color} pairs.
func _make_color_ramp(stops):
    var gradient = Gradient.new()
    var offsets = PackedFloat32Array()
    var colors = PackedColorArray()
    for stop in stops:
        offsets.append(clampf(float(stop[0]), 0.0, 1.0))
        colors.append(stop[1])
    gradient.offsets = offsets
    gradient.colors = colors
    var tex = GradientTexture1D.new()
    tex.gradient = gradient
    return tex

func apply_particle_preset(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = _resolve_particles(root, params.node_path)
    if node == null:
        root.free()
        return
    var preset = str(params.preset).to_lower()
    var mat = _ensure_process_material(node)
    match preset:
        "fire":
            node.amount = 32
            node.lifetime = 1.2
            node.one_shot = false
            node.explosiveness = 0.0
            mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
            mat.emission_sphere_radius = 4.0
            mat.direction = Vector3(0, -1, 0)
            mat.spread = 20.0
            mat.gravity = Vector3(0, -40, 0)
            mat.initial_velocity_min = 20.0
            mat.initial_velocity_max = 40.0
            mat.scale_min = 0.5
            mat.scale_max = 1.0
            mat.color_ramp = _make_color_ramp([[0.0, Color(1.0, 0.9, 0.2, 1.0)], [0.5, Color(1.0, 0.4, 0.0, 1.0)], [1.0, Color(0.6, 0.0, 0.0, 0.0)]])
        "smoke":
            node.amount = 24
            node.lifetime = 2.5
            node.one_shot = false
            node.explosiveness = 0.0
            mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
            mat.emission_sphere_radius = 6.0
            mat.direction = Vector3(0, -1, 0)
            mat.spread = 25.0
            mat.gravity = Vector3(0, -20, 0)
            mat.initial_velocity_min = 8.0
            mat.initial_velocity_max = 18.0
            mat.scale_min = 1.0
            mat.scale_max = 2.5
            mat.color_ramp = _make_color_ramp([[0.0, Color(0.4, 0.4, 0.4, 0.6)], [1.0, Color(0.2, 0.2, 0.2, 0.0)]])
        "sparks":
            node.amount = 24
            node.lifetime = 0.6
            node.one_shot = false
            node.explosiveness = 0.2
            mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_POINT
            mat.direction = Vector3(0, -1, 0)
            mat.spread = 45.0
            mat.gravity = Vector3(0, 200, 0)
            mat.initial_velocity_min = 80.0
            mat.initial_velocity_max = 160.0
            mat.scale_min = 0.2
            mat.scale_max = 0.5
            mat.color = Color(1.0, 0.85, 0.4, 1.0)
            mat.color_ramp = _make_color_ramp([[0.0, Color(1.0, 0.9, 0.5, 1.0)], [1.0, Color(1.0, 0.4, 0.0, 0.0)]])
        "explosion":
            node.amount = 48
            node.lifetime = 0.8
            node.one_shot = true
            node.explosiveness = 1.0
            mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
            mat.emission_sphere_radius = 2.0
            mat.direction = Vector3(0, 0, 0)
            mat.spread = 180.0
            mat.gravity = Vector3(0, 0, 0)
            mat.initial_velocity_min = 120.0
            mat.initial_velocity_max = 240.0
            mat.scale_min = 0.5
            mat.scale_max = 1.5
            mat.damping_min = 40.0
            mat.damping_max = 80.0
            mat.color_ramp = _make_color_ramp([[0.0, Color(1.0, 1.0, 0.6, 1.0)], [0.4, Color(1.0, 0.5, 0.0, 1.0)], [1.0, Color(0.3, 0.0, 0.0, 0.0)]])
        "rain":
            node.amount = 200
            node.lifetime = 1.0
            node.one_shot = false
            node.explosiveness = 0.0
            mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
            mat.emission_box_extents = Vector3(200, 1, 1)
            mat.direction = Vector3(0, 1, 0)
            mat.spread = 2.0
            mat.gravity = Vector3(0, 400, 0)
            mat.initial_velocity_min = 300.0
            mat.initial_velocity_max = 360.0
            mat.scale_min = 0.3
            mat.scale_max = 0.6
            mat.color = Color(0.6, 0.7, 0.9, 0.7)
        "snow":
            node.amount = 120
            node.lifetime = 4.0
            node.one_shot = false
            node.explosiveness = 0.0
            mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
            mat.emission_box_extents = Vector3(200, 1, 1)
            mat.direction = Vector3(0, 1, 0)
            mat.spread = 15.0
            mat.gravity = Vector3(0, 30, 0)
            mat.initial_velocity_min = 20.0
            mat.initial_velocity_max = 40.0
            mat.scale_min = 0.4
            mat.scale_max = 1.0
            mat.color = Color(1.0, 1.0, 1.0, 0.9)
        "magic":
            node.amount = 40
            node.lifetime = 1.6
            node.one_shot = false
            node.explosiveness = 0.0
            mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
            mat.emission_sphere_radius = 8.0
            mat.direction = Vector3(0, -1, 0)
            mat.spread = 180.0
            mat.gravity = Vector3(0, -10, 0)
            mat.initial_velocity_min = 10.0
            mat.initial_velocity_max = 30.0
            mat.orbit_velocity_min = 0.2
            mat.orbit_velocity_max = 0.5
            mat.scale_min = 0.4
            mat.scale_max = 0.9
            mat.color_ramp = _make_color_ramp([[0.0, Color(0.6, 0.3, 1.0, 1.0)], [0.5, Color(0.3, 0.7, 1.0, 1.0)], [1.0, Color(0.9, 0.4, 1.0, 0.0)]])
        "dust":
            node.amount = 30
            node.lifetime = 2.0
            node.one_shot = false
            node.explosiveness = 0.0
            mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
            mat.emission_box_extents = Vector3(16, 4, 4)
            mat.direction = Vector3(0, -1, 0)
            mat.spread = 30.0
            mat.gravity = Vector3(0, -5, 0)
            mat.initial_velocity_min = 4.0
            mat.initial_velocity_max = 12.0
            mat.scale_min = 0.3
            mat.scale_max = 0.8
            mat.color = Color(0.8, 0.75, 0.6, 0.4)
        _:
            fail("unknown preset: " + preset)
            root.free()
            return
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node": str(params.node_path), "preset": preset})
    root.free()

func get_particle_info(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = _resolve_particles(root, params.node_path)
    if node == null:
        root.free()
        return
    var info = {
        "scene": scene_path,
        "node": str(params.node_path),
        "type": node.get_class(),
        "amount": node.amount,
        "lifetime": node.lifetime,
        "one_shot": node.one_shot,
        "emitting": node.emitting,
        "explosiveness": node.explosiveness,
        "randomness": node.randomness,
    }
    var mat = node.process_material
    if mat != null and mat is ParticleProcessMaterial:
        info["material"] = {
            "emission_shape": int(mat.emission_shape),
            "direction": json_safe(mat.direction),
            "spread": mat.spread,
            "initial_velocity_min": mat.initial_velocity_min,
            "initial_velocity_max": mat.initial_velocity_max,
            "gravity": json_safe(mat.gravity),
            "scale_min": mat.scale_min,
            "scale_max": mat.scale_max,
            "color": json_safe(mat.color),
            "angular_velocity_min": mat.angular_velocity_min,
            "angular_velocity_max": mat.angular_velocity_max,
            "orbit_velocity_min": mat.orbit_velocity_min,
            "orbit_velocity_max": mat.orbit_velocity_max,
            "damping_min": mat.damping_min,
            "damping_max": mat.damping_max,
            "has_color_ramp": mat.color_ramp != null,
        }
    else:
        info["material"] = null
    emit_result(info)
    root.free()

# --- Physics ----------------------------------------------------------------

# Return true if the node is a physics body or area in either dimension.
func _is_physics_body(node):
    return node is CollisionObject2D or node is CollisionObject3D

func setup_physics_body(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    if not _is_physics_body(node):
        fail("node is not a physics body or area: " + str(params.node_path))
        root.free()
        return
    var changed = []
    if params.has("collision_layer") and "collision_layer" in node:
        node.collision_layer = int(params.collision_layer)
        changed.append("collision_layer")
    if params.has("collision_mask") and "collision_mask" in node:
        node.collision_mask = int(params.collision_mask)
        changed.append("collision_mask")
    if params.has("motion_mode") and "motion_mode" in node:
        var mode = str(params.motion_mode).to_lower()
        if mode == "floating":
            node.motion_mode = 1
        else:
            node.motion_mode = 0
        changed.append("motion_mode")
    if params.has("mass") and "mass" in node:
        node.mass = float(params.mass)
        changed.append("mass")
    if params.has("gravity_scale") and "gravity_scale" in node:
        node.gravity_scale = float(params.gravity_scale)
        changed.append("gravity_scale")
    if params.has("linear_damp") and "linear_damp" in node:
        node.linear_damp = float(params.linear_damp)
        changed.append("linear_damp")
    if params.has("angular_damp") and "angular_damp" in node:
        node.angular_damp = float(params.angular_damp)
        changed.append("angular_damp")
    if params.has("freeze") and "freeze" in node:
        node.freeze = bool(params.freeze)
        changed.append("freeze")
    if params.has("freeze_mode") and "freeze_mode" in node:
        var fmode = str(params.freeze_mode).to_lower()
        if fmode == "kinematic":
            node.freeze_mode = 1
        else:
            node.freeze_mode = 0
        changed.append("freeze_mode")
    if params.has("contact_monitor") and "contact_monitor" in node:
        node.contact_monitor = bool(params.contact_monitor)
        changed.append("contact_monitor")
    if params.has("max_contacts_reported") and "max_contacts_reported" in node:
        node.max_contacts_reported = int(params.max_contacts_reported)
        changed.append("max_contacts_reported")
    if save_scene_tree(root, scene_path):
        emit_result({"scene": scene_path, "node": str(params.node_path), "type": node.get_class(), "changed": changed})
    root.free()

# Build the collision shape resource matching a name for the given dimension.
func _make_collision_shape(shape_type, dim, params):
    var t = str(shape_type).to_lower()
    if dim == "3d":
        match t:
            "box":
                var box = BoxShape3D.new()
                if params.has("size"):
                    box.size = _to_vec3(params.size)
                return box
            "sphere":
                var sphere = SphereShape3D.new()
                if params.has("radius"):
                    sphere.radius = float(params.radius)
                return sphere
            "capsule":
                var cap = CapsuleShape3D.new()
                if params.has("radius"):
                    cap.radius = float(params.radius)
                if params.has("height"):
                    cap.height = float(params.height)
                return cap
            "cylinder":
                var cyl = CylinderShape3D.new()
                if params.has("radius"):
                    cyl.radius = float(params.radius)
                if params.has("height"):
                    cyl.height = float(params.height)
                return cyl
            _:
                return null
    else:
        match t:
            "rectangle":
                var rect = RectangleShape2D.new()
                if params.has("size"):
                    var a = _num_array(params.size)
                    while a.size() < 2:
                        a.append(0.0)
                    rect.size = Vector2(a[0], a[1])
                return rect
            "circle":
                var circle = CircleShape2D.new()
                if params.has("radius"):
                    circle.radius = float(params.radius)
                return circle
            "capsule":
                var cap2 = CapsuleShape2D.new()
                if params.has("radius"):
                    cap2.radius = float(params.radius)
                if params.has("height"):
                    cap2.height = float(params.height)
                return cap2
            "segment":
                var seg = SegmentShape2D.new()
                if params.has("points"):
                    var pts = params.points
                    if typeof(pts) == TYPE_ARRAY and pts.size() >= 2:
                        var p0 = _num_array(pts[0])
                        var p1 = _num_array(pts[1])
                        while p0.size() < 2:
                            p0.append(0.0)
                        while p1.size() < 2:
                            p1.append(0.0)
                        seg.a = Vector2(p0[0], p0[1])
                        seg.b = Vector2(p1[0], p1[1])
                return seg
            "polygon":
                var poly = ConvexPolygonShape2D.new()
                if params.has("points"):
                    var arr = PackedVector2Array()
                    for p in params.points:
                        var pp = _num_array(p)
                        while pp.size() < 2:
                            pp.append(0.0)
                        arr.append(Vector2(pp[0], pp[1]))
                    poly.points = arr
                return poly
            _:
                return null

func setup_collision(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    var dim = str(params.get("dimension", "2d")).to_lower()
    var shape = _make_collision_shape(params.shape_type, dim, params)
    if shape == null:
        fail("unknown shape type '" + str(params.shape_type) + "' for dimension " + dim)
        root.free()
        return
    var cs
    if dim == "3d":
        cs = CollisionShape3D.new()
    else:
        cs = CollisionShape2D.new()
    cs.name = str(params.get("name", "CollisionShape"))
    cs.shape = shape
    if dim != "3d" and params.has("one_way_collision"):
        cs.one_way_collision = bool(params.one_way_collision)
    if params.has("disabled"):
        cs.disabled = bool(params.disabled)
    node.add_child(cs)
    cs.owner = root
    var created_path = str(root.get_path_to(cs))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "shape_node": created_path,
            "shape": shape.get_class(),
            "created": true,
        })
    root.free()

func set_physics_layers(params):
    var dim = str(params.get("dimension", "2d")).to_lower()
    if dim != "2d" and dim != "3d":
        dim = "2d"
    var names = params.get("names", {})
    if typeof(names) != TYPE_DICTIONARY:
        fail("names must be an object mapping layer number to name")
        return
    var applied = {}
    for key in names.keys():
        var n = int(str(key))
        if n < 1 or n > 32:
            continue
        var value = str(names[key])
        var setting = "layer_names/" + dim + "_physics/layer_" + str(n)
        ProjectSettings.set_setting(setting, value)
        applied[str(n)] = value
    var err = ProjectSettings.save()
    if err != OK:
        fail("save project settings (error " + str(err) + ")")
        return
    emit_result({"dimension": dim, "names": applied})

func get_physics_layers(params):
    var result = {"2d": {}, "3d": {}}
    for dim in ["2d", "3d"]:
        for n in range(1, 33):
            var setting = "layer_names/" + dim + "_physics/layer_" + str(n)
            if ProjectSettings.has_setting(setting):
                var value = str(ProjectSettings.get_setting(setting))
                if value != "":
                    result[dim][str(n)] = value
    emit_result(result)

func add_raycast(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_path", "")))
        root.free()
        return
    var dim = str(params.get("dimension", "2d")).to_lower()
    var node
    if dim == "3d":
        node = RayCast3D.new()
    else:
        node = RayCast2D.new()
    node.name = str(params.name)
    if params.has("target_position"):
        if dim == "3d":
            node.target_position = _to_vec3(params.target_position)
        else:
            var a = _num_array(params.target_position)
            while a.size() < 2:
                a.append(0.0)
            node.target_position = Vector2(a[0], a[1])
    elif dim != "3d":
        node.target_position = Vector2(0, 50)
    if params.has("collision_mask"):
        node.collision_mask = int(params.collision_mask)
    node.enabled = bool(params.get("enabled", true))
    parent.add_child(node)
    node.owner = root
    var created_path = str(root.get_path_to(node))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": created_path,
            "type": node.get_class(),
            "enabled": node.enabled,
            "created": true,
        })
    root.free()

# Decode a collision bitmask into the list of active 1-based layer numbers.
func _decode_layers(bitmask):
    var layers = []
    for n in range(1, 33):
        if (int(bitmask) & (1 << (n - 1))) != 0:
            layers.append(n)
    return layers

func get_collision_info(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    var info = {"scene": scene_path, "node": str(params.node_path), "type": node.get_class()}
    if "collision_layer" in node:
        info["collision_layer"] = int(node.collision_layer)
        info["active_layers"] = _decode_layers(node.collision_layer)
    if "collision_mask" in node:
        info["collision_mask"] = int(node.collision_mask)
        info["active_masks"] = _decode_layers(node.collision_mask)
    emit_result(info)
    root.free()

# --- Navigation -------------------------------------------------------------

func setup_navigation_region(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_path", "")))
        root.free()
        return
    var dim = str(params.get("dimension", "2d")).to_lower()
    var region
    if dim == "3d":
        region = NavigationRegion3D.new()
        region.navigation_mesh = NavigationMesh.new()
    else:
        region = NavigationRegion2D.new()
        region.navigation_polygon = NavigationPolygon.new()
    region.name = str(params.name)
    if params.has("navigation_layers"):
        region.navigation_layers = int(params.navigation_layers)
    parent.add_child(region)
    region.owner = root
    var created_path = str(root.get_path_to(region))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": created_path,
            "type": region.get_class(),
            "navigation_layers": int(region.navigation_layers),
            "created": true,
        })
    root.free()

func bake_navigation_mesh(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    var baked = false
    var modified = false
    var vertex_count = 0
    var note = ""
    if node is NavigationRegion2D:
        var navpoly = node.navigation_polygon
        if navpoly == null:
            navpoly = NavigationPolygon.new()
            node.navigation_polygon = navpoly
        if params.has("outline_vertices"):
            var outline = PackedVector2Array()
            for pair in params.outline_vertices:
                var a = _num_array(pair)
                while a.size() < 2:
                    a.append(0.0)
                outline.append(Vector2(a[0], a[1]))
            if outline.size() >= 3:
                navpoly.clear_outlines()
                navpoly.add_outline(outline)
                vertex_count = outline.size()
                modified = true
                # Build the polygon data from the supplied outlines. In headless
                # mode we drive the navigation server directly from the outlines.
                var source = NavigationMeshSourceGeometryData2D.new()
                source.add_traversable_outline(outline)
                NavigationServer2D.bake_from_source_geometry_data(navpoly, source)
                if navpoly.get_polygon_count() > 0:
                    baked = true
                else:
                    note = "outline stored but no polygons were produced headless"
            else:
                note = "outline_vertices needs at least 3 points"
        else:
            note = "no outline_vertices supplied; nothing to bake"
    elif node is NavigationRegion3D:
        note = "headless 3D baking requires source geometry; not baked"
    else:
        fail("node is not a NavigationRegion2D/3D: " + str(params.node_path))
        root.free()
        return
    var saved = true
    if modified:
        saved = save_scene_tree(root, scene_path)
    if saved:
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "type": node.get_class(),
            "baked": baked,
            "vertex_count": vertex_count,
            "saved": modified and saved,
            "note": note,
        })
    root.free()

func setup_navigation_agent(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_path", "")))
        root.free()
        return
    var dim = str(params.get("dimension", "2d")).to_lower()
    var agent
    if dim == "3d":
        agent = NavigationAgent3D.new()
    else:
        agent = NavigationAgent2D.new()
    agent.name = str(params.name)
    if params.has("radius") and "radius" in agent:
        agent.radius = float(params.radius)
    if params.has("max_speed") and "max_speed" in agent:
        agent.max_speed = float(params.max_speed)
    if params.has("path_desired_distance") and "path_desired_distance" in agent:
        agent.path_desired_distance = float(params.path_desired_distance)
    if params.has("target_desired_distance") and "target_desired_distance" in agent:
        agent.target_desired_distance = float(params.target_desired_distance)
    if params.has("avoidance_enabled") and "avoidance_enabled" in agent:
        agent.avoidance_enabled = bool(params.avoidance_enabled)
    if params.has("navigation_layers") and "navigation_layers" in agent:
        agent.navigation_layers = int(params.navigation_layers)
    parent.add_child(agent)
    agent.owner = root
    var created_path = str(root.get_path_to(agent))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": created_path,
            "type": agent.get_class(),
            "created": true,
        })
    root.free()

func set_navigation_layers(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    if not ("navigation_layers" in node):
        fail("node has no navigation_layers property: " + str(params.node_path))
        root.free()
        return
    node.navigation_layers = int(params.navigation_layers)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "navigation_layers": int(node.navigation_layers),
            "active_layers": _decode_layers(node.navigation_layers),
        })
    root.free()

func _collect_navigation_nodes(node, root, regions, agents):
    if node is NavigationRegion2D or node is NavigationRegion3D:
        regions.append({"path": str(root.get_path_to(node)), "type": node.get_class()})
    if node is NavigationAgent2D or node is NavigationAgent3D:
        agents.append({"path": str(root.get_path_to(node)), "type": node.get_class()})
    for child in node.get_children():
        _collect_navigation_nodes(child, root, regions, agents)

func get_navigation_info(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var regions = []
    var agents = []
    _collect_navigation_nodes(root, root, regions, agents)
    var layer_names_2d = {}
    var layer_names_3d = {}
    for n in range(1, 33):
        var s2 = "layer_names/2d_navigation/layer_" + str(n)
        if ProjectSettings.has_setting(s2):
            var v2 = str(ProjectSettings.get_setting(s2))
            if v2 != "":
                layer_names_2d[str(n)] = v2
        var s3 = "layer_names/3d_navigation/layer_" + str(n)
        if ProjectSettings.has_setting(s3):
            var v3 = str(ProjectSettings.get_setting(s3))
            if v3 != "":
                layer_names_3d[str(n)] = v3
    emit_result({
        "scene": scene_path,
        "region_count": regions.size(),
        "agent_count": agents.size(),
        "regions": regions,
        "agents": agents,
        "layer_names_2d": layer_names_2d,
        "layer_names_3d": layer_names_3d,
    })
    root.free()

# --- 3D ---------------------------------------------------------------------

# Build a primitive mesh of the requested type, applying size/radius/height
# where the mesh class supports them. Returns the mesh, or null if unknown.
func _make_primitive_mesh(mesh_type, params):
    var t = str(mesh_type).to_lower()
    var mesh
    match t:
        "box":
            mesh = BoxMesh.new()
            if params.has("size"):
                mesh.size = _to_vec3(params.size)
        "sphere":
            mesh = SphereMesh.new()
            if params.has("radius"):
                mesh.radius = float(params.radius)
            if params.has("height"):
                mesh.height = float(params.height)
        "cylinder":
            mesh = CylinderMesh.new()
            if params.has("radius"):
                mesh.top_radius = float(params.radius)
                mesh.bottom_radius = float(params.radius)
            if params.has("height"):
                mesh.height = float(params.height)
        "capsule":
            mesh = CapsuleMesh.new()
            if params.has("radius"):
                mesh.radius = float(params.radius)
            if params.has("height"):
                mesh.height = float(params.height)
        "plane":
            mesh = PlaneMesh.new()
            if params.has("size"):
                var a = _num_array(params.size)
                while a.size() < 2:
                    a.append(2.0)
                mesh.size = Vector2(a[0], a[1])
        "prism":
            mesh = PrismMesh.new()
            if params.has("size"):
                mesh.size = _to_vec3(params.size)
        "torus":
            mesh = TorusMesh.new()
            if params.has("radius") and "outer_radius" in mesh:
                mesh.outer_radius = float(params.radius)
        _:
            return null
    return mesh

func add_mesh_instance(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_path", "")))
        root.free()
        return
    var mesh_type = str(params.get("mesh_type", "box"))
    var mesh = _make_primitive_mesh(mesh_type, params)
    if mesh == null:
        fail("unknown mesh type '" + mesh_type + "'")
        root.free()
        return
    var mi = MeshInstance3D.new()
    mi.name = str(params.name)
    mi.mesh = mesh
    parent.add_child(mi)
    mi.owner = root
    var created_path = str(root.get_path_to(mi))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": created_path,
            "type": mi.get_class(),
            "mesh_type": mesh_type.to_lower(),
            "mesh": mesh.get_class(),
            "created": true,
        })
    root.free()

func setup_lighting(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_path", "")))
        root.free()
        return
    var light_type = str(params.get("light_type", "directional")).to_lower()
    var light
    var default_name
    match light_type:
        "omni":
            light = OmniLight3D.new()
            default_name = "OmniLight3D"
        "spot":
            light = SpotLight3D.new()
            default_name = "SpotLight3D"
        _:
            light = DirectionalLight3D.new()
            default_name = "DirectionalLight3D"
            light_type = "directional"
    light.name = str(params.get("name", default_name))
    # Apply a tasteful preset, if given.
    if params.has("preset"):
        var preset = str(params.preset).to_lower()
        match preset:
            "sun":
                light.light_color = Color(1.0, 0.96, 0.88)
                light.light_energy = 1.2
                light.rotation_degrees = Vector3(-50, -30, 0)
            "indoor":
                light.light_color = Color(1.0, 0.95, 0.85)
                light.light_energy = 0.8
                light.rotation_degrees = Vector3(-60, 20, 0)
            "dramatic":
                light.light_color = Color(0.6, 0.7, 1.0)
                light.light_energy = 2.5
                light.rotation_degrees = Vector3(-25, 130, 0)
    # Explicit values override / supplement the preset.
    if params.has("energy"):
        light.light_energy = float(params.energy)
    if params.has("color"):
        light.light_color = _to_color(params.color)
    parent.add_child(light)
    light.owner = root
    var created_path = str(root.get_path_to(light))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": created_path,
            "type": light.get_class(),
            "light_energy": light.light_energy,
            "light_color": json_safe(light.light_color),
            "created": true,
        })
    root.free()

func set_material_3d(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    if not (node is MeshInstance3D):
        fail("node is not a MeshInstance3D: " + str(params.node_path))
        root.free()
        return
    var surface_index = int(params.get("surface_index", 0))
    var mat = node.get_surface_override_material(surface_index)
    if mat == null or not (mat is StandardMaterial3D):
        mat = StandardMaterial3D.new()
    var applied = []
    if params.has("albedo_color"):
        mat.albedo_color = _to_color(params.albedo_color)
        applied.append("albedo_color")
    if params.has("metallic"):
        mat.metallic = clampf(float(params.metallic), 0.0, 1.0)
        applied.append("metallic")
    if params.has("roughness"):
        mat.roughness = clampf(float(params.roughness), 0.0, 1.0)
        applied.append("roughness")
    node.set_surface_override_material(surface_index, mat)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "surface_index": surface_index,
            "material": mat.get_class(),
            "applied": applied,
        })
    root.free()

func setup_environment(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_path", "")))
        root.free()
        return
    var we = WorldEnvironment.new()
    we.name = str(params.get("name", "WorldEnvironment"))
    var env = Environment.new()
    var bg_mode = str(params.get("background_mode", "sky")).to_lower()
    match bg_mode:
        "color":
            env.background_mode = Environment.BG_COLOR
        "clear_color":
            env.background_mode = Environment.BG_CLEAR_COLOR
        _:
            bg_mode = "sky"
            env.background_mode = Environment.BG_SKY
            var sky = Sky.new()
            sky.sky_material = ProceduralSkyMaterial.new()
            env.sky = sky
    if params.has("clear_color"):
        env.background_color = _to_color(params.clear_color)
    var enabled_features = []
    if params.has("features"):
        for feature in params.features:
            var f = str(feature).to_lower()
            match f:
                "ssao":
                    env.ssao_enabled = true
                    enabled_features.append("ssao")
                "glow":
                    env.glow_enabled = true
                    enabled_features.append("glow")
                "fog":
                    env.fog_enabled = true
                    enabled_features.append("fog")
    we.environment = env
    parent.add_child(we)
    we.owner = root
    var created_path = str(root.get_path_to(we))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": created_path,
            "type": we.get_class(),
            "background_mode": bg_mode,
            "features": enabled_features,
            "created": true,
        })
    root.free()

func setup_camera_3d(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_path", "")))
        root.free()
        return
    var cam = Camera3D.new()
    cam.name = str(params.get("name", "Camera3D"))
    var projection = str(params.get("projection", "perspective")).to_lower()
    if projection == "orthogonal":
        cam.projection = Camera3D.PROJECTION_ORTHOGONAL
    else:
        projection = "perspective"
        cam.projection = Camera3D.PROJECTION_PERSPECTIVE
    if params.has("fov"):
        cam.fov = float(params.fov)
    if params.has("position"):
        cam.position = _to_vec3(params.position)
    if params.has("current"):
        cam.current = bool(params.current)
    parent.add_child(cam)
    cam.owner = root
    var created_path = str(root.get_path_to(cam))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": created_path,
            "type": cam.get_class(),
            "projection": projection,
            "current": cam.current,
            "created": true,
        })
    root.free()

func add_gridmap(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var parent = resolve_node(root, params.get("parent_path", ""))
    if parent == null:
        fail("find parent node: " + str(params.get("parent_path", "")))
        root.free()
        return
    var gridmap = GridMap.new()
    gridmap.name = str(params.name)
    var has_mesh_library = false
    if params.has("mesh_library"):
        var lib_path = _res_path(str(params.mesh_library))
        if ResourceLoader.exists(lib_path):
            var lib = load(lib_path)
            if lib != null and lib is MeshLibrary:
                gridmap.mesh_library = lib
                has_mesh_library = true
    if params.has("cell_size"):
        gridmap.cell_size = _to_vec3(params.cell_size)
    parent.add_child(gridmap)
    gridmap.owner = root
    var created_path = str(root.get_path_to(gridmap))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": created_path,
            "type": gridmap.get_class(),
            "has_mesh_library": has_mesh_library,
            "created": true,
        })
    root.free()

# --- Batch 5: node / script / batch / uid tools -----------------------------

# Reparent a node while preserving its on-screen transform. Differs from
# reparent_node by explicitly capturing and restoring the global transform of
# Node2D / Node3D / Control nodes before and after the move.
func move_node_op(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    var new_parent = resolve_node(root, params.new_parent)
    if new_parent == null:
        fail("find new parent: " + str(params.new_parent))
        root.free()
        return
    if node == root:
        fail("move_node: cannot move the scene root")
        root.free()
        return
    if new_parent == node or _is_ancestor_of(node, new_parent):
        fail("move_node: cannot move a node under itself or its descendant")
        root.free()
        return
    var keep = params.get("keep_global_transform", true)
    # Capture the global transform up-front so it survives the reparent.
    var had_xform = false
    var xform_2d = Transform2D()
    var xform_3d = Transform3D()
    if keep:
        if node is Node2D or node is Control:
            xform_2d = node.global_transform
            had_xform = true
        elif node is Node3D:
            xform_3d = node.global_transform
            had_xform = true
    var old_parent = node.get_parent()
    if old_parent != null:
        old_parent.remove_child(node)
    new_parent.add_child(node)
    if keep and had_xform:
        if node is Node2D or node is Control:
            node.global_transform = xform_2d
        elif node is Node3D:
            node.global_transform = xform_3d
    var new_path = str(root.get_path_to(node))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": new_path,
            "new_parent": str(params.new_parent),
            "kept_global_transform": keep and had_xform,
        })
    root.free()

# True if "ancestor" is an ancestor of "node" within the same tree.
func _is_ancestor_of(ancestor, node):
    var cur = node.get_parent()
    while cur != null:
        if cur == ancestor:
            return true
        cur = cur.get_parent()
    return false

# Instantiate a named Resource subclass, apply optional properties, and assign
# it to a node property. Fails if the class is not a Resource or the property
# does not exist on the node.
func add_resource_op(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    var prop = str(params.property)
    var has_prop = false
    for info in node.get_property_list():
        if info.name == prop:
            has_prop = true
            break
    if not has_prop:
        fail("add_resource: property does not exist on node: " + prop)
        root.free()
        return
    var res_type = str(params.resource_type)
    if not ClassDB.class_exists(res_type):
        fail("add_resource: unknown class: " + res_type)
        root.free()
        return
    if not ClassDB.is_parent_class(res_type, "Resource"):
        fail("add_resource: class is not a Resource: " + res_type)
        root.free()
        return
    if not ClassDB.can_instantiate(res_type):
        fail("add_resource: class cannot be instantiated: " + res_type)
        root.free()
        return
    var res = ClassDB.instantiate(res_type)
    if res == null or not (res is Resource):
        fail("add_resource: failed to instantiate Resource: " + res_type)
        root.free()
        return
    var applied = []
    var props = params.get("properties", {})
    if typeof(props) == TYPE_DICTIONARY:
        for k in props:
            var pk = str(k)
            res.set(pk, coerce_value(res, pk, props[k]))
            applied.append(pk)
    node.set(prop, res)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "property": prop,
            "resource_type": res_type,
            "applied_properties": applied,
        })
    root.free()

# Apply a layout preset to a Control's anchors only (no offsets).
func set_anchor_preset_op(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    if not (node is Control):
        fail("node is not a Control: " + str(params.node_path))
        root.free()
        return
    var preset = _control_preset(params.preset)
    if preset == -1:
        fail("unknown anchor preset: " + str(params.preset))
        root.free()
        return
    node.set_anchors_preset(preset)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "preset": str(params.preset),
        })
    root.free()

# Replace a node's group membership with the provided list (persistent so the
# groups serialize into the scene file).
func set_node_groups_op(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var node = resolve_node(root, params.node_path)
    if node == null:
        fail("find node: " + str(params.node_path))
        root.free()
        return
    for g in node.get_groups():
        node.remove_from_group(g)
    var groups = params.get("groups", [])
    var result_groups = []
    for g in groups:
        var gname = str(g)
        node.add_to_group(gname, true)
        if not result_groups.has(gname):
            result_groups.append(gname)
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "node": str(params.node_path),
            "groups": result_groups,
        })
    root.free()

# Add multiple nodes to a scene in a single load/save pass.
func batch_add_nodes_op(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var nodes = params.get("nodes", [])
    var results = []
    var created_count = 0
    var error_count = 0
    for entry in nodes:
        if typeof(entry) != TYPE_DICTIONARY:
            results.append({"ok": false, "error": "node spec is not an object"})
            error_count += 1
            continue
        var parent_path = entry.get("parent", "")
        var parent = resolve_node(root, parent_path)
        if parent == null:
            results.append({"ok": false, "parent": str(parent_path), "error": "parent not found"})
            error_count += 1
            continue
        var type_name = str(entry.get("type", "Node"))
        var node = instantiate_class(type_name)
        if node == null:
            results.append({"ok": false, "type": type_name, "error": "cannot instantiate type"})
            error_count += 1
            continue
        if entry.has("name") and entry.name != null:
            node.name = str(entry.name)
        var props = entry.get("properties", {})
        if typeof(props) == TYPE_DICTIONARY:
            for k in props:
                var pk = str(k)
                node.set(pk, coerce_value(node, pk, props[k]))
        parent.add_child(node)
        node.owner = root
        results.append({
            "ok": true,
            "type": node.get_class(),
            "node": str(root.get_path_to(node)),
        })
        created_count += 1
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "requested": nodes.size(),
            "created": created_count,
            "errors": error_count,
            "results": results,
        })
    root.free()

# Set one property on many nodes in a single load/save pass. Targets either an
# explicit list of node paths or every node matching a class filter.
func batch_set_property_op(params):
    var scene_path = _res_path(params.scene_path)
    var root = load_scene_root(scene_path)
    if root == null:
        return
    var prop = str(params.property)
    var value = params.value
    var targets = []
    if params.has("node_paths") and params.node_paths != null and typeof(params.node_paths) == TYPE_ARRAY and params.node_paths.size() > 0:
        for np in params.node_paths:
            var n = resolve_node(root, np)
            if n != null:
                targets.append(n)
    elif params.has("node_type") and str(params.get("node_type", "")) != "":
        var ntype = str(params.node_type)
        _collect_by_class(root, ntype, targets)
    else:
        fail("batch_set_property: provide node_paths or node_type")
        root.free()
        return
    var affected = []
    for n in targets:
        n.set(prop, coerce_value(n, prop, value))
        affected.append(str(root.get_path_to(n)))
    if save_scene_tree(root, scene_path):
        emit_result({
            "scene": scene_path,
            "property": prop,
            "affected": affected.size(),
            "nodes": affected,
        })
    root.free()

# Collect all nodes in the subtree that are instances of the given class.
func _collect_by_class(node, class_filter, out):
    if node.is_class(class_filter):
        out.append(node)
    for child in node.get_children():
        _collect_by_class(child, class_filter, out)

# Set one property on nodes matching a class filter across many scenes. Loads,
# modifies, and saves each scene (unless dry_run) inside one invocation.
func cross_scene_set_property_op(params):
    var prop = str(params.property)
    var value = params.value
    var node_type = str(params.node_type)
    var dry_run = params.get("dry_run", false)
    var scene_paths = params.get("scene_paths", [])
    var per_scene = []
    var total_affected = 0
    var total_scenes = 0
    for sp in scene_paths:
        var scene_path = _res_path(sp)
        if not ResourceLoader.exists(scene_path):
            per_scene.append({"scene": scene_path, "ok": false, "error": "scene does not exist"})
            continue
        var packed = load(scene_path)
        if packed == null or not (packed is PackedScene):
            per_scene.append({"scene": scene_path, "ok": false, "error": "not a valid PackedScene"})
            continue
        var root = packed.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
        if root == null:
            per_scene.append({"scene": scene_path, "ok": false, "error": "could not instantiate"})
            continue
        var targets = []
        _collect_by_class(root, node_type, targets)
        var affected = []
        for n in targets:
            n.set(prop, coerce_value(n, prop, value))
            affected.append(str(root.get_path_to(n)))
        var saved = true
        if not dry_run:
            saved = save_scene_tree(root, scene_path)
        per_scene.append({
            "scene": scene_path,
            "ok": saved,
            "affected": affected.size(),
            "nodes": affected,
            "saved": (not dry_run) and saved,
        })
        if saved:
            total_affected += affected.size()
            total_scenes += 1
        root.free()
    emit_result({
        "property": prop,
        "node_type": node_type,
        "dry_run": dry_run,
        "scenes": per_scene,
        "total_affected": total_affected,
        "total_scenes": total_scenes,
    })

# Define or replace an input action in the InputMap and persist it to project
# settings. Clears any existing events for the action before adding new ones.
func set_input_action_op(params):
    var action = str(params.action)
    var key = "input/" + action
    var deadzone = float(params.get("deadzone", 0.5))
    var events = []
    for spec in params.get("events", []):
        var ev = _build_input_event(spec)
        if ev != null:
            events.append(ev)
    ProjectSettings.set_setting(key, {"deadzone": deadzone, "events": events})
    var err = ProjectSettings.save()
    if err != OK:
        fail("save project settings (error " + str(err) + ")")
        return
    emit_result({"action": action, "event_count": events.size(), "deadzone": deadzone, "replaced": true})

# Resolve a uid:// string to its res:// resource path.
func uid_to_project_path_op(params):
    var uid_text = str(params.uid)
    var id = ResourceUID.text_to_id(uid_text)
    if id == ResourceUID.INVALID_ID or not ResourceUID.has_id(id):
        fail("uid_to_project_path: unknown uid: " + uid_text)
        return
    var path = ResourceUID.get_id_path(id)
    if path == "":
        fail("uid_to_project_path: no path for uid: " + uid_text)
        return
    emit_result({"uid": uid_text, "path": path})

# Resolve a res:// (or project-relative) resource path to its uid:// string.
func project_path_to_uid_op(params):
    var path = _res_path(params.path)
    if not (ResourceLoader.exists(path) or FileAccess.file_exists(path)):
        fail("project_path_to_uid: file does not exist: " + path)
        return
    var id = ResourceLoader.get_resource_uid(path)
    if id == ResourceUID.INVALID_ID:
        fail("project_path_to_uid: no UID assigned for: " + path)
        return
    emit_result({"path": path, "uid": ResourceUID.id_to_text(id)})
