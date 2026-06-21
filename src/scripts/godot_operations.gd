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
