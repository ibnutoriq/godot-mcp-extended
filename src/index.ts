#!/usr/bin/env node
/**
 * Godot MCP Server
 *
 * This MCP server provides tools for interacting with the Godot game engine.
 * It enables AI assistants to launch the Godot editor, run Godot projects,
 * capture debug output, and control project execution.
 */

import { fileURLToPath } from 'url';
import { join, dirname, basename, normalize } from 'path';
import { existsSync, readdirSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from 'fs';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Check if debug mode is enabled
const DEBUG_MODE: boolean = process.env.DEBUG === 'true';
// Verbose GDScript debug branches are opt-in (they add slow self-test paths).
// Enable by setting GODOT_DEBUG=true in the environment.
const GODOT_DEBUG_MODE: boolean = process.env.GODOT_DEBUG === 'true';

// Default timeout (ms) for a single headless Godot operation, overridable via env.
const OPERATION_TIMEOUT_MS: number = parseInt(process.env.GODOT_OP_TIMEOUT || '60000', 10);
// Marker the GDScript ops use to emit a structured JSON result line on stdout.
const RESULT_MARKER = '__RESULT__';

const execFileAsync = promisify(execFile);

// Derive __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Interface representing a running Godot process
 */
interface GodotProcess {
  process: any;
  output: string[];
  errors: string[];
}

/**
 * Interface for server configuration
 */
interface GodotServerConfig {
  godotPath?: string;
  debugMode?: boolean;
  godotDebugMode?: boolean;
  strictPathValidation?: boolean; // New option to control path validation behavior
}

/**
 * Interface for operation parameters
 */
interface OperationParams {
  [key: string]: any;
}

/**
 * Main server class for the Godot MCP server
 */
class GodotServer {
  private server: Server;
  private activeProcess: GodotProcess | null = null;
  private godotPath: string | null = null;
  private operationsScriptPath: string;
  private validatedPaths: Map<string, boolean> = new Map();
  private strictPathValidation: boolean = false;

  /**
   * Parameter name mappings between snake_case and camelCase
   * This allows the server to accept both formats
   */
  private parameterMappings: Record<string, string> = {
    'project_path': 'projectPath',
    'scene_path': 'scenePath',
    'root_node_type': 'rootNodeType',
    'parent_node_path': 'parentNodePath',
    'node_type': 'nodeType',
    'node_name': 'nodeName',
    'texture_path': 'texturePath',
    'node_path': 'nodePath',
    'output_path': 'outputPath',
    'mesh_item_names': 'meshItemNames',
    'new_path': 'newPath',
    'file_path': 'filePath',
    'directory': 'directory',
    'recursive': 'recursive',
    'scene': 'scene',
    // Extended toolset params
    'new_name': 'newName',
    'new_parent_path': 'newParentPath',
    'keep_global_transform': 'keepGlobalTransform',
    'script_path': 'scriptPath',
    'from_node': 'fromNode',
    'to_node': 'toNode',
    'signal_name': 'signalName',
    'instance_scene_path': 'instanceScenePath',
    'autoload_name': 'autoloadName',
    'resource_path': 'resourcePath',
    'resource_class': 'resourceClass',
    'class_name_query': 'classNameQuery',
    'timeout_seconds': 'timeoutSeconds',
    'test_path': 'testPath',
    'wait_frames': 'waitFrames',
    // Performance + capability toolset params
    'stop_on_error': 'stopOnError',
    'name_pattern': 'namePattern',
    'to_index': 'toIndex',
    'player_node': 'playerNode',
    'preset_name': 'presetName',
    'export_path': 'exportPath',
    'debug_export': 'debugExport',
    // TileMap toolset params
    'source_id': 'sourceId',
    'atlas_coords': 'atlasCoords',
    'alternative': 'alternative',
    // Audio toolset params
    'volume_db': 'volumeDb',
    'bus_index': 'busIndex',
    'bus_name': 'busName',
    'effect_type': 'effectType',
    'send_bus': 'sendBus',
    'bypass_effects': 'bypassEffects',
    'is_3d': 'is3d',
    'is_2d': 'is2d',
    'parent_path': 'parentPath',
    // Shader / Theme / Control toolset params
    'shader_type': 'shaderType',
    'shader_path': 'shaderPath',
    'theme_path': 'themePath',
    'theme_type': 'themeType',
    'stylebox_type': 'styleboxType',
    'anchor_preset': 'anchorPreset',
    'h_size_flags': 'hSizeFlags',
    'v_size_flags': 'vSizeFlags',
    // Particles toolset params
    'emission_shape': 'emissionShape',
    'one_shot': 'oneShot',
    'initial_velocity_min': 'initialVelocityMin',
    'initial_velocity_max': 'initialVelocityMax',
    'scale_min': 'scaleMin',
    'scale_max': 'scaleMax',
    'angular_velocity_min': 'angularVelocityMin',
    'angular_velocity_max': 'angularVelocityMax',
    'orbit_velocity_min': 'orbitVelocityMin',
    'orbit_velocity_max': 'orbitVelocityMax',
    'damping_min': 'dampingMin',
    'damping_max': 'dampingMax',
    // Physics toolset params
    'collision_layer': 'collisionLayer',
    'collision_mask': 'collisionMask',
    'motion_mode': 'motionMode',
    'gravity_scale': 'gravityScale',
    'linear_damp': 'linearDamp',
    'angular_damp': 'angularDamp',
    'freeze_mode': 'freezeMode',
    'contact_monitor': 'contactMonitor',
    'max_contacts_reported': 'maxContactsReported',
    'shape_type': 'shapeType',
    'one_way_collision': 'oneWayCollision',
    'target_position': 'targetPosition',
    // Navigation toolset params
    'navigation_layers': 'navigationLayers',
    'outline_vertices': 'outlineVertices',
    'max_speed': 'maxSpeed',
    'path_desired_distance': 'pathDesiredDistance',
    'target_desired_distance': 'targetDesiredDistance',
    'avoidance_enabled': 'avoidanceEnabled',
    // 3D toolset params
    'mesh_type': 'meshType',
    'light_type': 'lightType',
    'surface_index': 'surfaceIndex',
    'albedo_color': 'albedoColor',
    'background_mode': 'backgroundMode',
    'clear_color': 'clearColor',
    'mesh_library': 'meshLibrary',
    'cell_size': 'cellSize',
    // Node / script / batch / uid toolset params
    'new_parent': 'newParent',
    'resource_type': 'resourceType',
    'node_paths': 'nodePaths',
    'scene_paths': 'scenePaths',
    'dry_run': 'dryRun',
    'axis_value': 'axisValue',
    'button_index': 'buttonIndex',
  };

  /**
   * Reverse mapping from camelCase to snake_case
   * Generated from parameterMappings for quick lookups
   */
  private reverseParameterMappings: Record<string, string> = {};

  constructor(config?: GodotServerConfig) {
    // Initialize reverse parameter mappings
    for (const [snakeCase, camelCase] of Object.entries(this.parameterMappings)) {
      this.reverseParameterMappings[camelCase] = snakeCase;
    }
    // Apply configuration if provided
    let debugMode = DEBUG_MODE;
    let godotDebugMode = GODOT_DEBUG_MODE;

    if (config) {
      if (config.debugMode !== undefined) {
        debugMode = config.debugMode;
      }
      if (config.godotDebugMode !== undefined) {
        godotDebugMode = config.godotDebugMode;
      }
      if (config.strictPathValidation !== undefined) {
        this.strictPathValidation = config.strictPathValidation;
      }

      // Store and validate custom Godot path if provided
      if (config.godotPath) {
        const normalizedPath = normalize(config.godotPath);
        this.godotPath = normalizedPath;
        this.logDebug(`Custom Godot path provided: ${this.godotPath}`);

        // Validate immediately with sync check
        if (!this.isValidGodotPathSync(this.godotPath)) {
          console.warn(`[SERVER] Invalid custom Godot path provided: ${this.godotPath}`);
          this.godotPath = null; // Reset to trigger auto-detection later
        }
      }
    }

    // Set the path to the operations script
    this.operationsScriptPath = join(__dirname, 'scripts', 'godot_operations.gd');
    if (debugMode) console.error(`[DEBUG] Operations script path: ${this.operationsScriptPath}`);

    // Initialize the MCP server
    this.server = new Server(
      {
        name: 'godot-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up tool handlers
    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);

    // Cleanup on exit
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Log debug messages if debug mode is enabled
   * Using stderr instead of stdout to avoid interfering with JSON-RPC communication
   */
  private logDebug(message: string): void {
    if (DEBUG_MODE) {
      console.error(`[DEBUG] ${message}`);
    }
  }

  /**
   * Create a standardized error response with possible solutions
   */
  private createErrorResponse(message: string, possibleSolutions: string[] = []): any {
    // Log the error
    console.error(`[SERVER] Error response: ${message}`);
    if (possibleSolutions.length > 0) {
      console.error(`[SERVER] Possible solutions: ${possibleSolutions.join(', ')}`);
    }

    const response: any = {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    };

    if (possibleSolutions.length > 0) {
      response.content.push({
        type: 'text',
        text: 'Possible solutions:\n- ' + possibleSolutions.join('\n- '),
      });
    }

    return response;
  }

  /**
   * Validate a path to prevent path traversal attacks
   */
  private validatePath(path: string): boolean {
    // Basic validation to prevent path traversal and null-byte injection.
    if (!path || path.includes('..') || path.includes('\0')) {
      return false;
    }

    // Add more validation as needed
    return true;
  }

  /**
   * Validate a path that must stay *inside* the Godot project (scenes, scripts,
   * resources, textures, output files). Stricter than validatePath: in addition
   * to blocking ".." traversal and null bytes, it rejects absolute filesystem
   * paths and user:// so that writes initiated by tools cannot escape the
   * project. A leading "res://" is allowed and treated as project-relative.
   */
  private validateResourcePath(path: string): boolean {
    if (!path || path.includes('..') || path.includes('\0')) {
      return false;
    }
    // user:// points outside the project tree; reject for write-safety.
    if (path.startsWith('user://')) {
      return false;
    }
    const stripped = path.startsWith('res://') ? path.slice('res://'.length) : path;
    // Absolute POSIX path or Windows drive path escapes the project.
    if (stripped.startsWith('/') || stripped.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(stripped)) {
      return false;
    }
    return true;
  }

  /**
   * Validate a Godot class name to prevent arbitrary script instantiation.
   * Class names must be simple identifiers (e.g. "Node2D", "CharacterBody3D").
   * Rejects anything that looks like a path (res://, absolute paths, dots, slashes, colons).
   */
  private validateClassName(name: string): boolean {
    if (!name) return false;
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
  }

  /**
   * Synchronous validation for constructor use
   * This is a quick check that only verifies file existence, not executable validity
   * Full validation will be performed later in detectGodotPath
   * @param path Path to check
   * @returns True if the path exists or is 'godot' (which might be in PATH)
   */
  private isValidGodotPathSync(path: string): boolean {
    try {
      this.logDebug(`Quick-validating Godot path: ${path}`);
      return path === 'godot' || existsSync(path);
    } catch (error) {
      this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
      return false;
    }
  }

  /**
   * Validate if a Godot path is valid and executable
   */
  private async isValidGodotPath(path: string): Promise<boolean> {
    // Check cache first
    if (this.validatedPaths.has(path)) {
      return this.validatedPaths.get(path)!;
    }

    try {
      this.logDebug(`Validating Godot path: ${path}`);

      // Check if the file exists (skip for 'godot' which might be in PATH)
      if (path !== 'godot' && !existsSync(path)) {
        this.logDebug(`Path does not exist: ${path}`);
        this.validatedPaths.set(path, false);
        return false;
      }

      // Try to execute Godot with --version flag
      // Using execFileAsync with argument array to prevent command injection
      await execFileAsync(path, ['--version']);

      this.logDebug(`Valid Godot path: ${path}`);
      this.validatedPaths.set(path, true);
      return true;
    } catch (error) {
      this.logDebug(`Invalid Godot path: ${path}, error: ${error}`);
      this.validatedPaths.set(path, false);
      return false;
    }
  }

  /**
   * Detect the Godot executable path based on the operating system
   */
  private async detectGodotPath() {
    // If godotPath is already set and valid, use it
    if (this.godotPath && await this.isValidGodotPath(this.godotPath)) {
      this.logDebug(`Using existing Godot path: ${this.godotPath}`);
      return;
    }

    // Check environment variable next
    if (process.env.GODOT_PATH) {
      const normalizedPath = normalize(process.env.GODOT_PATH);
      this.logDebug(`Checking GODOT_PATH environment variable: ${normalizedPath}`);
      if (await this.isValidGodotPath(normalizedPath)) {
        this.godotPath = normalizedPath;
        this.logDebug(`Using Godot path from environment: ${this.godotPath}`);
        return;
      } else {
        this.logDebug(`GODOT_PATH environment variable is invalid`);
      }
    }

    // Auto-detect based on platform
    const osPlatform = process.platform;
    this.logDebug(`Auto-detecting Godot path for platform: ${osPlatform}`);

    const possiblePaths: string[] = [
      'godot', // Check if 'godot' is in PATH first
    ];

    // Add platform-specific paths
    if (osPlatform === 'darwin') {
      possiblePaths.push(
        '/Applications/Godot.app/Contents/MacOS/Godot',
        '/Applications/Godot_4.app/Contents/MacOS/Godot',
        `${process.env.HOME}/Applications/Godot.app/Contents/MacOS/Godot`,
        `${process.env.HOME}/Applications/Godot_4.app/Contents/MacOS/Godot`,
        `${process.env.HOME}/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot`
      );
    } else if (osPlatform === 'win32') {
      possiblePaths.push(
        'C:\\Program Files\\Godot\\Godot.exe',
        'C:\\Program Files (x86)\\Godot\\Godot.exe',
        'C:\\Program Files\\Godot_4\\Godot.exe',
        'C:\\Program Files (x86)\\Godot_4\\Godot.exe',
        `${process.env.USERPROFILE}\\Godot\\Godot.exe`
      );
    } else if (osPlatform === 'linux') {
      possiblePaths.push(
        '/usr/bin/godot',
        '/usr/local/bin/godot',
        '/snap/bin/godot',
        `${process.env.HOME}/.local/bin/godot`
      );
    }

    // Try each possible path
    for (const path of possiblePaths) {
      const normalizedPath = normalize(path);
      if (await this.isValidGodotPath(normalizedPath)) {
        this.godotPath = normalizedPath;
        this.logDebug(`Found Godot at: ${normalizedPath}`);
        return;
      }
    }

    // If we get here, we couldn't find Godot
    this.logDebug(`Warning: Could not find Godot in common locations for ${osPlatform}`);
    console.error(`[SERVER] Could not find Godot in common locations for ${osPlatform}`);
    console.error(`[SERVER] Set GODOT_PATH=/path/to/godot environment variable or pass { godotPath: '/path/to/godot' } in the config to specify the correct path.`);

    if (this.strictPathValidation) {
      // In strict mode, throw an error
      throw new Error(`Could not find a valid Godot executable. Set GODOT_PATH or provide a valid path in config.`);
    } else {
      // Fallback to a default path in non-strict mode; this may not be valid and requires user configuration for reliability
      if (osPlatform === 'win32') {
        this.godotPath = normalize('C:\\Program Files\\Godot\\Godot.exe');
      } else if (osPlatform === 'darwin') {
        this.godotPath = normalize('/Applications/Godot.app/Contents/MacOS/Godot');
      } else {
        this.godotPath = normalize('/usr/bin/godot');
      }

      this.logDebug(`Using default path: ${this.godotPath}, but this may not work.`);
      console.error(`[SERVER] Using default path: ${this.godotPath}, but this may not work.`);
      console.error(`[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.`);
    }
  }

  /**
   * Set a custom Godot path
   * @param customPath Path to the Godot executable
   * @returns True if the path is valid and was set, false otherwise
   */
  public async setGodotPath(customPath: string): Promise<boolean> {
    if (!customPath) {
      return false;
    }

    // Normalize the path to ensure consistent format across platforms
    // (e.g., backslashes to forward slashes on Windows, resolving relative paths)
    const normalizedPath = normalize(customPath);
    if (await this.isValidGodotPath(normalizedPath)) {
      this.godotPath = normalizedPath;
      this.logDebug(`Godot path set to: ${normalizedPath}`);
      return true;
    }

    this.logDebug(`Failed to set invalid Godot path: ${normalizedPath}`);
    return false;
  }

  /**
   * Clean up resources when shutting down
   */
  private async cleanup() {
    this.logDebug('Cleaning up resources');
    if (this.activeProcess) {
      this.logDebug('Killing active Godot process');
      this.activeProcess.process.kill();
      this.activeProcess = null;
    }
    await this.server.close();
  }

  /**
   * Check if the Godot version is 4.4 or later
   * @param version The Godot version string
   * @returns True if the version is 4.4 or later
   */
  private isGodot44OrLater(version: string): boolean {
    const match = version.match(/^(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      return major > 4 || (major === 4 && minor >= 4);
    }
    return false;
  }

  /**
   * Normalize parameters to camelCase format
   * @param params Object with either snake_case or camelCase keys
   * @returns Object with all keys in camelCase format
   */
  private normalizeParameters(params: OperationParams): OperationParams {
    if (!params || typeof params !== 'object') {
      return params;
    }
    
    const result: OperationParams = {};
    
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        let normalizedKey = key;
        
        // If the key is in snake_case, convert it to camelCase using our mapping
        if (key.includes('_') && this.parameterMappings[key]) {
          normalizedKey = this.parameterMappings[key];
        }
        
        // Handle nested objects recursively
        if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
          result[normalizedKey] = this.normalizeParameters(params[key] as OperationParams);
        } else {
          result[normalizedKey] = params[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Convert camelCase keys to snake_case
   * @param params Object with camelCase keys
   * @returns Object with snake_case keys
   */
  private convertCamelToSnakeCase(params: OperationParams): OperationParams {
    const result: OperationParams = {};
    
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        // Convert camelCase to snake_case
        const snakeKey = this.reverseParameterMappings[key] || key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        
        // Handle nested objects recursively
        if (typeof params[key] === 'object' && params[key] !== null && !Array.isArray(params[key])) {
          result[snakeKey] = this.convertCamelToSnakeCase(params[key] as OperationParams);
        } else {
          result[snakeKey] = params[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Execute a Godot operation using the operations script
   * @param operation The operation to execute
   * @param params The parameters for the operation
   * @param projectPath The path to the Godot project
   * @returns The stdout and stderr from the operation
   */
  private async executeOperation(
    operation: string,
    params: OperationParams,
    projectPath: string,
    timeoutMs: number = OPERATION_TIMEOUT_MS
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    this.logDebug(`Executing operation: ${operation} in project: ${projectPath}`);
    this.logDebug(`Original operation params: ${JSON.stringify(params)}`);

    // Convert camelCase parameters to snake_case for Godot script
    const snakeCaseParams = this.convertCamelToSnakeCase(params);
    this.logDebug(`Converted snake_case params: ${JSON.stringify(snakeCaseParams)}`);


    // Ensure godotPath is set
    if (!this.godotPath) {
      await this.detectGodotPath();
      if (!this.godotPath) {
        throw new Error('Could not find a valid Godot executable path');
      }
    }

    try {
      // Serialize the snake_case parameters to a valid JSON string
      const paramsJson = JSON.stringify(snakeCaseParams);

      // Build argument array for execFile to prevent command injection
      // Using execFile with argument arrays avoids shell interpretation entirely
      const args = [
        '--headless',
        '--path',
        projectPath,  // Safe: passed as argument, not interpolated into shell command
        '--script',
        this.operationsScriptPath,
        operation,
        paramsJson,  // Safe: passed as argument, not interpreted by shell
      ];

      
      if (GODOT_DEBUG_MODE) {
        args.push('--debug-godot');
      }

      this.logDebug(`Executing: ${this.godotPath} ${args.join(' ')}`);

      const { stdout, stderr } = await execFileAsync(this.godotPath!, args, {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 32,
      });

      // execFileAsync only resolves on exit code 0.
      return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 };
    } catch (error: unknown) {
      // If execFileAsync throws, it still contains stdout/stderr plus the exit code.
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        const execError = error as Error & { stdout: string; stderr: string; code?: number; killed?: boolean };
        if (execError.killed) {
          throw new Error(`Godot operation '${operation}' timed out after ${timeoutMs}ms`);
        }
        return {
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
          code: typeof execError.code === 'number' ? execError.code : 1,
        };
      }

      throw error;
    }
  }

  /**
   * Execute an operation and parse its structured result.
   *
   * New operations report success/failure via the process exit code AND emit a
   * single `__RESULT__<json>` line on stdout. This unifies error detection
   * (exit code is authoritative; the legacy "Failed to" stderr heuristic is kept
   * only as a fallback) and returns parsed data to the caller.
   */
  private async executeStructuredOperation(
    operation: string,
    params: OperationParams,
    projectPath: string,
    timeoutMs: number = OPERATION_TIMEOUT_MS
  ): Promise<{ success: boolean; result: any | null; stdout: string; stderr: string }> {
    const { stdout, stderr, code } = await this.executeOperation(operation, params, projectPath, timeoutMs);

    let result: any | null = null;
    for (const line of stdout.split('\n')) {
      const idx = line.indexOf(RESULT_MARKER);
      if (idx !== -1) {
        try {
          result = JSON.parse(line.slice(idx + RESULT_MARKER.length));
        } catch {
          // Leave result null if the payload is malformed.
        }
      }
    }

    const success = code === 0 && !(stderr && stderr.includes('Failed to'));
    return { success, result, stdout, stderr };
  }

  /**
   * Shared guard: validate the project directory and that paths are safe.
   * Returns an error response object if invalid, otherwise null.
   */
  private checkProject(projectPath: string, ...paths: string[]): any | null {
    if (!projectPath) {
      return this.createErrorResponse('Missing required parameter: projectPath', ['Provide a projectPath']);
    }
    if (!this.validatePath(projectPath)) {
      return this.createErrorResponse('Invalid projectPath', ['Provide a valid path without ".." segments or null bytes']);
    }
    // The remaining paths are project-relative resource paths; hold them to the
    // stricter standard so tool-initiated writes stay inside the project.
    for (const p of paths) {
      if (p && !this.validateResourcePath(p)) {
        return this.createErrorResponse(`Invalid path: ${p}`, [
          'Use a project-relative path (or res://...) without ".." segments',
          'Absolute paths and user:// are not allowed for project resources',
        ]);
      }
    }
    const projectFile = join(projectPath, 'project.godot');
    if (!existsSync(projectFile)) {
      return this.createErrorResponse(`Not a valid Godot project: ${projectPath}`, [
        'Ensure the path points to a directory containing a project.godot file',
        'Use list_projects to find valid Godot projects',
      ]);
    }
    return null;
  }

  /**
   * Build a standard success response carrying both a human summary and the
   * structured JSON payload (pretty-printed) for downstream tooling.
   */
  private structuredResponse(summary: string, result: any): any {
    const payload = result !== null && result !== undefined ? JSON.stringify(result, null, 2) : '';
    return {
      content: [
        { type: 'text', text: payload ? `${summary}\n\n${payload}` : summary },
      ],
    };
  }

  /**
   * Get the structure of a Godot project
   * @param projectPath Path to the Godot project
   * @returns Object representing the project structure
   */
  private async getProjectStructure(projectPath: string): Promise<any> {
    try {
      // Get top-level directories in the project
      const entries = readdirSync(projectPath, { withFileTypes: true });

      const structure: any = {
        scenes: [],
        scripts: [],
        assets: [],
        other: [],
      };

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirName = entry.name.toLowerCase();

          // Skip hidden directories
          if (dirName.startsWith('.')) {
            continue;
          }

          // Count files in common directories
          if (dirName === 'scenes' || dirName.includes('scene')) {
            structure.scenes.push(entry.name);
          } else if (dirName === 'scripts' || dirName.includes('script')) {
            structure.scripts.push(entry.name);
          } else if (
            dirName === 'assets' ||
            dirName === 'textures' ||
            dirName === 'models' ||
            dirName === 'sounds' ||
            dirName === 'music'
          ) {
            structure.assets.push(entry.name);
          } else {
            structure.other.push(entry.name);
          }
        }
      }

      return structure;
    } catch (error) {
      this.logDebug(`Error getting project structure: ${error}`);
      return { error: 'Failed to get project structure' };
    }
  }

  /**
   * Find Godot projects in a directory
   * @param directory Directory to search
   * @param recursive Whether to search recursively
   * @returns Array of Godot projects
   */
  private findGodotProjects(directory: string, recursive: boolean): Array<{ path: string; name: string }> {
    const projects: Array<{ path: string; name: string }> = [];

    try {
      // Check if the directory itself is a Godot project
      const projectFile = join(directory, 'project.godot');
      if (existsSync(projectFile)) {
        projects.push({
          path: directory,
          name: basename(directory),
        });
      }

      // If not recursive, only check immediate subdirectories
      if (!recursive) {
        const entries = readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subdir = join(directory, entry.name);
            const projectFile = join(subdir, 'project.godot');
            if (existsSync(projectFile)) {
              projects.push({
                path: subdir,
                name: entry.name,
              });
            }
          }
        }
      } else {
        // Recursive search
        const entries = readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subdir = join(directory, entry.name);
            // Skip hidden directories
            if (entry.name.startsWith('.')) {
              continue;
            }
            // Check if this directory is a Godot project
            const projectFile = join(subdir, 'project.godot');
            if (existsSync(projectFile)) {
              projects.push({
                path: subdir,
                name: entry.name,
              });
            } else {
              // Recursively search this directory
              const subProjects = this.findGodotProjects(subdir, true);
              projects.push(...subProjects);
            }
          }
        }
      }
    } catch (error) {
      this.logDebug(`Error searching directory ${directory}: ${error}`);
    }

    return projects;
  }

  /**
   * Set up the tool handlers for the MCP server
   */
  private setupToolHandlers() {
    // Define available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'launch_editor',
          description: 'Launch Godot editor for a specific project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'run_project',
          description: 'Run the Godot project and capture output',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scene: {
                type: 'string',
                description: 'Optional: Specific scene to run',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'get_debug_output',
          description: 'Get the current debug output and errors',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'stop_project',
          description: 'Stop the currently running Godot project',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_godot_version',
          description: 'Get the installed Godot version',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'list_projects',
          description: 'List Godot projects in a directory',
          inputSchema: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: 'Directory to search for Godot projects',
              },
              recursive: {
                type: 'boolean',
                description: 'Whether to search recursively (default: false)',
              },
            },
            required: ['directory'],
          },
        },
        {
          name: 'get_project_info',
          description: 'Retrieve metadata about a Godot project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'create_scene',
          description: 'Create a new Godot scene file',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path where the scene file will be saved (relative to project)',
              },
              rootNodeType: {
                type: 'string',
                description: 'Type of the root node (e.g., Node2D, Node3D)',
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'add_node',
          description: 'Add a node to an existing scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              parentNodePath: {
                type: 'string',
                description: 'Path to the parent node (e.g., "root" or "root/Player")',
              },
              nodeType: {
                type: 'string',
                description: 'Type of node to add (e.g., Sprite2D, CollisionShape2D)',
              },
              nodeName: {
                type: 'string',
                description: 'Name for the new node',
              },
              properties: {
                type: 'object',
                description: 'Optional properties to set on the node',
              },
            },
            required: ['projectPath', 'scenePath', 'nodeType', 'nodeName'],
          },
        },
        {
          name: 'load_sprite',
          description: 'Load a sprite into a Sprite2D node',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              nodePath: {
                type: 'string',
                description: 'Path to the Sprite2D node (e.g., "root/Player/Sprite2D")',
              },
              texturePath: {
                type: 'string',
                description: 'Path to the texture file (relative to project)',
              },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'texturePath'],
          },
        },
        {
          name: 'export_mesh_library',
          description: 'Export a scene as a MeshLibrary resource',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (.tscn) to export',
              },
              outputPath: {
                type: 'string',
                description: 'Path where the mesh library (.res) will be saved',
              },
              meshItemNames: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Optional: Names of specific mesh items to include (defaults to all)',
              },
            },
            required: ['projectPath', 'scenePath', 'outputPath'],
          },
        },
        {
          name: 'save_scene',
          description: 'Save changes to a scene file',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              scenePath: {
                type: 'string',
                description: 'Path to the scene file (relative to project)',
              },
              newPath: {
                type: 'string',
                description: 'Optional: New path to save the scene to (for creating variants)',
              },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'get_uid',
          description: 'Get the UID for a specific file in a Godot project (for Godot 4.4+)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
              filePath: {
                type: 'string',
                description: 'Path to the file (relative to project) for which to get the UID',
              },
            },
            required: ['projectPath', 'filePath'],
          },
        },
        {
          name: 'update_project_uids',
          description: 'Update UID references in a Godot project by resaving resources (for Godot 4.4+)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: {
                type: 'string',
                description: 'Path to the Godot project directory',
              },
            },
            required: ['projectPath'],
          },
        },
        // ===== Phase 1: READ / inspect =====
        {
          name: 'get_scene_tree',
          description: 'Inspect a scene: returns its full node tree (names, types, paths, scripts, groups) as JSON',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file (relative to project, e.g. scenes/main.tscn)' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'get_node_properties',
          description: 'Read the properties of a single node in a scene. mode "overrides" returns only non-default values, "effective" returns all stored values.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node within the scene (e.g. Player/Sprite2D). Empty/"root" for the root node.' },
              mode: { type: 'string', enum: ['overrides', 'effective'], description: 'overrides (default) or effective' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'get_scene_dependencies',
          description: 'List the external resources (scripts, textures, instanced scenes) a scene references, and whether each exists',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'describe_class',
          description: 'Introspect a Godot built-in class via ClassDB: its parent, properties, methods, and signals. Use to discover valid property/signal names before editing.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              className: { type: 'string', description: 'The Godot class to describe (e.g. CharacterBody2D)' },
            },
            required: ['projectPath', 'className'],
          },
        },
        {
          name: 'list_scripts',
          description: 'List all GDScript (.gd) files in the project (or a subdirectory)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              directory: { type: 'string', description: 'Optional subdirectory (relative to project) to limit the search' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'read_script',
          description: 'Read the source of a script file in the project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scriptPath: { type: 'string', description: 'Path to the .gd file (relative to project)' },
            },
            required: ['projectPath', 'scriptPath'],
          },
        },
        // ===== Phase 2: VALIDATE / diagnostics =====
        {
          name: 'check_script',
          description: 'Parse/compile-check a GDScript file using Godot --check-only. Returns parse errors/warnings without running the game.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scriptPath: { type: 'string', description: 'Path to the .gd file to check (relative to project)' },
            },
            required: ['projectPath', 'scriptPath'],
          },
        },
        {
          name: 'validate_scene',
          description: 'Validate a scene headless: reports whether it loads/instantiates and lists any missing dependencies',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'run_and_capture_errors',
          description: 'Run the project (optionally a single scene) for a bounded time and return captured stdout plus structured script errors/warnings',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scene: { type: 'string', description: 'Optional specific scene to run (relative to project)' },
              timeoutSeconds: { type: 'number', description: 'How long to let the project run before stopping (default 5)' },
            },
            required: ['projectPath'],
          },
        },
        // ===== Phase 3: EDIT / structural =====
        {
          name: 'set_node_property',
          description: 'Set a property on an existing node in a scene. Values are coerced to the property type (e.g. [x,y] -> Vector2, "res://..." -> resource).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node within the scene' },
              property: { type: 'string', description: 'Property name (e.g. position, modulate, text)' },
              value: { description: 'The value to set (number, string, bool, [x,y] array, {r,g,b,a} object, etc.)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'property', 'value'],
          },
        },
        {
          name: 'delete_node',
          description: 'Delete a node (and its descendants) from a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node to delete' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'rename_node',
          description: 'Rename a node in a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node to rename' },
              newName: { type: 'string', description: 'The new name for the node' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'newName'],
          },
        },
        {
          name: 'reparent_node',
          description: 'Move a node to a new parent within the same scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node to move' },
              newParentPath: { type: 'string', description: 'Path to the new parent node' },
              keepGlobalTransform: { type: 'boolean', description: 'Preserve global transform (default true)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'newParentPath'],
          },
        },
        {
          name: 'duplicate_node',
          description: 'Duplicate a node subtree within a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node to duplicate' },
              newName: { type: 'string', description: 'Optional name for the duplicate' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'add_to_group',
          description: 'Add a node to a group (persistent, saved in the scene)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node' },
              group: { type: 'string', description: 'Group name' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'group'],
          },
        },
        {
          name: 'remove_from_group',
          description: 'Remove a node from a group',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node' },
              group: { type: 'string', description: 'Group name' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'group'],
          },
        },
        // ===== Phase 4: BEHAVIOR =====
        {
          name: 'create_script',
          description: 'Create a new GDScript file. Optionally specify extends, class_name, and body.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scriptPath: { type: 'string', description: 'Path for the new .gd file (relative to project)' },
              extends: { type: 'string', description: 'Base class to extend (default Node)' },
              className: { type: 'string', description: 'Optional class_name to register globally' },
              content: { type: 'string', description: 'Full script content. If provided, extends/className are ignored.' },
              overwrite: { type: 'boolean', description: 'Overwrite if the file already exists (default false)' },
            },
            required: ['projectPath', 'scriptPath'],
          },
        },
        {
          name: 'attach_script',
          description: 'Attach an existing script to a node in a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node' },
              scriptPath: { type: 'string', description: 'Path to the .gd script (relative to project)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'scriptPath'],
          },
        },
        {
          name: 'connect_signal',
          description: 'Persist a signal connection from one node to a method on another node in the same scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              fromNode: { type: 'string', description: 'Path to the emitting node' },
              signalName: { type: 'string', description: 'Signal name (e.g. pressed, body_entered)' },
              toNode: { type: 'string', description: 'Path to the receiving node' },
              method: { type: 'string', description: 'Method name to call on the receiver' },
            },
            required: ['projectPath', 'scenePath', 'fromNode', 'signalName', 'toNode', 'method'],
          },
        },
        {
          name: 'disconnect_signal',
          description: 'Remove a stored signal connection from a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              fromNode: { type: 'string', description: 'Path to the emitting node' },
              signalName: { type: 'string', description: 'Signal name' },
              toNode: { type: 'string', description: 'Path to the receiving node' },
              method: { type: 'string', description: 'Method name' },
            },
            required: ['projectPath', 'scenePath', 'fromNode', 'signalName', 'toNode', 'method'],
          },
        },
        {
          name: 'list_connections',
          description: 'List all signal connections stored within a scene',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'instance_scene',
          description: 'Add another scene as an instanced child inside a scene (composition / prefabs)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the parent scene file' },
              instanceScenePath: { type: 'string', description: 'Path to the scene to instance' },
              parentNodePath: { type: 'string', description: 'Node to add the instance under (default root)' },
              nodeName: { type: 'string', description: 'Optional name for the instance node' },
            },
            required: ['projectPath', 'scenePath', 'instanceScenePath'],
          },
        },
        // ===== Phase 5: PROJECT settings + resources =====
        {
          name: 'get_project_setting',
          description: 'Read a project setting from project.godot',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              setting: { type: 'string', description: 'Setting key (e.g. application/config/name)' },
            },
            required: ['projectPath', 'setting'],
          },
        },
        {
          name: 'set_project_setting',
          description: 'Set a project setting in project.godot',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              setting: { type: 'string', description: 'Setting key (e.g. display/window/size/viewport_width)' },
              value: { description: 'The value to set' },
            },
            required: ['projectPath', 'setting', 'value'],
          },
        },
        {
          name: 'set_main_scene',
          description: 'Set the project main scene (application/run/main_scene)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene to set as main (relative to project)' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'list_autoloads',
          description: 'List the autoload singletons configured in the project',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'add_autoload',
          description: 'Add (or update) an autoload singleton',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              autoloadName: { type: 'string', description: 'Singleton name (e.g. GameState)' },
              path: { type: 'string', description: 'Path to the script or scene (relative to project)' },
              enabled: { type: 'boolean', description: 'Enable the singleton (default true)' },
            },
            required: ['projectPath', 'autoloadName', 'path'],
          },
        },
        {
          name: 'remove_autoload',
          description: 'Remove an autoload singleton',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              autoloadName: { type: 'string', description: 'Singleton name to remove' },
            },
            required: ['projectPath', 'autoloadName'],
          },
        },
        {
          name: 'add_input_action',
          description: 'Add or extend an input map action with events. Each event: {type:"key", key:"Space"} | {type:"mouse_button", button_index:1} | {type:"joypad_button", button_index:0} | {type:"joypad_motion", axis:0, axis_value:1.0}.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              action: { type: 'string', description: 'Action name (e.g. jump)' },
              events: { type: 'array', description: 'Array of event specs', items: { type: 'object' } },
              deadzone: { type: 'number', description: 'Deadzone (default 0.5)' },
              replace: { type: 'boolean', description: 'Replace existing events instead of appending (default false)' },
            },
            required: ['projectPath', 'action', 'events'],
          },
        },
        {
          name: 'remove_input_action',
          description: 'Remove an input map action',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              action: { type: 'string', description: 'Action name to remove' },
            },
            required: ['projectPath', 'action'],
          },
        },
        {
          name: 'create_resource',
          description: 'Create a new .tres/.res resource of a given class with optional properties (e.g. StandardMaterial3D, custom Resource)',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              resourcePath: { type: 'string', description: 'Path for the new resource (relative to project)' },
              resourceClass: { type: 'string', description: 'Resource class name (e.g. StandardMaterial3D)' },
              properties: { type: 'object', description: 'Optional initial properties' },
            },
            required: ['projectPath', 'resourcePath', 'resourceClass'],
          },
        },
        {
          name: 'edit_resource',
          description: 'Edit properties of an existing resource file',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              resourcePath: { type: 'string', description: 'Path to the resource (relative to project)' },
              properties: { type: 'object', description: 'Properties to set' },
            },
            required: ['projectPath', 'resourcePath', 'properties'],
          },
        },
        {
          name: 'get_resource_properties',
          description: 'Read the stored properties of a resource file as JSON',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              resourcePath: { type: 'string', description: 'Path to the resource (relative to project)' },
            },
            required: ['projectPath', 'resourcePath'],
          },
        },
        // ===== Automated e2e / UAT =====
        {
          name: 'run_scene_test',
          description:
            'Automated end-to-end / UAT test of a scene. Boots the scene headless (real game loop, no rendering), runs a sequence of steps, and evaluates assertions against live game state. Returns per-assertion pass/fail.\n\n' +
            'Each step is an object with an "action". Driver actions: ' +
            '{action:"wait_frames",frames:N} | {action:"wait_seconds",seconds:S} | ' +
            '{action:"press_action",name:"jump",strength:1.0} | {action:"release_action",name:"jump"} | ' +
            '{action:"tap_action",name:"jump",frames:2} | {action:"key",key:"Space",pressed:true} | ' +
            '{action:"mouse_button",button:1,position:[x,y],pressed:true} | {action:"mouse_move",position:[x,y]} | ' +
            '{action:"set_property",node:"Path",property:"x",value:1} | {action:"call_method",node:"Path",method:"start",args:[]} | ' +
            '{action:"emit_signal",node:"Path",signal_name:"hit",args:[]} | {action:"watch_signal",node:"Path",signal_name:"hit"} | ' +
            '{action:"wait_for_signal",node:"Path",signal_name:"hit",timeout_seconds:2}. ' +
            'Assertion actions: ' +
            '{action:"assert_property",node:"Path",property:"position",op:">",value:{x:0}} (op: ==,!=,>,<,>=,<=; for vectors/colors only the provided components are checked) | ' +
            '{action:"assert_node_exists",node:"Path",exists:true} | {action:"assert_in_group",node:"Path",group:"mobs",expected:true} | ' +
            '{action:"assert_signal_emitted",node:"Path",signal_name:"hit",min_count:1} (requires a prior watch_signal) | ' +
            '{action:"assert_method_returns",node:"Path",method:"get_score",args:[],op:">=",value:10} | ' +
            '{action:"assert_node_count",group:"mobs",op:">",value:0}. ' +
            'Node paths are relative to the scene root ("" or "root" = root).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene to test (relative to project)' },
              steps: { type: 'array', description: 'Ordered list of step objects (see description)', items: { type: 'object' } },
              timeoutSeconds: { type: 'number', description: 'Max wall-clock seconds for the whole scenario (default 10)' },
            },
            required: ['projectPath', 'scenePath', 'steps'],
          },
        },
        {
          name: 'run_tests',
          description: 'Run a GUT or GdUnit4 test suite headless and return the pass/fail summary. Auto-detects the framework from the project addons.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              testPath: { type: 'string', description: 'Optional directory or file of tests to run (relative to project, e.g. test/ or res://test)' },
              framework: { type: 'string', enum: ['auto', 'gut', 'gdunit4'], description: 'Force a framework (default auto-detect)' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'capture_scene_screenshot',
          description: 'EXPERIMENTAL visual UAT: boot a scene with a rendering driver and save a PNG screenshot. Requires a GPU/display or a software rasterizer; may fail in pure-headless CI. Returns the image.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene to capture (relative to project)' },
              outputPath: { type: 'string', description: 'Where to save the PNG (relative to project, default user://screenshot.png)' },
              waitFrames: { type: 'number', description: 'Frames to advance before capturing (default 5)' },
              width: { type: 'number', description: 'Viewport width (default from project settings)' },
              height: { type: 'number', description: 'Viewport height (default from project settings)' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        // ===== Performance: single-boot multi-op =====
        {
          name: 'batch',
          description:
            'Run many operations in ONE headless Godot process instead of one process per call (~15-30x faster for multi-step edits). ' +
            'operations is an array of {operation, params}. Batchable operations are the structured editing/inspection tools: ' +
            'set_node_property, set_node_properties, delete_node, rename_node, reparent_node, duplicate_node, reorder_node, add_to_group, remove_from_group, ' +
            'attach_script, connect_signal, disconnect_signal, instance_scene, create_resource, edit_resource, build_scene, find_nodes, create_animation, ' +
            'get_scene_tree, get_node_properties, validate_scene, and the project-setting/autoload/input ops. ' +
            'Each op params object uses the same fields as the standalone tool (camelCase or snake_case accepted). ' +
            'Returns per-operation ok/result. Stops at the first failure unless stopOnError is false.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              operations: {
                type: 'array',
                description: 'Ordered list of {operation, params} objects',
                items: { type: 'object' },
              },
              stopOnError: { type: 'boolean', description: 'Stop at the first failing operation (default true)' },
            },
            required: ['projectPath', 'operations'],
          },
        },
        {
          name: 'build_scene',
          description:
            'Construct an entire scene tree in a SINGLE process from a nested spec, then save once. ' +
            'root is a node spec: {type | instance, name, script, properties{}, groups[], children[]}. ' +
            '"type" is a Godot class (e.g. Node2D); "instance" is a res:// scene to instance instead. ' +
            'children is an array of the same node-spec shape. Optional signals[] = [{from, signal, to, method}] (node paths relative to root) ' +
            'are connected after the tree is built. Far faster than create_scene + repeated add_node calls.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path where the scene (.tscn) will be saved (relative to project)' },
              root: { type: 'object', description: 'Root node spec (see description)' },
              signals: { type: 'array', description: 'Optional signal connections to wire up', items: { type: 'object' } },
            },
            required: ['projectPath', 'scenePath', 'root'],
          },
        },
        // ===== Capability breadth =====
        {
          name: 'find_nodes',
          description: 'Search a scene for nodes by type (class, inheritance-aware), group, and/or a wildcard name pattern (e.g. "Enemy*"). Returns matching node paths.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              type: { type: 'string', description: 'Match nodes of this class or a subclass (e.g. Node2D)' },
              group: { type: 'string', description: 'Match nodes in this group' },
              namePattern: { type: 'string', description: 'Wildcard name pattern (case-insensitive, e.g. "Coin*")' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'list_classes',
          description: 'List Godot engine classes from ClassDB, optionally filtered by a name substring and/or restricted to descendants of a base class.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              filter: { type: 'string', description: 'Optional case-insensitive substring to match in class names' },
              inherits: { type: 'string', description: 'Optional base class; only its descendants are returned' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'path_to_uid',
          description: 'Resolve a project file to its resource UID (uid://...). The reverse of get_uid. Requires Godot 4.4+.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              filePath: { type: 'string', description: 'Path to the file (relative to project)' },
            },
            required: ['projectPath', 'filePath'],
          },
        },
        {
          name: 'find_broken_references',
          description: 'Scan scenes and resources under a directory and report references to files that no longer exist (dangling ext_resource / stale UID paths). A project-wide safety net.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              directory: { type: 'string', description: 'Subdirectory to scan (relative to project, default whole project)' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'create_animation',
          description:
            'Create a value-track Animation on an AnimationPlayer node and store it in one of its libraries. ' +
            'tracks = [{path: "NodePath:property", keys: [{time, value}]}]. Key values may be numbers, strings, or arrays ([x,y]->Vector2, [x,y,z]->Vector3, [r,g,b,a]->Color).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              playerNode: { type: 'string', description: 'Path to the AnimationPlayer node within the scene' },
              name: { type: 'string', description: 'Animation name (default new_animation)' },
              length: { type: 'number', description: 'Animation length in seconds (default 1.0)' },
              loop: { type: 'boolean', description: 'Loop the animation (default false)' },
              library: { type: 'string', description: 'Animation library name (default "")' },
              tracks: { type: 'array', description: 'Track specs (see description)', items: { type: 'object' } },
            },
            required: ['projectPath', 'scenePath', 'playerNode', 'name', 'tracks'],
          },
        },
        {
          name: 'set_node_properties',
          description: 'Set several properties on a single node in one load/save. Values are type-coerced like set_node_property.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node within the scene' },
              properties: { type: 'object', description: 'Map of property name -> value' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'properties'],
          },
        },
        {
          name: 'reorder_node',
          description: 'Move a node to a different index among its siblings (controls draw order / child order).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node to move' },
              toIndex: { type: 'number', description: 'Target sibling index (0-based)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'toIndex'],
          },
        },
        {
          name: 'export_project',
          description:
            'Export the project using a configured export preset (completes the build pipeline). Runs Godot --export-release (or --export-debug). ' +
            'The preset must already exist in export_presets.cfg. Returns the exit code and output tail.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              presetName: { type: 'string', description: 'Name of the export preset (as defined in export_presets.cfg)' },
              exportPath: { type: 'string', description: 'Output file path (relative to project, e.g. build/game.exe)' },
              debugExport: { type: 'boolean', description: 'Use --export-debug instead of --export-release (default false)' },
            },
            required: ['projectPath', 'presetName', 'exportPath'],
          },
        },
        // ----- Inspection / analysis (read-only) -----
        {
          name: 'get_filesystem_tree',
          description: 'Return the project file/folder hierarchy as a nested tree (directories, files, extensions, sizes). Skips hidden and .import folders.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              subPath: { type: 'string', description: 'Optional project-relative sub-folder to start from (default: project root)' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'search_files',
          description: 'Find project files by name substring or simple glob (use * and ?), optionally filtered by extension. Returns matching project-relative paths.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              pattern: { type: 'string', description: 'Name substring, or glob with * / ? (matched against the relative path)' },
              extension: { type: 'string', description: 'Optional extension filter without the dot (e.g. "gd", "tscn")' },
              maxResults: { type: 'number', description: 'Maximum results to return (default 500)' },
            },
            required: ['projectPath', 'pattern'],
          },
        },
        {
          name: 'search_in_files',
          description: 'Search file contents (grep) across the project for a text query. Returns file/line/text matches. Defaults to text-ish extensions.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              query: { type: 'string', description: 'Text to search for' },
              extensions: { type: 'array', items: { type: 'string' }, description: 'Extensions to search (default: gd, tscn, tres, cfg, godot, json, md, txt, cs, gdshader)' },
              caseSensitive: { type: 'boolean', description: 'Case-sensitive match (default false)' },
              maxResults: { type: 'number', description: 'Maximum matches to return (default 200)' },
            },
            required: ['projectPath', 'query'],
          },
        },
        {
          name: 'get_project_statistics',
          description: 'Summarize the project: counts of scenes, scripts and resources, total script lines, total node instances across scenes, autoloads, and a file-count-by-extension breakdown.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'get_scene_file_content',
          description: 'Return the raw text content of a scene (.tscn) or resource (.tres) file.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Project-relative path to the .tscn/.tres file' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'find_script_references',
          description: 'Find every place a given script is referenced across scenes, resources, scripts and project.godot. Returns file/line/text matches.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scriptPath: { type: 'string', description: 'Project-relative path to the script (e.g. player.gd or res://player.gd)' },
            },
            required: ['projectPath', 'scriptPath'],
          },
        },
        {
          name: 'find_node_references',
          description: 'Find references to a node by name in scripts: get_node("Name"), $Name, %Name and NodePath usages. Returns file/line/text matches.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              nodeName: { type: 'string', description: 'The node name to search for' },
            },
            required: ['projectPath', 'nodeName'],
          },
        },
        {
          name: 'find_unused_resources',
          description: 'Heuristically list resource/asset files (textures, audio, .tres, fonts, meshes, shaders) that are not referenced by any scene, resource, script or project.godot. May report false positives for dynamically-loaded paths.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'detect_circular_dependencies',
          description: 'Detect circular scene dependencies (scene A instances scene B which instances A ...) by scanning ext_resource references in .tscn files. Returns any cycles found.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'find_signal_connections',
          description: 'List the signal connections declared in a scene file (from node, signal, to node, method, flags) by parsing its [connection] entries.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Project-relative path to the .tscn file' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'list_export_presets',
          description: 'List the export presets defined in export_presets.cfg (name, platform, runnable, export path).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'get_export_info',
          description: 'Return the full configuration of a single export preset from export_presets.cfg by name.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              presetName: { type: 'string', description: 'The export preset name' },
            },
            required: ['projectPath', 'presetName'],
          },
        },
        {
          name: 'read_resource',
          description: 'Read a resource file. For text resources (.tres/.tscn/.gd/.gdshader/.cfg) returns the file text; for binary resources reports the type and size.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              resourcePath: { type: 'string', description: 'Project-relative path to the resource file' },
            },
            required: ['projectPath', 'resourcePath'],
          },
        },
        // ----- Inspection / analysis (engine-backed) -----
        {
          name: 'analyze_scene_complexity',
          description: 'Analyze a scene: total node count, maximum tree depth, node count by class, and number of attached scripts.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Project-relative path to the .tscn file' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'analyze_signal_flow',
          description: 'List every signal connection in a scene with the emitting node, signal name, target node and target method (resolved from the live scene tree).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Project-relative path to the .tscn file' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'get_project_settings',
          description: 'Return all project settings (from ProjectSettings), optionally filtered to keys containing a substring.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              filter: { type: 'string', description: 'Optional case-insensitive substring filter on the setting key (e.g. "physics", "display")' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'get_scene_exports',
          description: 'List the exported (@export) variables of a scene root\'s script, with their types and current values.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Project-relative path to the .tscn file' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'get_node_groups',
          description: 'Return the groups a specific node belongs to within a scene.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Project-relative path to the .tscn file' },
              nodePath: { type: 'string', description: 'Path to the node within the scene' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'find_nodes_by_type',
          description: 'Find all nodes of a given class (including subclasses, via is_class) within a scene.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Project-relative path to the .tscn file' },
              type: { type: 'string', description: 'Class name to match (e.g. Area2D, Sprite2D, Button)' },
            },
            required: ['projectPath', 'scenePath', 'type'],
          },
        },
        {
          name: 'find_nodes_in_group',
          description: 'Find all nodes that belong to a given group within a scene.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Project-relative path to the .tscn file' },
              group: { type: 'string', description: 'The group name' },
            },
            required: ['projectPath', 'scenePath', 'group'],
          },
        },
        {
          name: 'get_input_actions',
          description: 'List the project\'s input actions and their bound events (from the InputMap). Built-in ui_* actions are excluded unless includeBuiltin is true.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              includeBuiltin: { type: 'boolean', description: 'Include built-in ui_* actions (default false)' },
            },
            required: ['projectPath'],
          },
        },
        // ===== TileMap (TileMapLayer / legacy TileMap) =====
        {
          name: 'tilemap_set_cell',
          description: 'Set a single cell on a TileMapLayer (or legacy TileMap) node. sourceId -1 erases the cell. Coordinates are integer cell coordinates; atlasCoords is the tile within the source atlas.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the TileMapLayer/TileMap node within the scene' },
              x: { type: 'number', description: 'Cell X coordinate' },
              y: { type: 'number', description: 'Cell Y coordinate' },
              sourceId: { type: 'number', description: 'TileSet source id (default -1, which erases the cell)' },
              atlasCoords: { type: 'array', items: { type: 'number' }, description: 'Atlas coordinates [ax, ay] within the source (default [0,0])' },
              alternative: { type: 'number', description: 'Alternative tile id (default 0)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'x', 'y'],
          },
        },
        {
          name: 'tilemap_fill_rect',
          description: 'Fill a w x h rectangle of cells on a TileMapLayer (or legacy TileMap) node starting at (x,y) with the given tile. sourceId -1 erases the rectangle.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the TileMapLayer/TileMap node within the scene' },
              x: { type: 'number', description: 'Top-left cell X coordinate' },
              y: { type: 'number', description: 'Top-left cell Y coordinate' },
              w: { type: 'number', description: 'Width in cells' },
              h: { type: 'number', description: 'Height in cells' },
              sourceId: { type: 'number', description: 'TileSet source id (default -1, which erases the cells)' },
              atlasCoords: { type: 'array', items: { type: 'number' }, description: 'Atlas coordinates [ax, ay] within the source (default [0,0])' },
              alternative: { type: 'number', description: 'Alternative tile id (default 0)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'x', 'y', 'w', 'h'],
          },
        },
        {
          name: 'tilemap_get_cell',
          description: 'Read a single cell from a TileMapLayer (or legacy TileMap) node. Returns its source_id, atlas_coords, alternative, and whether it is empty.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the TileMapLayer/TileMap node within the scene' },
              x: { type: 'number', description: 'Cell X coordinate' },
              y: { type: 'number', description: 'Cell Y coordinate' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'x', 'y'],
          },
        },
        {
          name: 'tilemap_clear',
          description: 'Clear all cells on a TileMapLayer (or legacy TileMap) node and save the scene.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the TileMapLayer/TileMap node within the scene' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'tilemap_get_info',
          description: 'Read-only summary of a TileMapLayer (or legacy TileMap) node: the TileSet tile size, the number of used cells, and the list of TileSet source ids.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the TileMapLayer/TileMap node within the scene' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'tilemap_get_used_cells',
          description: 'Read-only list of all used (non-empty) cells on a TileMapLayer (or legacy TileMap) node, each with its coordinates, source_id, atlas_coords, and alternative.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the TileMapLayer/TileMap node within the scene' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        // ===== Animation (AnimationPlayer) =====
        {
          name: 'list_animations',
          description: 'List the animations stored on an AnimationPlayer node (names and count). Read-only.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationPlayer node within the scene' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'add_animation_track',
          description: 'Add a track to an existing animation on an AnimationPlayer and save. trackPath is a NodePath such as "Sprite2D:position". Returns the new track index.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationPlayer node within the scene' },
              animation: { type: 'string', description: 'Name of the existing animation to modify' },
              trackPath: { type: 'string', description: 'NodePath of the track target, e.g. "Sprite2D:position"' },
              trackType: { type: 'string', description: 'Track type: value (default), position_3d, rotation_3d, scale_3d, method, bezier, audio, animation' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'animation', 'trackPath'],
          },
        },
        {
          name: 'set_animation_keyframe',
          description: 'Insert a keyframe on a track of an animation and save. Identify the track by trackIndex or trackPath. easing is the optional key transition. Returns the inserted key index.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationPlayer node within the scene' },
              animation: { type: 'string', description: 'Name of the existing animation to modify' },
              trackIndex: { type: 'number', description: 'Index of the track to key (alternative to trackPath)' },
              trackPath: { type: 'string', description: 'NodePath of the track to key (alternative to trackIndex)' },
              time: { type: 'number', description: 'Time in seconds at which to insert the key' },
              value: { description: 'Value for the keyframe (coerced to the track target type for value tracks)' },
              easing: { type: 'number', description: 'Optional key transition / easing factor (default 1.0)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'animation', 'time'],
          },
        },
        {
          name: 'get_animation_info',
          description: 'Read-only details of an animation on an AnimationPlayer: length, loop_mode, step, track_count and per-track {index, path, type, key_count}.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationPlayer node within the scene' },
              animation: { type: 'string', description: 'Name of the animation to inspect' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'animation'],
          },
        },
        {
          name: 'remove_animation',
          description: 'Remove a named animation from its AnimationPlayer library and save. Returns removed:true.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationPlayer node within the scene' },
              animation: { type: 'string', description: 'Name of the animation to remove' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'animation'],
          },
        },
        // ===== AnimationTree =====
        {
          name: 'create_animation_tree',
          description: 'Create an AnimationTree node under a parent, set its tree_root (state_machine or blend_tree) and anim_player NodePath, then save. Returns the created node path.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Name for the new AnimationTree node' },
              parentPath: { type: 'string', description: 'Path of the parent node to add under (default scene root)' },
              animPlayer: { type: 'string', description: 'NodePath (relative to the AnimationTree) of an AnimationPlayer' },
              rootType: { type: 'string', description: 'Tree root type: state_machine (default) or blend_tree' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'get_animation_tree_structure',
          description: 'Read-only structure of an AnimationTree node: root_type, and for a state machine its state names and transitions, or for a blend tree its sub-node names.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationTree node within the scene' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'add_state_machine_state',
          description: 'Add a state node to the state machine root of an AnimationTree and save. stateType selects the sub-node kind; animation states can reference an animation name.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationTree node within the scene' },
              stateName: { type: 'string', description: 'Name of the new state' },
              stateType: { type: 'string', description: 'State type: animation (default), blend_tree, blend_space_1d, blend_space_2d, state_machine' },
              animation: { type: 'string', description: 'Animation name for an animation state' },
              position: { type: 'array', items: { type: 'number' }, description: 'Editor position [x, y] (default [0, 0])' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'stateName'],
          },
        },
        {
          name: 'remove_state_machine_state',
          description: 'Remove a state node from the state machine root of an AnimationTree and save.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationTree node within the scene' },
              stateName: { type: 'string', description: 'Name of the state to remove' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'stateName'],
          },
        },
        {
          name: 'add_state_machine_transition',
          description: 'Add a transition between two states of a state machine AnimationTree root and save. switchMode (immediate|sync|at_end) and advanceMode (disabled|enabled|auto) configure the transition.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationTree node within the scene' },
              from: { type: 'string', description: 'Source state name' },
              to: { type: 'string', description: 'Destination state name' },
              switchMode: { type: 'string', description: 'Switch mode: immediate (default), sync, at_end' },
              advanceMode: { type: 'string', description: 'Advance mode: disabled, enabled (default), auto' },
              advanceExpression: { type: 'string', description: 'Optional advance expression string' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'from', 'to'],
          },
        },
        {
          name: 'remove_state_machine_transition',
          description: 'Remove the transition between two states of a state machine AnimationTree root and save.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationTree node within the scene' },
              from: { type: 'string', description: 'Source state name' },
              to: { type: 'string', description: 'Destination state name' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'from', 'to'],
          },
        },
        {
          name: 'set_blend_tree_node',
          description: 'Add or replace a sub-node on a blend tree AnimationTree root and save. btNodeType selects the blend node kind (e.g. animation, blend2, blend3, add2, oneshot, timescale, output).',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationTree node within the scene' },
              btNodeName: { type: 'string', description: 'Name of the blend tree sub-node' },
              btNodeType: { type: 'string', description: 'Sub-node type: animation, blend2, blend3, add2, add3, oneshot, timescale, timeseek, transition, output' },
              position: { type: 'array', items: { type: 'number' }, description: 'Editor position [x, y] (default [0, 0])' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'btNodeName', 'btNodeType'],
          },
        },
        {
          name: 'set_tree_parameter',
          description: 'Set a runtime parameter on an AnimationTree (e.g. "conditions/jump" or "Blend2/blend_amount") via parameters/<parameter> and save. Returns the value that was set.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the AnimationTree node within the scene' },
              parameter: { type: 'string', description: 'Parameter path under parameters/, e.g. "conditions/jump"' },
              value: { description: 'Value to assign to the parameter' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'parameter', 'value'],
          },
        },
        // ===== Audio (AudioServer buses + AudioStreamPlayer nodes) =====
        {
          name: 'add_audio_bus',
          description: 'Add a new audio bus to the project audio bus layout, set its name and send target, and persist the layout. Returns the new bus index and name.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              name: { type: 'string', description: 'Name for the new bus' },
              sendBus: { type: 'string', description: 'Name of the bus this bus sends to (default "Master")' },
            },
            required: ['projectPath', 'name'],
          },
        },
        {
          name: 'set_audio_bus',
          description: 'Set properties on an existing audio bus (identified by busName or busIndex) and persist the layout. Any of volumeDb, solo, mute, bypassEffects, send may be provided. Returns the bus resulting state.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              busName: { type: 'string', description: 'Name of the bus to modify (alternative to busIndex)' },
              busIndex: { type: 'number', description: 'Index of the bus to modify (alternative to busName)' },
              volumeDb: { type: 'number', description: 'Bus volume in decibels' },
              solo: { type: 'boolean', description: 'Whether the bus is soloed' },
              mute: { type: 'boolean', description: 'Whether the bus is muted' },
              bypassEffects: { type: 'boolean', description: 'Whether the bus bypasses its effects' },
              send: { type: 'string', description: 'Name of the bus this bus sends to' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'add_audio_bus_effect',
          description: 'Add an audio effect to a bus (identified by busName or busIndex) and persist the layout. effectType is one of: reverb, chorus, delay, compressor, limiter, distortion, eq, lowpass, highpass, bandpass, amplify, phaser. Returns the effect index and type.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              busName: { type: 'string', description: 'Name of the bus to add the effect to (alternative to busIndex)' },
              busIndex: { type: 'number', description: 'Index of the bus to add the effect to (alternative to busName)' },
              effectType: { type: 'string', description: 'Effect type: reverb, chorus, delay, compressor, limiter, distortion, eq, lowpass, highpass, bandpass, amplify, phaser' },
              volumeDb: { type: 'number', description: 'Optional amplify volume in dB (amplify effect)' },
              cutoffHz: { type: 'number', description: 'Optional filter cutoff frequency in Hz (filter effects)' },
              wet: { type: 'number', description: 'Optional wet mix (reverb/chorus/delay)' },
              dry: { type: 'number', description: 'Optional dry mix (reverb/chorus)' },
            },
            required: ['projectPath', 'effectType'],
          },
        },
        {
          name: 'get_audio_bus_layout',
          description: 'Read-only listing of every audio bus in the project audio bus layout: index, name, volume_db, solo, mute, bypass_effects, send, and the list of effects (type per effect). Does not modify the layout.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'add_audio_player',
          description: 'Add an AudioStreamPlayer (or AudioStreamPlayer2D if is2d, AudioStreamPlayer3D if is3d) under parentPath in a scene, configure stream/bus/volume/autoplay, and save the scene. Returns the created node path.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              parentPath: { type: 'string', description: 'Path to the parent node (default: scene root)' },
              name: { type: 'string', description: 'Name for the new audio player node' },
              stream: { type: 'string', description: 'Optional res:// path to an audio stream resource to assign' },
              bus: { type: 'string', description: 'Target audio bus name (default "Master")' },
              volumeDb: { type: 'number', description: 'Volume in decibels' },
              autoplay: { type: 'boolean', description: 'Whether the player auto-plays on ready' },
              is3d: { type: 'boolean', description: 'Create an AudioStreamPlayer3D' },
              is2d: { type: 'boolean', description: 'Create an AudioStreamPlayer2D' },
            },
            required: ['projectPath', 'scenePath', 'name'],
          },
        },
        {
          name: 'get_audio_info',
          description: 'Read-only listing of every AudioStreamPlayer/2D/3D node in a scene, each with path, type, stream resource path, bus, volume_db, autoplay, and playing. Does not modify the scene.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        // ===== Shaders =====
        {
          name: 'create_shader',
          description: 'Create a new .gdshader file in the project. If content is omitted, a minimal valid template for the given shaderType is written. Refuses to overwrite an existing file.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              path: { type: 'string', description: 'Project-relative path for the new .gdshader file' },
              shaderType: { type: 'string', description: 'Shader type: canvas_item (default), spatial, particles, sky, or fog' },
              content: { type: 'string', description: 'Optional full shader source; if omitted a minimal template is generated' },
            },
            required: ['projectPath', 'path'],
          },
        },
        {
          name: 'read_shader',
          description: 'Return the text of a .gdshader file in the project. Read-only.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              path: { type: 'string', description: 'Project-relative path to the .gdshader file' },
            },
            required: ['projectPath', 'path'],
          },
        },
        {
          name: 'edit_shader',
          description: 'Overwrite an existing .gdshader file with new content. The file must already exist.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              path: { type: 'string', description: 'Project-relative path to the .gdshader file' },
              content: { type: 'string', description: 'New full shader source to write' },
            },
            required: ['projectPath', 'path', 'content'],
          },
        },
        {
          name: 'assign_shader_material',
          description: 'Create a ShaderMaterial wrapping the shader at shaderPath and assign it to the node (CanvasItem.material for 2D/Control, GeometryInstance3D.material_override for 3D). Saves the scene.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node within the scene' },
              shaderPath: { type: 'string', description: 'Project-relative path to the .gdshader to load' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'shaderPath'],
          },
        },
        {
          name: 'set_shader_param',
          description: 'Set a shader uniform parameter on the ShaderMaterial assigned to a node, then save the scene. Fails if the node has no ShaderMaterial.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node within the scene' },
              param: { type: 'string', description: 'Name of the shader uniform parameter to set' },
              value: { description: 'Value to assign (coerced to the appropriate Godot type)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'param', 'value'],
          },
        },
        {
          name: 'get_shader_params',
          description: 'List the uniforms (name, type, hint) of a shader. Provide shaderPath to read a shader directly, or scenePath+nodePath to read the shader on a node\'s ShaderMaterial. Read-only.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file (when reading a node\'s material)' },
              nodePath: { type: 'string', description: 'Path to the node within the scene (when reading a node\'s material)' },
              shaderPath: { type: 'string', description: 'Project-relative path to a .gdshader to inspect directly' },
            },
            required: ['projectPath'],
          },
        },
        // ===== Themes =====
        {
          name: 'create_theme',
          description: 'Create a new empty Theme resource (.tres) at the given project-relative path. Refuses to overwrite an existing file.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              path: { type: 'string', description: 'Project-relative path for the new .tres theme file' },
            },
            required: ['projectPath', 'path'],
          },
        },
        {
          name: 'set_theme_color',
          description: 'Set a named color on a Theme for a given theme type (e.g. Button, Label) and save the resource.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              themePath: { type: 'string', description: 'Project-relative path to the .tres theme file' },
              name: { type: 'string', description: 'Color item name (e.g. font_color)' },
              themeType: { type: 'string', description: 'Theme type the item belongs to (e.g. Button, Label)' },
              color: { description: 'Color as a hex string (e.g. "#ff8800") or [r,g,b,a] array' },
            },
            required: ['projectPath', 'themePath', 'name', 'themeType', 'color'],
          },
        },
        {
          name: 'set_theme_constant',
          description: 'Set a named integer constant on a Theme for a given theme type and save the resource.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              themePath: { type: 'string', description: 'Project-relative path to the .tres theme file' },
              name: { type: 'string', description: 'Constant item name (e.g. h_separation)' },
              themeType: { type: 'string', description: 'Theme type the item belongs to (e.g. HBoxContainer)' },
              value: { type: 'number', description: 'Integer value' },
            },
            required: ['projectPath', 'themePath', 'name', 'themeType', 'value'],
          },
        },
        {
          name: 'set_theme_font_size',
          description: 'Set a named font size on a Theme for a given theme type and save the resource.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              themePath: { type: 'string', description: 'Project-relative path to the .tres theme file' },
              name: { type: 'string', description: 'Font size item name (e.g. font_size)' },
              themeType: { type: 'string', description: 'Theme type the item belongs to (e.g. Label)' },
              size: { type: 'number', description: 'Font size in pixels (integer)' },
            },
            required: ['projectPath', 'themePath', 'name', 'themeType', 'size'],
          },
        },
        {
          name: 'set_theme_stylebox',
          description: 'Create a StyleBox (flat, empty, texture, or line), apply optional properties (e.g. bg_color, content_margin_*, corner_radius_*), set it on a Theme for a given theme type, and save.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              themePath: { type: 'string', description: 'Project-relative path to the .tres theme file' },
              name: { type: 'string', description: 'StyleBox item name (e.g. normal, hover)' },
              themeType: { type: 'string', description: 'Theme type the item belongs to (e.g. Button)' },
              styleboxType: { type: 'string', description: 'StyleBox kind: flat (default), empty, texture, or line' },
              properties: { type: 'object', description: 'Optional map of StyleBox properties to set (coerced to Godot types)' },
            },
            required: ['projectPath', 'themePath', 'name', 'themeType'],
          },
        },
        {
          name: 'get_theme_info',
          description: 'List every color, constant, font size, and stylebox item defined in a Theme, grouped by theme type. Read-only.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              themePath: { type: 'string', description: 'Project-relative path to the .tres theme file' },
            },
            required: ['projectPath', 'themePath'],
          },
        },
        // ===== Control layout =====
        {
          name: 'setup_control',
          description: 'Configure a Control node: apply an anchor layout preset (e.g. full_rect, center, top_wide) and/or horizontal/vertical size flags, then save the scene. Fails if the node is not a Control.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the Control node within the scene' },
              anchorPreset: { type: 'string', description: 'Layout preset name: top_left, top_right, bottom_left, bottom_right, center_left, center_top, center_right, center_bottom, center, left_wide, top_wide, right_wide, bottom_wide, vcenter_wide, hcenter_wide, full_rect' },
              hSizeFlags: { type: 'number', description: 'Horizontal size flags bitmask (Control.SizeFlags)' },
              vSizeFlags: { type: 'number', description: 'Vertical size flags bitmask (Control.SizeFlags)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        // ===== Particles =====
        {
          name: 'create_particles',
          description: 'Create a GPUParticles2D (or GPUParticles3D if is3d) node under parentPath with a fresh ParticleProcessMaterial. Sets amount, lifetime, oneShot, and the emission shape, then saves the scene. Returns the created node path.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              parentPath: { type: 'string', description: 'Path to the parent node (default: scene root)' },
              name: { type: 'string', description: 'Name for the new particles node' },
              is3d: { type: 'boolean', description: 'Create a GPUParticles3D (default false -> GPUParticles2D)' },
              amount: { type: 'number', description: 'Number of particles (default 8)' },
              lifetime: { type: 'number', description: 'Particle lifetime in seconds (default 1.0)' },
              oneShot: { type: 'boolean', description: 'Emit a single burst instead of looping' },
              emissionShape: { type: 'string', description: 'Emission shape: point (default), sphere, sphere_surface, box, or ring' },
            },
            required: ['projectPath', 'scenePath', 'name'],
          },
        },
        {
          name: 'set_particle_material',
          description: 'Configure a GPUParticles2D/3D node and its ParticleProcessMaterial. Node fields: amount, lifetime, oneShot, emitting. Material fields: explosiveness, randomness, direction, spread, initialVelocityMin/Max, gravity, scaleMin/Max, color, angularVelocityMin/Max, orbitVelocityMin/Max, dampingMin/Max. Creates the process material if missing, then saves. Returns the changed keys.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the GPUParticles2D/3D node' },
              amount: { type: 'number', description: 'Number of particles (node)' },
              lifetime: { type: 'number', description: 'Particle lifetime in seconds (node)' },
              oneShot: { type: 'boolean', description: 'One-shot emission (node)' },
              emitting: { type: 'boolean', description: 'Whether the node is emitting (node)' },
              explosiveness: { type: 'number', description: 'Explosiveness ratio 0..1 (material)' },
              randomness: { type: 'number', description: 'Randomness ratio 0..1 (material)' },
              direction: { type: 'array', description: 'Initial emission direction as [x,y] or [x,y,z] (material)', items: { type: 'number' } },
              spread: { type: 'number', description: 'Spread angle in degrees (material)' },
              initialVelocityMin: { type: 'number', description: 'Minimum initial velocity (material)' },
              initialVelocityMax: { type: 'number', description: 'Maximum initial velocity (material)' },
              gravity: { type: 'array', description: 'Gravity vector as [x,y] or [x,y,z] (material)', items: { type: 'number' } },
              scaleMin: { type: 'number', description: 'Minimum scale (material)' },
              scaleMax: { type: 'number', description: 'Maximum scale (material)' },
              color: { description: 'Particle color as hex string or [r,g,b,a] array (material)' },
              angularVelocityMin: { type: 'number', description: 'Minimum angular velocity (material)' },
              angularVelocityMax: { type: 'number', description: 'Maximum angular velocity (material)' },
              orbitVelocityMin: { type: 'number', description: 'Minimum orbit velocity (material)' },
              orbitVelocityMax: { type: 'number', description: 'Maximum orbit velocity (material)' },
              dampingMin: { type: 'number', description: 'Minimum damping (material)' },
              dampingMax: { type: 'number', description: 'Maximum damping (material)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'set_particle_color_gradient',
          description: 'Build a Gradient + GradientTexture1D from the given stops and assign it to the particle ParticleProcessMaterial color_ramp, then save the scene. Returns the number of stops applied.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the GPUParticles2D/3D node' },
              stops: { type: 'array', description: 'Gradient stops, each { offset: 0..1, color: hex string or [r,g,b,a] }', items: { type: 'object' } },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'stops'],
          },
        },
        {
          name: 'apply_particle_preset',
          description: 'Apply a tasteful bundle of node and ParticleProcessMaterial settings for a named preset, then save the scene. Returns the preset applied.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the GPUParticles2D/3D node' },
              preset: { type: 'string', description: 'Preset name: fire, smoke, sparks, explosion, rain, snow, magic, or dust' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'preset'],
          },
        },
        {
          name: 'get_particle_info',
          description: 'Read-only inspection of a GPUParticles2D/3D node: type, amount, lifetime, one_shot, emitting, and key ParticleProcessMaterial fields. Does not modify the scene.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the GPUParticles2D/3D node' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        // ===== Physics =====
        {
          name: 'setup_physics_body',
          description: 'Configure an existing physics body or area node (CharacterBody2D/3D, RigidBody2D/3D, StaticBody2D/3D, Area2D/3D). Sets whichever provided properties exist on it (collisionLayer, collisionMask, motionMode, mass, gravityScale, linearDamp, angularDamp, freeze, freezeMode, contactMonitor, maxContactsReported), then saves. Fails if the node is not a physics body/area. Returns changed keys.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the physics body/area node' },
              collisionLayer: { type: 'number', description: 'Collision layer bitmask' },
              collisionMask: { type: 'number', description: 'Collision mask bitmask' },
              motionMode: { type: 'string', description: 'CharacterBody motion mode: grounded or floating' },
              mass: { type: 'number', description: 'RigidBody mass' },
              gravityScale: { type: 'number', description: 'RigidBody gravity scale' },
              linearDamp: { type: 'number', description: 'Linear damping' },
              angularDamp: { type: 'number', description: 'Angular damping' },
              freeze: { type: 'boolean', description: 'RigidBody freeze flag' },
              freezeMode: { type: 'string', description: 'RigidBody freeze mode: static or kinematic' },
              contactMonitor: { type: 'boolean', description: 'RigidBody contact monitoring' },
              maxContactsReported: { type: 'number', description: 'Maximum contacts reported' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'setup_collision',
          description: 'Add a CollisionShape2D (or CollisionShape3D if dimension is 3d) child to a body, holding the matching shape resource (rectangle/circle/capsule/segment/polygon for 2d; box/sphere/cylinder/capsule for 3d), set its size/radius/height/points, and oneWayCollision/disabled where applicable. Saves and returns the created shape node path.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the parent body node' },
              shapeType: { type: 'string', description: 'rectangle, circle, capsule, segment, polygon (2d) or box, sphere, cylinder, capsule (3d)' },
              dimension: { type: 'string', description: '2d (default) or 3d' },
              size: { type: 'array', description: 'Size for rectangle/box as [x,y] or [x,y,z]', items: { type: 'number' } },
              radius: { type: 'number', description: 'Radius for circle/sphere/capsule/cylinder' },
              height: { type: 'number', description: 'Height for capsule/cylinder' },
              points: { type: 'array', description: 'Points for polygon/segment as [[x,y], ...]', items: { type: 'array' } },
              oneWayCollision: { type: 'boolean', description: 'One-way collision (2d CollisionShape2D)' },
              disabled: { type: 'boolean', description: 'Disable the collision shape' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'shapeType'],
          },
        },
        {
          name: 'set_physics_layers',
          description: 'Project-level: assign human-readable names to physics collision layers via layer_names/<2d|3d>_physics/layer_<n> in ProjectSettings, then save. Returns the names set.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              dimension: { type: 'string', description: '2d (default) or 3d' },
              names: { type: 'object', description: 'Map of layer number (1..32) to name, e.g. { "1": "world", "2": "player" }' },
            },
            required: ['projectPath', 'names'],
          },
        },
        {
          name: 'get_physics_layers',
          description: 'Read-only project-level listing of named 2D and 3D physics collision layers from ProjectSettings. Returns the non-empty layer names for both dimensions.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
            },
            required: ['projectPath'],
          },
        },
        {
          name: 'add_raycast',
          description: 'Add a RayCast2D (or RayCast3D if dimension is 3d) node under parentPath, set target_position, collision_mask, and enabled, then save the scene. Returns the created node path.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              parentPath: { type: 'string', description: 'Path to the parent node (default: scene root)' },
              name: { type: 'string', description: 'Name for the new raycast node' },
              dimension: { type: 'string', description: '2d (default) or 3d' },
              targetPosition: { type: 'array', description: 'Target position as [x,y] (default [0,50]) or [x,y,z]', items: { type: 'number' } },
              collisionMask: { type: 'number', description: 'Collision mask bitmask' },
              enabled: { type: 'boolean', description: 'Whether the raycast is enabled (default true)' },
            },
            required: ['projectPath', 'scenePath', 'name'],
          },
        },
        {
          name: 'get_collision_info',
          description: 'Read-only scene op returning a node\'s collision_layer and collision_mask (if present) plus the decoded active layer numbers. Does not modify the scene.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node to inspect' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        // ===== Navigation =====
        {
          name: 'setup_navigation_region',
          description: 'Add a NavigationRegion2D (with a fresh NavigationPolygon) or NavigationRegion3D (with a fresh NavigationMesh) under parentPath in a scene, optionally set navigationLayers, and save. Returns the created node path.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              parentPath: { type: 'string', description: 'Path to the parent node (default: scene root)' },
              name: { type: 'string', description: 'Name for the new navigation region node' },
              dimension: { type: 'string', description: '2d (default) or 3d' },
              navigationLayers: { type: 'number', description: 'Optional navigation_layers bitmask' },
            },
            required: ['projectPath', 'scenePath', 'name'],
          },
        },
        {
          name: 'bake_navigation_mesh',
          description: 'Best-effort bake of a NavigationRegion2D/3D node. For a NavigationRegion2D with outlineVertices, builds a NavigationPolygon outline and bakes it. Headless 3D baking needs source geometry and reports baked:false gracefully. Saves the scene if the polygon was modified.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the NavigationRegion2D/3D node within the scene' },
              outlineVertices: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Optional outline polygon vertices as [[x,y], ...] for a 2D region' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'setup_navigation_agent',
          description: 'Add a NavigationAgent2D or NavigationAgent3D under parentPath in a scene, set the provided agent properties, and save. Returns the created node path.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              parentPath: { type: 'string', description: 'Path to the parent node (default: scene root)' },
              name: { type: 'string', description: 'Name for the new navigation agent node' },
              dimension: { type: 'string', description: '2d (default) or 3d' },
              radius: { type: 'number', description: 'Agent radius' },
              maxSpeed: { type: 'number', description: 'Maximum movement speed' },
              pathDesiredDistance: { type: 'number', description: 'Distance to a path point considered reached' },
              targetDesiredDistance: { type: 'number', description: 'Distance to the target considered reached' },
              avoidanceEnabled: { type: 'boolean', description: 'Enable avoidance' },
              navigationLayers: { type: 'number', description: 'Optional navigation_layers bitmask' },
            },
            required: ['projectPath', 'scenePath', 'name'],
          },
        },
        {
          name: 'set_navigation_layers',
          description: 'Set the navigation_layers bitmask on a NavigationRegion or NavigationAgent node, then save the scene. Fails if the node has no navigation_layers property.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the navigation node within the scene' },
              navigationLayers: { type: 'number', description: 'navigation_layers bitmask' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'navigationLayers'],
          },
        },
        {
          name: 'get_navigation_info',
          description: 'Read-only scene op that recursively counts NavigationRegion2D/3D and NavigationAgent2D/3D nodes (returning their paths) and lists the project\'s non-empty 2D/3D navigation layer names. Does not modify the scene.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        // ===== 3D =====
        {
          name: 'add_mesh_instance',
          description: 'Add a MeshInstance3D with a primitive mesh (box, sphere, cylinder, capsule, plane, prism, or torus) under parentPath in a scene, set size/radius/height where supported, and save. Returns the created node path and mesh type.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              parentPath: { type: 'string', description: 'Path to the parent node (default: scene root)' },
              name: { type: 'string', description: 'Name for the new MeshInstance3D node' },
              meshType: { type: 'string', description: 'box (default), sphere, cylinder, capsule, plane, prism, or torus' },
              size: { type: 'array', items: { type: 'number' }, description: 'Optional size as [x,y] or [x,y,z] for meshes that support it' },
              radius: { type: 'number', description: 'Radius for sphere/cylinder/capsule/torus' },
              height: { type: 'number', description: 'Height for cylinder/capsule' },
            },
            required: ['projectPath', 'scenePath', 'name'],
          },
        },
        {
          name: 'setup_lighting',
          description: 'Add a DirectionalLight3D, OmniLight3D, or SpotLight3D under parentPath in a scene. An optional preset (sun, indoor, dramatic) applies tasteful energy/color/rotation; otherwise the provided energy/color are used. Saves the scene.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              parentPath: { type: 'string', description: 'Path to the parent node (default: scene root)' },
              name: { type: 'string', description: 'Optional name for the new light node' },
              lightType: { type: 'string', description: 'directional (default), omni, or spot' },
              preset: { type: 'string', description: 'Optional preset: sun, indoor, or dramatic' },
              energy: { type: 'number', description: 'Light energy' },
              color: { description: 'Light color as a hex string or [r,g,b(,a)] array' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'set_material_3d',
          description: 'Create and assign a StandardMaterial3D surface override on a MeshInstance3D, setting albedo color, metallic, and roughness, then save the scene. Fails if the node is not a MeshInstance3D.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the MeshInstance3D node within the scene' },
              surfaceIndex: { type: 'number', description: 'Surface index (default 0)' },
              albedoColor: { description: 'Albedo color as a hex string or [r,g,b(,a)] array' },
              metallic: { type: 'number', description: 'Metallic value 0..1' },
              roughness: { type: 'number', description: 'Roughness value 0..1' },
            },
            required: ['projectPath', 'scenePath', 'nodePath'],
          },
        },
        {
          name: 'setup_environment',
          description: 'Add a WorldEnvironment node with a new Environment under parentPath in a scene, set its background mode (sky, color, or clear_color), optional clearColor, and enable features (ssao, glow, fog), then save. Returns the created node path.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              parentPath: { type: 'string', description: 'Path to the parent node (default: scene root)' },
              name: { type: 'string', description: 'Name for the new WorldEnvironment node (default "WorldEnvironment")' },
              backgroundMode: { type: 'string', description: 'sky (default), color, or clear_color' },
              features: { type: 'array', items: { type: 'string' }, description: 'Optional features to enable, e.g. ssao, glow, fog' },
              clearColor: { description: 'Optional background color as a hex string or [r,g,b(,a)] array' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'setup_camera_3d',
          description: 'Add a Camera3D under parentPath in a scene, set projection (perspective or orthogonal), fov, position, and current, then save. Returns the created node path.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              parentPath: { type: 'string', description: 'Path to the parent node (default: scene root)' },
              name: { type: 'string', description: 'Name for the new Camera3D node (default "Camera3D")' },
              projection: { type: 'string', description: 'perspective (default) or orthogonal' },
              fov: { type: 'number', description: 'Field of view (perspective) in degrees' },
              position: { type: 'array', items: { type: 'number' }, description: 'Optional position as [x,y,z]' },
              current: { type: 'boolean', description: 'Make this the current camera' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'add_gridmap',
          description: 'Add a GridMap node under parentPath in a scene, optionally assign a MeshLibrary resource and set cell_size, then save. Returns the created node path and whether a MeshLibrary was assigned.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              parentPath: { type: 'string', description: 'Path to the parent node (default: scene root)' },
              name: { type: 'string', description: 'Name for the new GridMap node' },
              meshLibrary: { type: 'string', description: 'Optional res:// path to a MeshLibrary resource' },
              cellSize: { type: 'array', items: { type: 'number' }, description: 'Optional cell size as [x,y,z]' },
            },
            required: ['projectPath', 'scenePath', 'name'],
          },
        },
        {
          name: 'update_property',
          description: 'Convenience alias of set_node_property: set a single property on a node in a scene and save. Returns the coerced value that was written.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node (relative to the scene root)' },
              property: { type: 'string', description: 'Name of the property to set' },
              value: { description: 'New value for the property (coerced to the property type)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'property', 'value'],
          },
        },
        {
          name: 'validate_script',
          description: 'Alias of check_script: parse-check a GDScript file headlessly and report whether it is valid along with any compiler output.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scriptPath: { type: 'string', description: 'Project-relative path to the .gd script to validate' },
            },
            required: ['projectPath', 'scriptPath'],
          },
        },
        {
          name: 'add_scene_instance',
          description: 'Alias of instance_scene: instance one scene as a child node under parentPath inside another scene, optionally with a custom name, then save.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file being edited' },
              parentPath: { type: 'string', description: 'Path to the parent node the instance is added under (default: scene root)' },
              instanceScenePath: { type: 'string', description: 'Path to the scene to instance' },
              name: { type: 'string', description: 'Optional name for the instanced node' },
            },
            required: ['projectPath', 'scenePath', 'instanceScenePath'],
          },
        },
        {
          name: 'move_node',
          description: 'Reparent a node to a new parent within the scene, preserving its global transform when keepGlobalTransform is true (for Node2D/Node3D/Control). Saves and returns the new node path.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node to move' },
              newParent: { type: 'string', description: 'Path to the new parent node' },
              keepGlobalTransform: { type: 'boolean', description: 'Preserve the global transform across the move (default: true)' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'newParent'],
          },
        },
        {
          name: 'add_resource',
          description: 'Instantiate a named Resource subclass (e.g. RectangleShape2D, CircleShape2D, GradientTexture1D), apply optional properties, and assign it to a node property, then save. Fails if the class is not a Resource or the property does not exist.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node receiving the resource' },
              property: { type: 'string', description: 'Name of the node property to assign the resource to' },
              resourceType: { type: 'string', description: 'Resource subclass name to instantiate (e.g. RectangleShape2D)' },
              properties: { type: 'object', description: 'Optional properties to apply to the new resource' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'property', 'resourceType'],
          },
        },
        {
          name: 'set_anchor_preset',
          description: 'Apply a layout preset to a Control node\'s anchors only (not offsets), then save. preset is one of top_left ... full_rect. Fails if the node is not a Control.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the Control node' },
              preset: { type: 'string', description: 'Layout preset name: top_left, top_right, bottom_left, bottom_right, center_left, center_top, center_right, center_bottom, center, left_wide, top_wide, right_wide, bottom_wide, vcenter_wide, hcenter_wide, full_rect' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'preset'],
          },
        },
        {
          name: 'set_node_groups',
          description: 'Replace a node\'s group membership with the provided list (persistent so the groups serialize into the scene), then save. Returns the resulting groups.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodePath: { type: 'string', description: 'Path to the node' },
              groups: { type: 'array', items: { type: 'string' }, description: 'The full set of groups the node should belong to' },
            },
            required: ['projectPath', 'scenePath', 'nodePath', 'groups'],
          },
        },
        {
          name: 'batch_add_nodes',
          description: 'Add multiple nodes to a scene in a single load/save pass. Each spec has parent (default root), type, name, and optional properties. Returns per-node results and counts.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              nodes: {
                type: 'array',
                description: 'Node specs to create',
                items: {
                  type: 'object',
                  properties: {
                    parent: { type: 'string', description: 'Parent node path (default: scene root)' },
                    type: { type: 'string', description: 'Class or registered script name to instantiate' },
                    name: { type: 'string', description: 'Name for the new node' },
                    properties: { type: 'object', description: 'Optional properties to apply' },
                  },
                  required: ['type'],
                },
              },
            },
            required: ['projectPath', 'scenePath', 'nodes'],
          },
        },
        {
          name: 'batch_set_property',
          description: 'Set one property on many nodes in a single load/save pass. Targets either an explicit nodePaths list or every node matching nodeType (is_class). Returns affected count and node list.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Path to the scene file' },
              property: { type: 'string', description: 'Name of the property to set' },
              value: { description: 'New value (coerced to the property type)' },
              nodePaths: { type: 'array', items: { type: 'string' }, description: 'Explicit node paths to update' },
              nodeType: { type: 'string', description: 'Class filter: update every node that is_class(nodeType)' },
            },
            required: ['projectPath', 'scenePath', 'property', 'value'],
          },
        },
        {
          name: 'cross_scene_set_property',
          description: 'Across multiple scenes: set a property on every node matching nodeType (is_class) and save each scene (unless dryRun). Returns per-scene affected counts, totals, and the dry_run flag.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePaths: { type: 'array', items: { type: 'string' }, description: 'Project-relative .tscn paths to process' },
              nodeType: { type: 'string', description: 'Class filter for nodes to update' },
              property: { type: 'string', description: 'Name of the property to set' },
              value: { description: 'New value (coerced to the property type)' },
              dryRun: { type: 'boolean', description: 'If true, compute affected nodes without saving (default: false)' },
            },
            required: ['projectPath', 'scenePaths', 'nodeType', 'property', 'value'],
          },
        },
        {
          name: 'edit_script',
          description: 'Overwrite an existing .gd script file with new content. The file must already exist.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scriptPath: { type: 'string', description: 'Project-relative path to the existing .gd file' },
              content: { type: 'string', description: 'New full content for the script' },
            },
            required: ['projectPath', 'scriptPath', 'content'],
          },
        },
        {
          name: 'delete_scene',
          description: 'Delete a .tscn scene file from the project. Only .tscn files inside the project are permitted.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              scenePath: { type: 'string', description: 'Project-relative path to the .tscn file to delete' },
            },
            required: ['projectPath', 'scenePath'],
          },
        },
        {
          name: 'set_input_action',
          description: 'Define or replace an input action in the InputMap and persist it to project settings. Each event descriptor is like {type:"key", keycode:"Space"}, {type:"mouse_button", button_index:1}, {type:"joypad_button", button_index:0}, or {type:"joypad_motion", axis:0, axis_value:1.0}. Returns the action and event count.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              action: { type: 'string', description: 'Name of the input action' },
              events: { type: 'array', description: 'Event descriptors that define the action', items: { type: 'object' } },
              deadzone: { type: 'number', description: 'Optional deadzone (default: 0.5)' },
            },
            required: ['projectPath', 'action', 'events'],
          },
        },
        {
          name: 'uid_to_project_path',
          description: 'Resolve a uid:// identifier to its res:// resource path. Fails if the UID is unknown.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              uid: { type: 'string', description: 'A uid:// identifier string' },
            },
            required: ['projectPath', 'uid'],
          },
        },
        {
          name: 'project_path_to_uid',
          description: 'Resolve a res:// (or project-relative) resource path to its uid:// identifier. Fails if no UID is assigned.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              path: { type: 'string', description: 'A res:// or project-relative resource path' },
            },
            required: ['projectPath', 'path'],
          },
        },
        {
          name: 'get_android_preset_info',
          description: 'Return the configuration of the Android export preset from export_presets.cfg (package name, version, keystores, SDK levels, and full options). Defaults to the first Android preset, or pass presetName.',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string', description: 'Path to the Godot project directory' },
              presetName: { type: 'string', description: 'Specific export preset name (optional; defaults to the first platform="Android" preset)' },
            },
            required: ['projectPath'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.logDebug(`Handling tool request: ${request.params.name}`);
      switch (request.params.name) {
        case 'launch_editor':
          return await this.handleLaunchEditor(request.params.arguments);
        case 'run_project':
          return await this.handleRunProject(request.params.arguments);
        case 'get_debug_output':
          return await this.handleGetDebugOutput();
        case 'stop_project':
          return await this.handleStopProject();
        case 'get_godot_version':
          return await this.handleGetGodotVersion();
        case 'list_projects':
          return await this.handleListProjects(request.params.arguments);
        case 'get_project_info':
          return await this.handleGetProjectInfo(request.params.arguments);
        case 'create_scene':
          return await this.handleCreateScene(request.params.arguments);
        case 'add_node':
          return await this.handleAddNode(request.params.arguments);
        case 'load_sprite':
          return await this.handleLoadSprite(request.params.arguments);
        case 'export_mesh_library':
          return await this.handleExportMeshLibrary(request.params.arguments);
        case 'save_scene':
          return await this.handleSaveScene(request.params.arguments);
        case 'get_uid':
          return await this.handleGetUid(request.params.arguments);
        case 'update_project_uids':
          return await this.handleUpdateProjectUids(request.params.arguments);
        // --- Phase 1: READ / inspect ---
        case 'get_scene_tree':
          return await this.handleGetSceneTree(request.params.arguments);
        case 'get_node_properties':
          return await this.handleGetNodeProperties(request.params.arguments);
        case 'get_scene_dependencies':
          return await this.handleGetSceneDependencies(request.params.arguments);
        case 'describe_class':
          return await this.handleDescribeClass(request.params.arguments);
        case 'list_scripts':
          return await this.handleListScripts(request.params.arguments);
        case 'read_script':
          return await this.handleReadScript(request.params.arguments);
        // --- Phase 2: VALIDATE ---
        case 'check_script':
          return await this.handleCheckScript(request.params.arguments);
        case 'validate_scene':
          return await this.handleValidateScene(request.params.arguments);
        case 'run_and_capture_errors':
          return await this.handleRunAndCaptureErrors(request.params.arguments);
        // --- Phase 3: EDIT / structural ---
        case 'set_node_property':
          return await this.handleSetNodeProperty(request.params.arguments);
        case 'delete_node':
          return await this.handleDeleteNode(request.params.arguments);
        case 'rename_node':
          return await this.handleRenameNode(request.params.arguments);
        case 'reparent_node':
          return await this.handleReparentNode(request.params.arguments);
        case 'duplicate_node':
          return await this.handleDuplicateNode(request.params.arguments);
        case 'add_to_group':
          return await this.handleAddToGroup(request.params.arguments);
        case 'remove_from_group':
          return await this.handleRemoveFromGroup(request.params.arguments);
        // --- Phase 4: BEHAVIOR ---
        case 'create_script':
          return await this.handleCreateScript(request.params.arguments);
        case 'attach_script':
          return await this.handleAttachScript(request.params.arguments);
        case 'connect_signal':
          return await this.handleConnectSignal(request.params.arguments);
        case 'disconnect_signal':
          return await this.handleDisconnectSignal(request.params.arguments);
        case 'list_connections':
          return await this.handleListConnections(request.params.arguments);
        case 'instance_scene':
          return await this.handleInstanceScene(request.params.arguments);
        // --- Phase 5: PROJECT settings + resources ---
        case 'get_project_setting':
          return await this.handleGetProjectSetting(request.params.arguments);
        case 'set_project_setting':
          return await this.handleSetProjectSetting(request.params.arguments);
        case 'set_main_scene':
          return await this.handleSetMainScene(request.params.arguments);
        case 'list_autoloads':
          return await this.handleListAutoloads(request.params.arguments);
        case 'add_autoload':
          return await this.handleAddAutoload(request.params.arguments);
        case 'remove_autoload':
          return await this.handleRemoveAutoload(request.params.arguments);
        case 'add_input_action':
          return await this.handleAddInputAction(request.params.arguments);
        case 'remove_input_action':
          return await this.handleRemoveInputAction(request.params.arguments);
        case 'create_resource':
          return await this.handleCreateResource(request.params.arguments);
        case 'edit_resource':
          return await this.handleEditResource(request.params.arguments);
        case 'get_resource_properties':
          return await this.handleGetResourceProperties(request.params.arguments);
        // --- e2e / UAT ---
        case 'run_scene_test':
          return await this.handleRunSceneTest(request.params.arguments);
        case 'run_tests':
          return await this.handleRunTests(request.params.arguments);
        case 'capture_scene_screenshot':
          return await this.handleCaptureSceneScreenshot(request.params.arguments);
        // --- Performance ---
        case 'batch':
          return await this.handleBatch(request.params.arguments);
        case 'build_scene':
          return await this.handleBuildScene(request.params.arguments);
        // --- Capability breadth ---
        case 'find_nodes':
          return await this.handleFindNodes(request.params.arguments);
        case 'list_classes':
          return await this.handleListClasses(request.params.arguments);
        case 'path_to_uid':
          return await this.handlePathToUid(request.params.arguments);
        case 'find_broken_references':
          return await this.handleFindBrokenReferences(request.params.arguments);
        case 'create_animation':
          return await this.handleCreateAnimation(request.params.arguments);
        case 'set_node_properties':
          return await this.handleSetNodeProperties(request.params.arguments);
        case 'reorder_node':
          return await this.handleReorderNode(request.params.arguments);
        case 'export_project':
          return await this.handleExportProject(request.params.arguments);
        case 'get_filesystem_tree':
          return await this.handleGetFilesystemTree(request.params.arguments);
        case 'search_files':
          return await this.handleSearchFiles(request.params.arguments);
        case 'search_in_files':
          return await this.handleSearchInFiles(request.params.arguments);
        case 'get_project_statistics':
          return await this.handleGetProjectStatistics(request.params.arguments);
        case 'get_scene_file_content':
          return await this.handleGetSceneFileContent(request.params.arguments);
        case 'find_script_references':
          return await this.handleFindScriptReferences(request.params.arguments);
        case 'find_node_references':
          return await this.handleFindNodeReferences(request.params.arguments);
        case 'find_unused_resources':
          return await this.handleFindUnusedResources(request.params.arguments);
        case 'detect_circular_dependencies':
          return await this.handleDetectCircularDependencies(request.params.arguments);
        case 'find_signal_connections':
          return await this.handleFindSignalConnections(request.params.arguments);
        case 'list_export_presets':
          return await this.handleListExportPresets(request.params.arguments);
        case 'get_export_info':
          return await this.handleGetExportInfo(request.params.arguments);
        case 'read_resource':
          return await this.handleReadResource(request.params.arguments);
        case 'analyze_scene_complexity':
          return await this.handleAnalyzeSceneComplexity(request.params.arguments);
        case 'analyze_signal_flow':
          return await this.handleAnalyzeSignalFlow(request.params.arguments);
        case 'get_project_settings':
          return await this.handleGetProjectSettings(request.params.arguments);
        case 'get_scene_exports':
          return await this.handleGetSceneExports(request.params.arguments);
        case 'get_node_groups':
          return await this.handleGetNodeGroups(request.params.arguments);
        case 'find_nodes_by_type':
          return await this.handleFindNodesByType(request.params.arguments);
        case 'find_nodes_in_group':
          return await this.handleFindNodesInGroup(request.params.arguments);
        case 'get_input_actions':
          return await this.handleGetInputActions(request.params.arguments);
        case 'tilemap_set_cell':
          return await this.handleTilemapSetCell(request.params.arguments);
        case 'tilemap_fill_rect':
          return await this.handleTilemapFillRect(request.params.arguments);
        case 'tilemap_get_cell':
          return await this.handleTilemapGetCell(request.params.arguments);
        case 'tilemap_clear':
          return await this.handleTilemapClear(request.params.arguments);
        case 'tilemap_get_info':
          return await this.handleTilemapGetInfo(request.params.arguments);
        case 'tilemap_get_used_cells':
          return await this.handleTilemapGetUsedCells(request.params.arguments);
        case 'list_animations':
          return await this.handleListAnimations(request.params.arguments);
        case 'add_animation_track':
          return await this.handleAddAnimationTrack(request.params.arguments);
        case 'set_animation_keyframe':
          return await this.handleSetAnimationKeyframe(request.params.arguments);
        case 'get_animation_info':
          return await this.handleGetAnimationInfo(request.params.arguments);
        case 'remove_animation':
          return await this.handleRemoveAnimation(request.params.arguments);
        case 'create_animation_tree':
          return await this.handleCreateAnimationTree(request.params.arguments);
        case 'get_animation_tree_structure':
          return await this.handleGetAnimationTreeStructure(request.params.arguments);
        case 'add_state_machine_state':
          return await this.handleAddStateMachineState(request.params.arguments);
        case 'remove_state_machine_state':
          return await this.handleRemoveStateMachineState(request.params.arguments);
        case 'add_state_machine_transition':
          return await this.handleAddStateMachineTransition(request.params.arguments);
        case 'remove_state_machine_transition':
          return await this.handleRemoveStateMachineTransition(request.params.arguments);
        case 'set_blend_tree_node':
          return await this.handleSetBlendTreeNode(request.params.arguments);
        case 'set_tree_parameter':
          return await this.handleSetTreeParameter(request.params.arguments);
        case 'add_audio_bus':
          return await this.handleAddAudioBus(request.params.arguments);
        case 'set_audio_bus':
          return await this.handleSetAudioBus(request.params.arguments);
        case 'add_audio_bus_effect':
          return await this.handleAddAudioBusEffect(request.params.arguments);
        case 'get_audio_bus_layout':
          return await this.handleGetAudioBusLayout(request.params.arguments);
        case 'add_audio_player':
          return await this.handleAddAudioPlayer(request.params.arguments);
        case 'get_audio_info':
          return await this.handleGetAudioInfo(request.params.arguments);
        case 'create_shader':
          return await this.handleCreateShader(request.params.arguments);
        case 'read_shader':
          return await this.handleReadShader(request.params.arguments);
        case 'edit_shader':
          return await this.handleEditShader(request.params.arguments);
        case 'assign_shader_material':
          return await this.handleAssignShaderMaterial(request.params.arguments);
        case 'set_shader_param':
          return await this.handleSetShaderParam(request.params.arguments);
        case 'get_shader_params':
          return await this.handleGetShaderParams(request.params.arguments);
        case 'create_theme':
          return await this.handleCreateTheme(request.params.arguments);
        case 'set_theme_color':
          return await this.handleSetThemeColor(request.params.arguments);
        case 'set_theme_constant':
          return await this.handleSetThemeConstant(request.params.arguments);
        case 'set_theme_font_size':
          return await this.handleSetThemeFontSize(request.params.arguments);
        case 'set_theme_stylebox':
          return await this.handleSetThemeStylebox(request.params.arguments);
        case 'get_theme_info':
          return await this.handleGetThemeInfo(request.params.arguments);
        case 'setup_control':
          return await this.handleSetupControl(request.params.arguments);
        case 'create_particles':
          return await this.handleCreateParticles(request.params.arguments);
        case 'set_particle_material':
          return await this.handleSetParticleMaterial(request.params.arguments);
        case 'set_particle_color_gradient':
          return await this.handleSetParticleColorGradient(request.params.arguments);
        case 'apply_particle_preset':
          return await this.handleApplyParticlePreset(request.params.arguments);
        case 'get_particle_info':
          return await this.handleGetParticleInfo(request.params.arguments);
        case 'setup_physics_body':
          return await this.handleSetupPhysicsBody(request.params.arguments);
        case 'setup_collision':
          return await this.handleSetupCollision(request.params.arguments);
        case 'set_physics_layers':
          return await this.handleSetPhysicsLayers(request.params.arguments);
        case 'get_physics_layers':
          return await this.handleGetPhysicsLayers(request.params.arguments);
        case 'add_raycast':
          return await this.handleAddRaycast(request.params.arguments);
        case 'get_collision_info':
          return await this.handleGetCollisionInfo(request.params.arguments);
        // --- Navigation ---
        case 'setup_navigation_region':
          return await this.handleSetupNavigationRegion(request.params.arguments);
        case 'bake_navigation_mesh':
          return await this.handleBakeNavigationMesh(request.params.arguments);
        case 'setup_navigation_agent':
          return await this.handleSetupNavigationAgent(request.params.arguments);
        case 'set_navigation_layers':
          return await this.handleSetNavigationLayers(request.params.arguments);
        case 'get_navigation_info':
          return await this.handleGetNavigationInfo(request.params.arguments);
        // --- 3D ---
        case 'add_mesh_instance':
          return await this.handleAddMeshInstance(request.params.arguments);
        case 'setup_lighting':
          return await this.handleSetupLighting(request.params.arguments);
        case 'set_material_3d':
          return await this.handleSetMaterial3d(request.params.arguments);
        case 'setup_environment':
          return await this.handleSetupEnvironment(request.params.arguments);
        case 'setup_camera_3d':
          return await this.handleSetupCamera3d(request.params.arguments);
        case 'add_gridmap':
          return await this.handleAddGridmap(request.params.arguments);
        case 'update_property':
          return await this.handleUpdateProperty(request.params.arguments);
        case 'validate_script':
          return await this.handleValidateScript(request.params.arguments);
        case 'add_scene_instance':
          return await this.handleAddSceneInstance(request.params.arguments);
        case 'move_node':
          return await this.handleMoveNode(request.params.arguments);
        case 'add_resource':
          return await this.handleAddResource(request.params.arguments);
        case 'set_anchor_preset':
          return await this.handleSetAnchorPreset(request.params.arguments);
        case 'set_node_groups':
          return await this.handleSetNodeGroups(request.params.arguments);
        case 'batch_add_nodes':
          return await this.handleBatchAddNodes(request.params.arguments);
        case 'batch_set_property':
          return await this.handleBatchSetProperty(request.params.arguments);
        case 'cross_scene_set_property':
          return await this.handleCrossSceneSetProperty(request.params.arguments);
        case 'edit_script':
          return await this.handleEditScript(request.params.arguments);
        case 'delete_scene':
          return await this.handleDeleteScene(request.params.arguments);
        case 'set_input_action':
          return await this.handleSetInputAction(request.params.arguments);
        case 'uid_to_project_path':
          return await this.handleUidToProjectPath(request.params.arguments);
        case 'project_path_to_uid':
          return await this.handleProjectPathToUid(request.params.arguments);
        case 'get_android_preset_info':
          return await this.handleGetAndroidPresetInfo(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  /**
   * Handle the launch_editor tool
   * @param args Tool arguments
   */
  private async handleLaunchEditor(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      this.logDebug(`Launching Godot editor for project: ${args.projectPath}`);
      const process = spawn(this.godotPath, ['-e', '--path', args.projectPath], {
        stdio: 'pipe',
      });

      process.on('error', (err: Error) => {
        console.error('Failed to start Godot editor:', err);
      });

      return {
        content: [
          {
            type: 'text',
            text: `Godot editor launched successfully for project at ${args.projectPath}.`,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to launch Godot editor: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the run_project tool
   * @param args Tool arguments
   */
  private async handleRunProject(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Kill any existing process
      if (this.activeProcess) {
        this.logDebug('Killing existing Godot process before starting a new one');
        this.activeProcess.process.kill();
      }

      const cmdArgs = ['-d', '--path', args.projectPath];
      if (args.scene && this.validatePath(args.scene)) {
        this.logDebug(`Adding scene parameter: ${args.scene}`);
        cmdArgs.push(args.scene);
      }

      this.logDebug(`Running Godot project: ${args.projectPath}`);
      const process = spawn(this.godotPath!, cmdArgs, { stdio: 'pipe' });
      const output: string[] = [];
      const errors: string[] = [];

      process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        output.push(...lines);
        lines.forEach((line: string) => {
          if (line.trim()) this.logDebug(`[Godot stdout] ${line}`);
        });
      });

      process.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        errors.push(...lines);
        lines.forEach((line: string) => {
          if (line.trim()) this.logDebug(`[Godot stderr] ${line}`);
        });
      });

      process.on('exit', (code: number | null) => {
        this.logDebug(`Godot process exited with code ${code}`);
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess = null;
        }
      });

      process.on('error', (err: Error) => {
        console.error('Failed to start Godot process:', err);
        if (this.activeProcess && this.activeProcess.process === process) {
          this.activeProcess = null;
        }
      });

      this.activeProcess = { process, output, errors };

      return {
        content: [
          {
            type: 'text',
            text: `Godot project started in debug mode. Use get_debug_output to see output.`,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to run Godot project: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_debug_output tool
   */
  private async handleGetDebugOutput() {
    if (!this.activeProcess) {
      return this.createErrorResponse(
        'No active Godot process.',
        [
          'Use run_project to start a Godot project first',
          'Check if the Godot process crashed unexpectedly',
        ]
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              output: this.activeProcess.output,
              errors: this.activeProcess.errors,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle the stop_project tool
   */
  private async handleStopProject() {
    if (!this.activeProcess) {
      return this.createErrorResponse(
        'No active Godot process to stop.',
        [
          'Use run_project to start a Godot project first',
          'The process may have already terminated',
        ]
      );
    }

    this.logDebug('Stopping active Godot process');
    this.activeProcess.process.kill();
    const output = this.activeProcess.output;
    const errors = this.activeProcess.errors;
    this.activeProcess = null;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              message: 'Godot project stopped',
              finalOutput: output,
              finalErrors: errors,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle the get_godot_version tool
   */
  private async handleGetGodotVersion() {
    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      this.logDebug('Getting Godot version');
      const { stdout } = await execFileAsync(this.godotPath!, ['--version']);
      return {
        content: [
          {
            type: 'text',
            text: stdout.trim(),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResponse(
        `Failed to get Godot version: ${errorMessage}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
        ]
      );
    }
  }

  /**
   * Handle the list_projects tool
   */
  private async handleListProjects(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.directory) {
      return this.createErrorResponse(
        'Directory is required',
        ['Provide a valid directory path to search for Godot projects']
      );
    }

    if (!this.validatePath(args.directory)) {
      return this.createErrorResponse(
        'Invalid directory path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      this.logDebug(`Listing Godot projects in directory: ${args.directory}`);
      if (!existsSync(args.directory)) {
        return this.createErrorResponse(
          `Directory does not exist: ${args.directory}`,
          ['Provide a valid directory path that exists on the system']
        );
      }

      const recursive = args.recursive === true;
      const projects = this.findGodotProjects(args.directory, recursive);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to list projects: ${error?.message || 'Unknown error'}`,
        [
          'Ensure the directory exists and is accessible',
          'Check if you have permission to read the directory',
        ]
      );
    }
  }

  /**
   * Get the structure of a Godot project asynchronously by counting files recursively
   * @param projectPath Path to the Godot project
   * @returns Promise resolving to an object with counts of scenes, scripts, assets, and other files
   */
  private getProjectStructureAsync(projectPath: string): Promise<any> {
    return new Promise((resolve) => {
      try {
        const structure = {
          scenes: 0,
          scripts: 0,
          assets: 0,
          other: 0,
        };

        const scanDirectory = (currentPath: string) => {
          const entries = readdirSync(currentPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const entryPath = join(currentPath, entry.name);
            
            // Skip hidden files and directories
            if (entry.name.startsWith('.')) {
              continue;
            }
            
            if (entry.isDirectory()) {
              // Recursively scan subdirectories
              scanDirectory(entryPath);
            } else if (entry.isFile()) {
              // Count file by extension
              const ext = entry.name.split('.').pop()?.toLowerCase();
              
              if (ext === 'tscn') {
                structure.scenes++;
              } else if (ext === 'gd' || ext === 'gdscript' || ext === 'cs') {
                structure.scripts++;
              } else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'ttf', 'wav', 'mp3', 'ogg'].includes(ext || '')) {
                structure.assets++;
              } else {
                structure.other++;
              }
            }
          }
        };
        
        // Start scanning from the project root
        scanDirectory(projectPath);
        resolve(structure);
      } catch (error) {
        this.logDebug(`Error getting project structure asynchronously: ${error}`);
        resolve({ 
          error: 'Failed to get project structure',
          scenes: 0,
          scripts: 0,
          assets: 0,
          other: 0
        });
      }
    });
  }

  /**
   * Handle the get_project_info tool
   */
  private async handleGetProjectInfo(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }
  
    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }
  
    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }
  
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }
  
      this.logDebug(`Getting project info for: ${args.projectPath}`);
  
      // Get Godot version
      const execOptions = { timeout: 10000 }; // 10 second timeout
      const { stdout } = await execFileAsync(this.godotPath!, ['--version'], execOptions);
  
      // Get project structure using the recursive method
      const projectStructure = await this.getProjectStructureAsync(args.projectPath);
  
      // Extract project name from project.godot file
      let projectName = basename(args.projectPath);
      try {
        const fs = require('fs');
        const projectFileContent = fs.readFileSync(projectFile, 'utf8');
        const configNameMatch = projectFileContent.match(/config\/name="([^"]+)"/);
        if (configNameMatch && configNameMatch[1]) {
          projectName = configNameMatch[1];
          this.logDebug(`Found project name in config: ${projectName}`);
        }
      } catch (error) {
        this.logDebug(`Error reading project file: ${error}`);
        // Continue with default project name if extraction fails
      }
  
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                name: projectName,
                path: args.projectPath,
                godotVersion: stdout.trim(),
                structure: projectStructure,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get project info: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the create_scene tool
   */
  private async handleCreateScene(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Project path and scene path are required',
        ['Provide valid paths for both the project and the scene']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    const rootNodeType = args.rootNodeType || 'Node2D';
    if (!this.validateClassName(rootNodeType)) {
      return this.createErrorResponse(
        'Invalid rootNodeType',
        ['rootNodeType must be a built-in Godot class name (no paths, no file extensions)']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        rootNodeType,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('create_scene', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to create scene: ${stderr}`,
          [
            'Check if the root node type is valid',
            'Ensure you have write permissions to the scene path',
            'Verify the scene path is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Scene created successfully at: ${args.scenePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to create scene: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the add_node tool
   */
  private async handleAddNode(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.nodeType || !args.nodeName) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodeType, and nodeName']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    if (!this.validateClassName(args.nodeType)) {
      return this.createErrorResponse(
        'Invalid nodeType',
        ['nodeType must be a built-in Godot class name (no paths, no file extensions)']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        nodeType: args.nodeType,
        nodeName: args.nodeName,
      };

      // Add optional parameters
      if (args.parentNodePath) {
        params.parentNodePath = args.parentNodePath;
      }

      if (args.properties) {
        params.properties = args.properties;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('add_node', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to add node: ${stderr}`,
          [
            'Check if the node type is valid',
            'Ensure the parent node path exists',
            'Verify the scene file is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Node '${args.nodeName}' of type '${args.nodeType}' added successfully to '${args.scenePath}'.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to add node: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the load_sprite tool
   */
  private async handleLoadSprite(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.nodePath || !args.texturePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, nodePath, and texturePath']
      );
    }

    if (
      !this.validatePath(args.projectPath) ||
      !this.validatePath(args.scenePath) ||
      !this.validatePath(args.nodePath) ||
      !this.validatePath(args.texturePath)
    ) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Check if the texture file exists
      const texturePath = join(args.projectPath, args.texturePath);
      if (!existsSync(texturePath)) {
        return this.createErrorResponse(
          `Texture file does not exist: ${args.texturePath}`,
          [
            'Ensure the texture path is correct',
            'Upload or create the texture file first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        scenePath: args.scenePath,
        nodePath: args.nodePath,
        texturePath: args.texturePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('load_sprite', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to load sprite: ${stderr}`,
          [
            'Check if the node path is correct',
            'Ensure the node is a Sprite2D, Sprite3D, or TextureRect',
            'Verify the texture file is a valid image format',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Sprite loaded successfully with texture: ${args.texturePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to load sprite: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the export_mesh_library tool
   */
  private async handleExportMeshLibrary(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath || !args.outputPath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath, scenePath, and outputPath']
      );
    }

    if (
      !this.validatePath(args.projectPath) ||
      !this.validatePath(args.scenePath) ||
      !this.validatePath(args.outputPath)
    ) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
        outputPath: args.outputPath,
      };

      // Add optional parameters
      if (args.meshItemNames && Array.isArray(args.meshItemNames)) {
        params.meshItemNames = args.meshItemNames;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('export_mesh_library', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to export mesh library: ${stderr}`,
          [
            'Check if the scene contains valid 3D meshes',
            'Ensure the output path is valid',
            'Verify the scene file is valid',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `MeshLibrary exported successfully to: ${args.outputPath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to export mesh library: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the save_scene tool
   */
  private async handleSaveScene(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.scenePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and scenePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.scenePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    // If newPath is provided, validate it
    if (args.newPath && !this.validatePath(args.newPath)) {
      return this.createErrorResponse(
        'Invalid new path',
        ['Provide a valid new path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the scene file exists
      const scenePath = join(args.projectPath, args.scenePath);
      if (!existsSync(scenePath)) {
        return this.createErrorResponse(
          `Scene file does not exist: ${args.scenePath}`,
          [
            'Ensure the scene path is correct',
            'Use create_scene to create a new scene first',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params: any = {
        scenePath: args.scenePath,
      };

      // Add optional parameters
      if (args.newPath) {
        params.newPath = args.newPath;
      }

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('save_scene', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to save scene: ${stderr}`,
          [
            'Check if the scene file is valid',
            'Ensure you have write permissions to the output path',
            'Verify the scene can be properly packed',
          ]
        );
      }

      const savePath = args.newPath || args.scenePath;
      return {
        content: [
          {
            type: 'text',
            text: `Scene saved successfully to: ${savePath}\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to save scene: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the get_uid tool
   */
  private async handleGetUid(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath || !args.filePath) {
      return this.createErrorResponse(
        'Missing required parameters',
        ['Provide projectPath and filePath']
      );
    }

    if (!this.validatePath(args.projectPath) || !this.validatePath(args.filePath)) {
      return this.createErrorResponse(
        'Invalid path',
        ['Provide valid paths without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Check if the file exists
      const filePath = join(args.projectPath, args.filePath);
      if (!existsSync(filePath)) {
        return this.createErrorResponse(
          `File does not exist: ${args.filePath}`,
          ['Ensure the file path is correct']
        );
      }

      // Get Godot version to check if UIDs are supported
      const { stdout: versionOutput } = await execFileAsync(this.godotPath!, ['--version']);
      const version = versionOutput.trim();

      if (!this.isGodot44OrLater(version)) {
        return this.createErrorResponse(
          `UIDs are only supported in Godot 4.4 or later. Current version: ${version}`,
          [
            'Upgrade to Godot 4.4 or later to use UIDs',
            'Use resource paths instead of UIDs for this version of Godot',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        filePath: args.filePath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('get_uid', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to get UID: ${stderr}`,
          [
            'Check if the file is a valid Godot resource',
            'Ensure the file path is correct',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `UID for ${args.filePath}: ${stdout.trim()}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to get UID: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  /**
   * Handle the update_project_uids tool
   */
  private async handleUpdateProjectUids(args: any) {
    // Normalize parameters to camelCase
    args = this.normalizeParameters(args);
    
    if (!args.projectPath) {
      return this.createErrorResponse(
        'Project path is required',
        ['Provide a valid path to a Godot project directory']
      );
    }

    if (!this.validatePath(args.projectPath)) {
      return this.createErrorResponse(
        'Invalid project path',
        ['Provide a valid path without ".." or other potentially unsafe characters']
      );
    }

    try {
      // Ensure godotPath is set
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) {
          return this.createErrorResponse(
            'Could not find a valid Godot executable path',
            [
              'Ensure Godot is installed correctly',
              'Set GODOT_PATH environment variable to specify the correct path',
            ]
          );
        }
      }

      // Check if the project directory exists and contains a project.godot file
      const projectFile = join(args.projectPath, 'project.godot');
      if (!existsSync(projectFile)) {
        return this.createErrorResponse(
          `Not a valid Godot project: ${args.projectPath}`,
          [
            'Ensure the path points to a directory containing a project.godot file',
            'Use list_projects to find valid Godot projects',
          ]
        );
      }

      // Get Godot version to check if UIDs are supported
      const { stdout: versionOutput } = await execFileAsync(this.godotPath!, ['--version']);
      const version = versionOutput.trim();

      if (!this.isGodot44OrLater(version)) {
        return this.createErrorResponse(
          `UIDs are only supported in Godot 4.4 or later. Current version: ${version}`,
          [
            'Upgrade to Godot 4.4 or later to use UIDs',
            'Use resource paths instead of UIDs for this version of Godot',
          ]
        );
      }

      // Prepare parameters for the operation (already in camelCase)
      const params = {
        projectPath: args.projectPath,
      };

      // Execute the operation
      const { stdout, stderr } = await this.executeOperation('resave_resources', params, args.projectPath);

      if (stderr && stderr.includes('Failed to')) {
        return this.createErrorResponse(
          `Failed to update project UIDs: ${stderr}`,
          [
            'Check if the project is valid',
            'Ensure you have write permissions to the project directory',
          ]
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Project UIDs updated successfully.\n\nOutput: ${stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return this.createErrorResponse(
        `Failed to update project UIDs: ${error?.message || 'Unknown error'}`,
        [
          'Ensure Godot is installed correctly',
          'Check if the GODOT_PATH environment variable is set correctly',
          'Verify the project path is accessible',
        ]
      );
    }
  }

  // =========================================================================
  // Extended toolset handlers
  // =========================================================================

  /**
   * Shared dispatcher for GDScript-backed structured operations.
   */
  private async dispatchOp(
    operation: string,
    projectPath: string,
    opParams: OperationParams,
    summary: string,
    extraPaths: string[] = []
  ): Promise<any> {
    const err = this.checkProject(projectPath, ...extraPaths);
    if (err) return err;
    try {
      const { success, result, stderr, stdout } = await this.executeStructuredOperation(
        operation,
        opParams,
        projectPath
      );
      if (!success) {
        const detail = (stderr && stderr.trim()) || (stdout && stdout.trim()) || 'unknown error';
        return this.createErrorResponse(`${operation} failed: ${detail}`, [
          'Verify the scene/node/resource paths exist',
          'Use get_scene_tree or describe_class to confirm names',
        ]);
      }
      return this.structuredResponse(summary, result);
    } catch (error: any) {
      return this.createErrorResponse(`${operation} failed: ${error?.message || 'Unknown error'}`, [
        'Ensure Godot is installed correctly and GODOT_PATH is set',
        'Verify the project path is accessible',
      ]);
    }
  }

  private missing(...names: string[]): any {
    return this.createErrorResponse(`Missing required parameter(s): ${names.join(', ')}`, [
      `Provide: ${names.join(', ')}`,
    ]);
  }

  // ----- Phase 1: READ / inspect -----

  private async handleGetSceneTree(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    return this.dispatchOp('get_scene_tree', args.projectPath, { scenePath: args.scenePath },
      `Scene tree for '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleGetNodeProperties(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    return this.dispatchOp('get_node_properties', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, mode: args.mode || 'overrides' },
      `Properties of '${args.nodePath}' in '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleGetSceneDependencies(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    return this.dispatchOp('get_scene_dependencies', args.projectPath, { scenePath: args.scenePath },
      `Dependencies of '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleDescribeClass(args: any) {
    args = this.normalizeParameters(args);
    if (!args.className) return this.missing('className');
    if (!this.validateClassName(args.className)) {
      return this.createErrorResponse('Invalid className', ['className must be a simple identifier (no paths or dots)']);
    }
    return this.dispatchOp('describe_class', args.projectPath, { classNameQuery: args.className },
      `Class '${args.className}':`);
  }

  private async handleListScripts(args: any) {
    args = this.normalizeParameters(args);
    const err = this.checkProject(args.projectPath, args.directory);
    if (err) return err;
    try {
      const base = args.directory ? join(args.projectPath, args.directory) : args.projectPath;
      const scripts: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith('.')) continue;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith('.gd')) scripts.push(full.substring(args.projectPath.length).replace(/^[/\\]/, ''));
        }
      };
      if (existsSync(base)) walk(base);
      return this.structuredResponse(`Found ${scripts.length} script(s):`, scripts);
    } catch (error: any) {
      return this.createErrorResponse(`Failed to list scripts: ${error?.message || 'Unknown error'}`, []);
    }
  }

  private async handleReadScript(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scriptPath) return this.missing('scriptPath');
    const err = this.checkProject(args.projectPath, args.scriptPath);
    if (err) return err;
    try {
      const full = join(args.projectPath, args.scriptPath);
      if (!existsSync(full)) return this.createErrorResponse(`Script not found: ${args.scriptPath}`, []);
      const content = readFileSync(full, 'utf-8');
      return { content: [{ type: 'text', text: content }] };
    } catch (error: any) {
      return this.createErrorResponse(`Failed to read script: ${error?.message || 'Unknown error'}`, []);
    }
  }

  // ----- Phase 2: VALIDATE / diagnostics -----

  private async handleCheckScript(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scriptPath) return this.missing('scriptPath');
    const err = this.checkProject(args.projectPath, args.scriptPath);
    if (err) return err;
    try {
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) throw new Error('Could not find a valid Godot executable path');
      }
      const scriptResPath = args.scriptPath.startsWith('res://') ? args.scriptPath : 'res://' + args.scriptPath;
      const cmdArgs = ['--headless', '--path', args.projectPath, '--check-only', '--script', scriptResPath];
      const { stdout, stderr, code } = await this.executeRaw(cmdArgs);
      const combined = `${stdout}\n${stderr}`.trim();
      const hasErrors = code !== 0 || /SCRIPT ERROR|Parse Error|ERROR/.test(combined);
      return this.structuredResponse(
        hasErrors ? `Parse check FAILED for '${args.scriptPath}':` : `Parse check OK for '${args.scriptPath}'.`,
        { ok: !hasErrors, exitCode: code, output: combined }
      );
    } catch (error: any) {
      return this.createErrorResponse(`Failed to check script: ${error?.message || 'Unknown error'}`, []);
    }
  }

  private async handleValidateScene(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    // validate_scene reports issues via the result payload; treat the op as
    // "ran successfully" even when the scene itself is invalid.
    const err = this.checkProject(args.projectPath, args.scenePath);
    if (err) return err;
    try {
      const { result, stderr, stdout } = await this.executeStructuredOperation(
        'validate_scene', { scenePath: args.scenePath }, args.projectPath
      );
      if (result === null) {
        const detail = (stderr && stderr.trim()) || (stdout && stdout.trim()) || 'unknown error';
        return this.createErrorResponse(`validate_scene failed: ${detail}`, []);
      }
      return this.structuredResponse(`Validation of '${args.scenePath}':`, result);
    } catch (error: any) {
      return this.createErrorResponse(`validate_scene failed: ${error?.message || 'Unknown error'}`, []);
    }
  }

  private async handleRunAndCaptureErrors(args: any) {
    args = this.normalizeParameters(args);
    const err = this.checkProject(args.projectPath, args.scene);
    if (err) return err;
    try {
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) throw new Error('Could not find a valid Godot executable path');
      }
      const seconds = typeof args.timeoutSeconds === 'number' ? args.timeoutSeconds : 5;
      const cmdArgs = ['--headless', '--path', args.projectPath, '--quit-after', String(Math.max(1, Math.round(seconds * 60)))];
      if (args.scene) cmdArgs.push(args.scene);
      const { stdout, stderr, code } = await this.executeRaw(cmdArgs, (seconds + 30) * 1000);
      const combined = `${stdout}\n${stderr}`;
      const errorLines = combined.split('\n').filter((l) => /SCRIPT ERROR|ERROR|WARNING|Parse Error/i.test(l));
      return this.structuredResponse(`Ran '${args.scene || 'main scene'}' for ~${seconds}s (exit ${code}):`, {
        exitCode: code,
        errorCount: errorLines.length,
        errors: errorLines.slice(0, 200),
        stdoutTail: stdout.split('\n').slice(-50).join('\n'),
      });
    } catch (error: any) {
      return this.createErrorResponse(`run_and_capture_errors failed: ${error?.message || 'Unknown error'}`, []);
    }
  }

  /**
   * Run Godot with raw args (not via the ops script). Returns exit code too.
   */
  private async executeRaw(args: string[], timeoutMs: number = OPERATION_TIMEOUT_MS): Promise<{ stdout: string; stderr: string; code: number }> {
    if (!this.godotPath) {
      await this.detectGodotPath();
      if (!this.godotPath) throw new Error('Could not find a valid Godot executable path');
    }
    try {
      const { stdout, stderr } = await execFileAsync(this.godotPath!, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 32 });
      return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 };
    } catch (error: unknown) {
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        const e = error as Error & { stdout: string; stderr: string; code?: number; killed?: boolean };
        if (e.killed) throw new Error(`Godot timed out after ${timeoutMs}ms`);
        return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: typeof e.code === 'number' ? e.code : 1 };
      }
      throw error;
    }
  }

  // ----- Phase 3: EDIT / structural -----

  private async handleSetNodeProperty(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.property || args.value === undefined) {
      return this.missing('scenePath', 'nodePath', 'property', 'value');
    }
    return this.dispatchOp('set_node_property', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, property: args.property, value: args.value },
      `Set '${args.property}' on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleDeleteNode(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    return this.dispatchOp('delete_node', args.projectPath, { scenePath: args.scenePath, nodePath: args.nodePath },
      `Deleted '${args.nodePath}' from '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleRenameNode(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.newName) return this.missing('scenePath', 'nodePath', 'newName');
    return this.dispatchOp('rename_node', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, newName: args.newName },
      `Renamed '${args.nodePath}' to '${args.newName}':`, [args.scenePath]);
  }

  private async handleReparentNode(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || args.newParentPath === undefined) {
      return this.missing('scenePath', 'nodePath', 'newParentPath');
    }
    return this.dispatchOp('reparent_node', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, newParentPath: args.newParentPath, keepGlobalTransform: args.keepGlobalTransform !== false },
      `Reparented '${args.nodePath}' under '${args.newParentPath}':`, [args.scenePath]);
  }

  private async handleDuplicateNode(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    const opParams: OperationParams = { scenePath: args.scenePath, nodePath: args.nodePath };
    if (args.newName) opParams.newName = args.newName;
    return this.dispatchOp('duplicate_node', args.projectPath, opParams,
      `Duplicated '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleAddToGroup(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.group) return this.missing('scenePath', 'nodePath', 'group');
    return this.dispatchOp('add_to_group', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, group: args.group },
      `Added '${args.nodePath}' to group '${args.group}':`, [args.scenePath]);
  }

  private async handleRemoveFromGroup(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.group) return this.missing('scenePath', 'nodePath', 'group');
    return this.dispatchOp('remove_from_group', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, group: args.group },
      `Removed '${args.nodePath}' from group '${args.group}':`, [args.scenePath]);
  }

  // ----- Phase 4: BEHAVIOR -----

  private async handleCreateScript(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scriptPath) return this.missing('scriptPath');
    const err = this.checkProject(args.projectPath, args.scriptPath);
    if (err) return err;
    try {
      const full = join(args.projectPath, args.scriptPath);
      if (existsSync(full) && !args.overwrite) {
        return this.createErrorResponse(`Script already exists: ${args.scriptPath}`, ['Pass overwrite: true to replace it']);
      }
      let content: string;
      if (args.content) {
        content = args.content;
      } else {
        const base = args.extends || 'Node';
        const header = args.className ? `class_name ${args.className}\nextends ${base}\n` : `extends ${base}\n`;
        content = `${header}\n\nfunc _ready() -> void:\n\tpass\n`;
      }
      const dir = dirname(full);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(full, content, 'utf-8');
      return this.structuredResponse(`Created script '${args.scriptPath}'.`, { path: args.scriptPath, bytes: content.length });
    } catch (error: any) {
      return this.createErrorResponse(`Failed to create script: ${error?.message || 'Unknown error'}`, []);
    }
  }

  private async handleAttachScript(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.scriptPath) return this.missing('scenePath', 'nodePath', 'scriptPath');
    return this.dispatchOp('attach_script', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, scriptPath: args.scriptPath },
      `Attached '${args.scriptPath}' to '${args.nodePath}':`, [args.scenePath, args.scriptPath]);
  }

  private async handleConnectSignal(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.fromNode === undefined || !args.signalName || args.toNode === undefined || !args.method) {
      return this.missing('scenePath', 'fromNode', 'signalName', 'toNode', 'method');
    }
    return this.dispatchOp('connect_signal', args.projectPath,
      { scenePath: args.scenePath, fromNode: args.fromNode, signalName: args.signalName, toNode: args.toNode, method: args.method },
      `Connected '${args.signalName}' (${args.fromNode} -> ${args.toNode}.${args.method}):`, [args.scenePath]);
  }

  private async handleDisconnectSignal(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.fromNode === undefined || !args.signalName || args.toNode === undefined || !args.method) {
      return this.missing('scenePath', 'fromNode', 'signalName', 'toNode', 'method');
    }
    return this.dispatchOp('disconnect_signal', args.projectPath,
      { scenePath: args.scenePath, fromNode: args.fromNode, signalName: args.signalName, toNode: args.toNode, method: args.method },
      `Disconnected '${args.signalName}':`, [args.scenePath]);
  }

  private async handleListConnections(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    return this.dispatchOp('list_connections', args.projectPath, { scenePath: args.scenePath },
      `Connections in '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleInstanceScene(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.instanceScenePath) return this.missing('scenePath', 'instanceScenePath');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      instanceScenePath: args.instanceScenePath,
      parentNodePath: args.parentNodePath || '',
    };
    if (args.nodeName) opParams.nodeName = args.nodeName;
    return this.dispatchOp('instance_scene', args.projectPath, opParams,
      `Instanced '${args.instanceScenePath}' into '${args.scenePath}':`, [args.scenePath, args.instanceScenePath]);
  }

  // ----- Phase 5: PROJECT settings + resources -----

  private async handleGetProjectSetting(args: any) {
    args = this.normalizeParameters(args);
    if (!args.setting) return this.missing('setting');
    return this.dispatchOp('get_project_setting', args.projectPath, { setting: args.setting },
      `Setting '${args.setting}':`);
  }

  private async handleSetProjectSetting(args: any) {
    args = this.normalizeParameters(args);
    if (!args.setting || args.value === undefined) return this.missing('setting', 'value');
    return this.dispatchOp('set_project_setting', args.projectPath, { setting: args.setting, value: args.value },
      `Set '${args.setting}':`);
  }

  private async handleSetMainScene(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    const scene = args.scenePath.startsWith('res://') ? args.scenePath : 'res://' + args.scenePath;
    return this.dispatchOp('set_project_setting', args.projectPath,
      { setting: 'application/run/main_scene', value: scene },
      `Set main scene to '${scene}':`, [args.scenePath]);
  }

  private async handleListAutoloads(args: any) {
    args = this.normalizeParameters(args);
    return this.dispatchOp('list_autoloads', args.projectPath, {}, 'Autoloads:');
  }

  private async handleAddAutoload(args: any) {
    args = this.normalizeParameters(args);
    if (!args.autoloadName || !args.path) return this.missing('autoloadName', 'path');
    return this.dispatchOp('add_autoload', args.projectPath,
      { autoloadName: args.autoloadName, path: args.path, enabled: args.enabled !== false },
      `Added autoload '${args.autoloadName}':`, [args.path]);
  }

  private async handleRemoveAutoload(args: any) {
    args = this.normalizeParameters(args);
    if (!args.autoloadName) return this.missing('autoloadName');
    return this.dispatchOp('remove_autoload', args.projectPath, { autoloadName: args.autoloadName },
      `Removed autoload '${args.autoloadName}':`);
  }

  private async handleAddInputAction(args: any) {
    args = this.normalizeParameters(args);
    if (!args.action || !args.events) return this.missing('action', 'events');
    return this.dispatchOp('add_input_action', args.projectPath,
      { action: args.action, events: args.events, deadzone: args.deadzone, replace: args.replace === true },
      `Added input action '${args.action}':`);
  }

  private async handleRemoveInputAction(args: any) {
    args = this.normalizeParameters(args);
    if (!args.action) return this.missing('action');
    return this.dispatchOp('remove_input_action', args.projectPath, { action: args.action },
      `Removed input action '${args.action}':`);
  }

  private async handleCreateResource(args: any) {
    args = this.normalizeParameters(args);
    if (!args.resourcePath || !args.resourceClass) return this.missing('resourcePath', 'resourceClass');
    if (!this.validateClassName(args.resourceClass)) {
      return this.createErrorResponse('Invalid resourceClass', ['resourceClass must be a simple class name']);
    }
    return this.dispatchOp('create_resource', args.projectPath,
      { resourcePath: args.resourcePath, resourceClass: args.resourceClass, properties: args.properties || {} },
      `Created resource '${args.resourcePath}':`, [args.resourcePath]);
  }

  private async handleEditResource(args: any) {
    args = this.normalizeParameters(args);
    if (!args.resourcePath || !args.properties) return this.missing('resourcePath', 'properties');
    return this.dispatchOp('edit_resource', args.projectPath,
      { resourcePath: args.resourcePath, properties: args.properties },
      `Edited resource '${args.resourcePath}':`, [args.resourcePath]);
  }

  private async handleGetResourceProperties(args: any) {
    args = this.normalizeParameters(args);
    if (!args.resourcePath) return this.missing('resourcePath');
    return this.dispatchOp('get_resource_properties', args.projectPath, { resourcePath: args.resourcePath },
      `Properties of '${args.resourcePath}':`, [args.resourcePath]);
  }

  // ----- Automated e2e / UAT -----

  private async handleRunSceneTest(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.steps) return this.missing('scenePath', 'steps');
    if (!Array.isArray(args.steps)) {
      return this.createErrorResponse('steps must be an array of step objects', ['See the run_scene_test description for the step schema']);
    }
    const err = this.checkProject(args.projectPath, args.scenePath);
    if (err) return err;
    const scenarioSeconds = typeof args.timeoutSeconds === 'number' ? args.timeoutSeconds : 10;
    // Give the process headroom beyond the scenario's own internal timeout.
    const procTimeout = Math.max(OPERATION_TIMEOUT_MS, (scenarioSeconds + 30) * 1000);
    try {
      const { result, stderr, stdout } = await this.executeStructuredOperation(
        'run_scene_test',
        { scenePath: args.scenePath, steps: args.steps, timeoutSeconds: scenarioSeconds },
        args.projectPath,
        procTimeout
      );
      if (result === null) {
        const detail = (stderr && stderr.trim()) || (stdout && stdout.trim()) || 'unknown error';
        return this.createErrorResponse(`run_scene_test failed to run: ${detail}`, [
          'Ensure the scene instantiates (try validate_scene first)',
          'Check that referenced input actions exist (add_input_action)',
        ]);
      }
      const verdict = result.all_passed ? '✅ ALL PASSED' : `❌ ${result.failed} FAILED`;
      const summary = `e2e test of '${args.scenePath}': ${verdict} (${result.passed}/${result.total} assertions passed)`;
      return this.structuredResponse(summary, result);
    } catch (error: any) {
      return this.createErrorResponse(`run_scene_test failed: ${error?.message || 'Unknown error'}`, []);
    }
  }

  private async handleRunTests(args: any) {
    args = this.normalizeParameters(args);
    const err = this.checkProject(args.projectPath, args.testPath);
    if (err) return err;
    try {
      const hasGut = existsSync(join(args.projectPath, 'addons', 'gut'));
      const hasGdUnit = existsSync(join(args.projectPath, 'addons', 'gdUnit4'));
      let framework = args.framework && args.framework !== 'auto' ? args.framework : (hasGut ? 'gut' : hasGdUnit ? 'gdunit4' : null);
      if (!framework) {
        return this.createErrorResponse('No supported test framework found (looked for addons/gut and addons/gdUnit4).', [
          'Install GUT (https://github.com/bitwes/Gut) or GdUnit4 (https://github.com/MikeSchulze/gdUnit4)',
          'For framework-free tests, use run_scene_test instead',
        ]);
      }
      let cmdArgs: string[];
      if (framework === 'gut') {
        cmdArgs = ['--headless', '--path', args.projectPath, '-s', 'res://addons/gut/gut_cmdln.gd', '-gexit'];
        cmdArgs.push(args.testPath ? `-gdir=${args.testPath.startsWith('res://') ? args.testPath : 'res://' + args.testPath}` : '-gdir=res://test');
      } else {
        // GdUnit4 headless runner
        cmdArgs = ['--headless', '--path', args.projectPath, '-s', 'res://addons/gdUnit4/bin/GdUnitCmdTool.gd'];
        if (args.testPath) cmdArgs.push('-a', args.testPath);
      }
      const { stdout, stderr, code } = await this.executeRaw(cmdArgs, 180000);
      const combined = `${stdout}\n${stderr}`;
      // Best-effort summary extraction.
      const summaryLines = combined.split('\n').filter((l) => /pass|fail|error|total|tests?\b/i.test(l)).slice(-12);
      return this.structuredResponse(`Ran ${framework} tests (exit ${code}):`, {
        framework,
        exitCode: code,
        passed: code === 0,
        summary: summaryLines,
        outputTail: combined.split('\n').slice(-40).join('\n'),
      });
    } catch (error: any) {
      return this.createErrorResponse(`run_tests failed: ${error?.message || 'Unknown error'}`, []);
    }
  }

  private async handleCaptureSceneScreenshot(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    const err = this.checkProject(args.projectPath, args.scenePath);
    if (err) return err;
    try {
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) throw new Error('Could not find a valid Godot executable path');
      }
      const sceneRes = args.scenePath.startsWith('res://') ? args.scenePath : 'res://' + args.scenePath;
      const outRel = args.outputPath || 'screenshot.png';
      const outAbs = join(args.projectPath, outRel.replace(/^res:\/\//, ''));
      const waitFrames = typeof args.waitFrames === 'number' ? args.waitFrames : 5;
      // A tiny throwaway capture script written into the project temporarily.
      const outResRel = outRel.replace(/^res:\/\//, '');
      const capScript = [
        'extends SceneTree',
        'func _init():',
        `\tvar inst = load("${sceneRes}").instantiate()`,
        '\tget_root().add_child(inst)',
        `\tfor i in ${waitFrames}:`,
        '\t\tawait process_frame',
        '\tawait process_frame',
        '\tvar img = get_root().get_texture().get_image()',
        '\tif img == null:',
        '\t\tprinterr("Failed to capture viewport image (no rendering surface)")',
        '\t\tquit(1)',
        `\tvar e = img.save_png("res://${outResRel}")`,
        '\tif e != OK:',
        '\t\tprinterr("Failed to save PNG (error " + str(e) + ")")',
        '\t\tquit(1)',
        `\tprint("${RESULT_MARKER}" + JSON.stringify({"saved": "${outRel}"}))`,
        '\tquit(0)',
        '',
      ].join('\n');
      const tmpScript = join(args.projectPath, '.godot_mcp_capture.gd');
      writeFileSync(tmpScript, capScript, 'utf-8');
      try {
        const cmdArgs = ['--path', args.projectPath, '--rendering-driver', 'opengl3', '--script', 'res://.godot_mcp_capture.gd'];
        const { stdout, stderr, code } = await this.executeRaw(cmdArgs, 60000);
        if (code !== 0 || !existsSync(outAbs)) {
          return this.createErrorResponse(
            `Screenshot capture failed (headless rendering unavailable on this host). ${stderr.trim() || stdout.trim()}`,
            ['This feature needs a GPU/display or software rasterizer', 'Behavioral testing via run_scene_test works without rendering']
          );
        }
        const png = readFileSync(outAbs);
        return {
          content: [
            { type: 'text', text: `Captured screenshot of '${args.scenePath}' -> ${outRel}` },
            { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
          ],
        };
      } finally {
        try { if (existsSync(tmpScript)) unlinkSync(tmpScript); } catch { /* ignore */ }
      }
    } catch (error: any) {
      return this.createErrorResponse(`capture_scene_screenshot failed: ${error?.message || 'Unknown error'}`, []);
    }
  }

  // ----- Performance: single-boot multi-op -----

  private async handleBatch(args: any) {
    args = this.normalizeParameters(args);
    if (!Array.isArray(args.operations)) {
      return this.createErrorResponse('operations must be an array of {operation, params} objects', [
        'See the batch tool description for the list of batchable operations',
      ]);
    }
    const err = this.checkProject(args.projectPath);
    if (err) return err;
    // Pre-convert each op's params to snake_case here: executeOperation does not
    // recurse into array elements, so nested params would otherwise reach the
    // GDScript with camelCase keys it doesn't understand.
    const operations = args.operations.map((o: any) => ({
      operation: o.operation || o.op,
      params: this.convertCamelToSnakeCase(o.params || {}),
    }));
    const timeout = Math.max(OPERATION_TIMEOUT_MS, operations.length * 2000 + 15000);
    try {
      const { result, stderr, stdout } = await this.executeStructuredOperation(
        'batch',
        { operations, stopOnError: args.stopOnError !== false },
        args.projectPath,
        timeout
      );
      if (result === null) {
        const detail = (stderr && stderr.trim()) || (stdout && stdout.trim()) || 'unknown error';
        return this.createErrorResponse(`batch failed to run: ${detail}`, [
          'Ensure every operation name is batchable (see the batch tool description)',
        ]);
      }
      const okCount = Array.isArray(result.results) ? result.results.filter((r: any) => r.ok).length : 0;
      const verdict = result.all_ok ? '✅ all ok' : '❌ some failed';
      return this.structuredResponse(`batch: ${okCount}/${result.ran} operations ok — ${verdict}`, result);
    } catch (error: any) {
      return this.createErrorResponse(`batch failed: ${error?.message || 'Unknown error'}`, []);
    }
  }

  private async handleBuildScene(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.root) return this.missing('scenePath', 'root');
    const opParams: OperationParams = { scenePath: args.scenePath, root: args.root };
    if (args.signals) opParams.signals = args.signals;
    return this.dispatchOp('build_scene', args.projectPath, opParams,
      `Built scene '${args.scenePath}':`, [args.scenePath]);
  }

  // ----- Capability breadth -----

  private async handleFindNodes(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    const p: OperationParams = { scenePath: args.scenePath };
    if (args.type) p.type = args.type;
    if (args.group) p.group = args.group;
    if (args.namePattern) p.namePattern = args.namePattern;
    return this.dispatchOp('find_nodes', args.projectPath, p,
      `Matching nodes in '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleListClasses(args: any) {
    args = this.normalizeParameters(args);
    const p: OperationParams = {};
    if (args.filter) p.filter = args.filter;
    if (args.inherits) p.inherits = args.inherits;
    return this.dispatchOp('list_classes', args.projectPath, p, 'Classes:');
  }

  private async handlePathToUid(args: any) {
    args = this.normalizeParameters(args);
    if (!args.filePath) return this.missing('filePath');
    return this.dispatchOp('path_to_uid', args.projectPath, { filePath: args.filePath },
      `UID for '${args.filePath}':`, [args.filePath]);
  }

  private async handleFindBrokenReferences(args: any) {
    args = this.normalizeParameters(args);
    const p: OperationParams = {};
    if (args.directory) p.directory = args.directory;
    return this.dispatchOp('find_broken_references', args.projectPath, p,
      'Broken reference scan:', args.directory ? [args.directory] : []);
  }

  private async handleCreateAnimation(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.playerNode === undefined || !args.name || !args.tracks) {
      return this.missing('scenePath', 'playerNode', 'name', 'tracks');
    }
    const p: OperationParams = {
      scenePath: args.scenePath,
      playerNode: args.playerNode,
      name: args.name,
      tracks: args.tracks,
    };
    if (args.length !== undefined) p.length = args.length;
    if (args.loop !== undefined) p.loop = args.loop;
    if (args.library !== undefined) p.library = args.library;
    return this.dispatchOp('create_animation', args.projectPath, p,
      `Created animation '${args.name}':`, [args.scenePath]);
  }

  private async handleSetNodeProperties(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.properties) {
      return this.missing('scenePath', 'nodePath', 'properties');
    }
    return this.dispatchOp('set_node_properties', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, properties: args.properties },
      `Set properties on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleReorderNode(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || args.toIndex === undefined) {
      return this.missing('scenePath', 'nodePath', 'toIndex');
    }
    return this.dispatchOp('reorder_node', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, toIndex: args.toIndex },
      `Reordered '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleExportProject(args: any) {
    args = this.normalizeParameters(args);
    if (!args.presetName || !args.exportPath) return this.missing('presetName', 'exportPath');
    const err = this.checkProject(args.projectPath, args.exportPath);
    if (err) return err;
    try {
      if (!this.godotPath) {
        await this.detectGodotPath();
        if (!this.godotPath) throw new Error('Could not find a valid Godot executable path');
      }
      const flag = args.debugExport ? '--export-debug' : '--export-release';
      // Godot creates the output directory for the artifact, but not always; be lenient.
      const cmdArgs = ['--headless', '--path', args.projectPath, flag, args.presetName, args.exportPath];
      const { stdout, stderr, code } = await this.executeRaw(cmdArgs, 300000);
      const combined = `${stdout}\n${stderr}`;
      const ok = code === 0;
      return this.structuredResponse(
        `Export '${args.presetName}' ${ok ? 'succeeded' : 'FAILED'} (exit ${code}) -> ${args.exportPath}`,
        {
          preset: args.presetName,
          exportPath: args.exportPath,
          mode: args.debugExport ? 'debug' : 'release',
          exitCode: code,
          ok,
          outputTail: combined.split('\n').slice(-40).join('\n'),
        }
      );
    } catch (error: any) {
      return this.createErrorResponse(`export_project failed: ${error?.message || 'Unknown error'}`, [
        'Ensure the export preset exists in export_presets.cfg',
        'Install the matching export templates for this Godot version',
      ]);
    }
  }

  // =========================================================================
  // Inspection / analysis handlers (read-only, filesystem-based)
  // =========================================================================

  /** Recursively collect project-relative file paths, skipping hidden/.import dirs. */
  private listProjectFiles(projectPath: string, accept?: (rel: string) => boolean): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          const rel = full.substring(projectPath.length).replace(/^[/\\]/, '').replace(/\\/g, '/');
          if (!accept || accept(rel)) out.push(rel);
        }
      }
    };
    if (existsSync(projectPath)) walk(projectPath);
    return out;
  }

  /** Read a project file as UTF-8 text, skipping files larger than maxBytes. */
  private safeReadText(full: string, maxBytes = 4 * 1024 * 1024): string | null {
    try {
      if (statSync(full).size > maxBytes) return null;
      return readFileSync(full, 'utf-8');
    } catch {
      return null;
    }
  }

  /** Minimal INI/cfg parser for Godot .cfg files (export_presets.cfg, etc.). */
  private parseGodotCfg(text: string): Array<{ section: string; values: Record<string, string> }> {
    const sections: Array<{ section: string; values: Record<string, string> }> = [];
    let current: { section: string; values: Record<string, string> } | null = null;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith(';')) continue;
      const sec = line.match(/^\[(.+)\]$/);
      if (sec) {
        current = { section: sec[1], values: {} };
        sections.push(current);
        continue;
      }
      const eq = line.indexOf('=');
      if (eq !== -1 && current) {
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) val = val.slice(1, -1);
        current.values[key] = val;
      }
    }
    return sections;
  }

  private async handleGetFilesystemTree(args: any) {
    args = this.normalizeParameters(args);
    const err = this.checkProject(args.projectPath, args.subPath);
    if (err) return err;
    const base = args.subPath ? join(args.projectPath, args.subPath) : args.projectPath;
    if (!existsSync(base)) return this.createErrorResponse(`Path not found: ${args.subPath || '.'}`, []);
    const build = (dir: string): any => {
      const node: any = { name: basename(dir), type: 'directory', children: [] };
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return node; }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          node.children.push(build(full));
        } else {
          let size = 0;
          try { size = statSync(full).size; } catch { /* ignore */ }
          const dot = entry.name.lastIndexOf('.');
          node.children.push({ name: entry.name, type: 'file', ext: dot > 0 ? entry.name.slice(dot + 1) : '', size });
        }
      }
      return node;
    };
    return this.structuredResponse(`Filesystem tree for '${args.subPath || '.'}':`, build(base));
  }

  private async handleSearchFiles(args: any) {
    args = this.normalizeParameters(args);
    if (!args.pattern) return this.missing('pattern');
    const err = this.checkProject(args.projectPath);
    if (err) return err;
    const ext = args.extension ? String(args.extension).replace(/^\./, '').toLowerCase() : null;
    const limit = typeof args.maxResults === 'number' ? args.maxResults : 500;
    const pat = String(args.pattern);
    const isGlob = pat.includes('*') || pat.includes('?');
    let rx: RegExp | null = null;
    if (isGlob) {
      const escaped = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
      // Anchor so "*.gd" matches "player.gd" but not "player.gd.uid".
      rx = new RegExp('^' + escaped + '$', 'i');
    }
    const needle = pat.toLowerCase();
    const matches = this.listProjectFiles(args.projectPath, (rel) => {
      if (ext && !rel.toLowerCase().endsWith('.' + ext)) return false;
      return rx ? rx.test(rel) : rel.toLowerCase().includes(needle);
    });
    const truncated = matches.length > limit;
    return this.structuredResponse(
      `Found ${matches.length} file(s) matching '${pat}'${truncated ? ` (showing ${limit})` : ''}:`,
      { count: matches.length, files: matches.slice(0, limit) }
    );
  }

  private async handleSearchInFiles(args: any) {
    args = this.normalizeParameters(args);
    if (!args.query) return this.missing('query');
    const err = this.checkProject(args.projectPath);
    if (err) return err;
    const exts: string[] = (Array.isArray(args.extensions) && args.extensions.length
      ? args.extensions
      : ['gd', 'tscn', 'tres', 'cfg', 'godot', 'json', 'md', 'txt', 'cs', 'gdshader'])
      .map((e: string) => String(e).replace(/^\./, '').toLowerCase());
    const limit = typeof args.maxResults === 'number' ? args.maxResults : 200;
    const caseSensitive = !!args.caseSensitive;
    const query = caseSensitive ? String(args.query) : String(args.query).toLowerCase();
    const files = this.listProjectFiles(args.projectPath, (rel) => exts.some((e) => rel.toLowerCase().endsWith('.' + e)));
    const results: Array<{ file: string; line: number; text: string }> = [];
    for (const rel of files) {
      if (results.length >= limit) break;
      const text = this.safeReadText(join(args.projectPath, rel));
      if (text === null) continue;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const hay = caseSensitive ? lines[i] : lines[i].toLowerCase();
        if (hay.includes(query)) {
          results.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 300) });
          if (results.length >= limit) break;
        }
      }
    }
    return this.structuredResponse(`Found ${results.length} match(es) for '${args.query}':`, { count: results.length, matches: results });
  }

  private async handleGetProjectStatistics(args: any) {
    args = this.normalizeParameters(args);
    const err = this.checkProject(args.projectPath);
    if (err) return err;
    const files = this.listProjectFiles(args.projectPath);
    const byExt: Record<string, number> = {};
    let scriptLines = 0;
    let nodeInstances = 0;
    let sceneCount = 0;
    let scriptCount = 0;
    let resourceCount = 0;
    for (const rel of files) {
      const dot = rel.lastIndexOf('.');
      const ext = dot > 0 ? rel.slice(dot + 1).toLowerCase() : '(none)';
      byExt[ext] = (byExt[ext] || 0) + 1;
      if (ext === 'gd') {
        scriptCount++;
        const text = this.safeReadText(join(args.projectPath, rel));
        if (text !== null) scriptLines += text.split('\n').length;
      } else if (ext === 'tscn') {
        sceneCount++;
        const text = this.safeReadText(join(args.projectPath, rel));
        if (text !== null) nodeInstances += (text.match(/^\[node /gm) || []).length;
      } else if (ext === 'tres' || ext === 'res') {
        resourceCount++;
      }
    }
    let autoloads = 0;
    const projText = this.safeReadText(join(args.projectPath, 'project.godot'));
    if (projText) {
      const auto = projText.match(/^\[autoload\]([\s\S]*?)(\n\[|$)/m);
      if (auto) autoloads = (auto[1].match(/^[A-Za-z_]\w*=/gm) || []).length;
    }
    return this.structuredResponse('Project statistics:', {
      total_files: files.length,
      scene_count: sceneCount,
      script_count: scriptCount,
      resource_count: resourceCount,
      total_script_lines: scriptLines,
      total_node_instances: nodeInstances,
      autoloads,
      file_counts_by_extension: byExt,
    });
  }

  private async handleGetSceneFileContent(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    const err = this.checkProject(args.projectPath, args.scenePath);
    if (err) return err;
    const full = join(args.projectPath, args.scenePath.replace(/^res:\/\//, ''));
    if (!existsSync(full)) return this.createErrorResponse(`File not found: ${args.scenePath}`, []);
    const text = this.safeReadText(full);
    if (text === null) return this.createErrorResponse(`File too large or unreadable: ${args.scenePath}`, []);
    return { content: [{ type: 'text', text }] };
  }

  /** Scan project text files for lines matching any of the given needles. */
  private scanReferences(projectPath: string, needles: string[], exts: string[], limit = 500): Array<{ file: string; line: number; text: string }> {
    const files = this.listProjectFiles(projectPath, (rel) => exts.some((e) => rel.toLowerCase().endsWith('.' + e)));
    const out: Array<{ file: string; line: number; text: string }> = [];
    for (const rel of files) {
      if (out.length >= limit) break;
      const text = this.safeReadText(join(projectPath, rel));
      if (text === null) continue;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (needles.some((n) => n && lines[i].includes(n))) {
          out.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 300) });
          if (out.length >= limit) break;
        }
      }
    }
    return out;
  }

  private async handleFindScriptReferences(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scriptPath) return this.missing('scriptPath');
    const err = this.checkProject(args.projectPath, args.scriptPath);
    if (err) return err;
    const rel = String(args.scriptPath).replace(/^res:\/\//, '');
    const needles = [`res://${rel}`, rel, basename(rel)];
    const refs = this.scanReferences(args.projectPath, needles, ['tscn', 'tres', 'gd', 'godot']);
    // Exclude self-definition lines (the script file referencing its own name).
    const filtered = refs.filter((r) => r.file !== rel);
    return this.structuredResponse(`Found ${filtered.length} reference(s) to '${args.scriptPath}':`, {
      script: rel,
      reference_count: filtered.length,
      references: filtered,
    });
  }

  private async handleFindNodeReferences(args: any) {
    args = this.normalizeParameters(args);
    if (!args.nodeName) return this.missing('nodeName');
    const err = this.checkProject(args.projectPath);
    if (err) return err;
    const name = String(args.nodeName);
    const needles = [`get_node("${name}"`, `get_node('${name}'`, `$${name}`, `%${name}`, `"${name}"`, `'${name}'`];
    const refs = this.scanReferences(args.projectPath, needles, ['gd', 'cs']);
    return this.structuredResponse(`Found ${refs.length} reference(s) to node '${name}':`, {
      node: name,
      reference_count: refs.length,
      references: refs,
    });
  }

  private async handleFindUnusedResources(args: any) {
    args = this.normalizeParameters(args);
    const err = this.checkProject(args.projectPath);
    if (err) return err;
    const assetExts = ['png', 'jpg', 'jpeg', 'svg', 'webp', 'bmp', 'ogg', 'wav', 'mp3', 'tres', 'res', 'gltf', 'glb', 'obj', 'fbx', 'ttf', 'otf', 'theme', 'material', 'gdshader', 'shader'];
    const all = this.listProjectFiles(args.projectPath);
    const candidates = all.filter((rel) => {
      const dot = rel.lastIndexOf('.');
      return dot > 0 && assetExts.includes(rel.slice(dot + 1).toLowerCase());
    });
    // Build one big haystack from referencing files.
    const refFiles = all.filter((rel) => /\.(tscn|tres|godot|gd|cs|cfg)$/i.test(rel));
    let haystack = '';
    for (const rel of refFiles) {
      const text = this.safeReadText(join(args.projectPath, rel));
      if (text !== null) haystack += text + '\n';
    }
    const unused = candidates.filter((rel) => {
      const resPath = `res://${rel}`;
      const base = basename(rel);
      // Considered used if referenced by full res:// path or by basename (conservative).
      return !haystack.includes(resPath) && !haystack.includes(base);
    });
    return this.structuredResponse(`Found ${unused.length} potentially-unused resource(s) of ${candidates.length} scanned:`, {
      scanned_count: candidates.length,
      unused_count: unused.length,
      unused_resources: unused,
      note: 'Heuristic: dynamically-constructed paths (e.g. load(base_dir + name)) may cause false positives.',
    });
  }

  private async handleDetectCircularDependencies(args: any) {
    args = this.normalizeParameters(args);
    const err = this.checkProject(args.projectPath);
    if (err) return err;
    const scenes = this.listProjectFiles(args.projectPath, (rel) => rel.toLowerCase().endsWith('.tscn'));
    // Build scene -> [scene deps] graph from ext_resource PackedScene paths.
    const graph: Record<string, string[]> = {};
    for (const rel of scenes) {
      const text = this.safeReadText(join(args.projectPath, rel));
      const deps = new Set<string>();
      if (text !== null) {
        const re = /\[ext_resource[^\]]*path="res:\/\/([^"]+\.tscn)"/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          if (m[1] !== rel) deps.add(m[1]);
        }
      }
      graph[rel] = [...deps];
    }
    // DFS cycle detection.
    const cycles: string[][] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];
    const dfs = (node: string) => {
      if (visited.has(node)) return;
      visiting.add(node);
      stack.push(node);
      for (const next of graph[node] || []) {
        if (visiting.has(next)) {
          const idx = stack.indexOf(next);
          if (idx !== -1) cycles.push([...stack.slice(idx), next]);
        } else if (!visited.has(next)) {
          dfs(next);
        }
      }
      stack.pop();
      visiting.delete(node);
      visited.add(node);
    };
    for (const s of scenes) dfs(s);
    // Deduplicate cycles by normalized signature.
    const seen = new Set<string>();
    const unique = cycles.filter((c) => {
      const key = [...c].sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return this.structuredResponse(`Scanned ${scenes.length} scene(s); found ${unique.length} circular dependency chain(s).`, {
      has_circular: unique.length > 0,
      scenes_checked: scenes.length,
      circular_dependencies: unique,
    });
  }

  private async handleFindSignalConnections(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    const err = this.checkProject(args.projectPath, args.scenePath);
    if (err) return err;
    const full = join(args.projectPath, args.scenePath.replace(/^res:\/\//, ''));
    if (!existsSync(full)) return this.createErrorResponse(`Scene not found: ${args.scenePath}`, []);
    const text = this.safeReadText(full);
    if (text === null) return this.createErrorResponse(`Scene unreadable: ${args.scenePath}`, []);
    const connections: Array<Record<string, string>> = [];
    const re = /\[connection ([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const attrs: Record<string, string> = {};
      const ar = /(\w+)="([^"]*)"/g;
      let a: RegExpExecArray | null;
      while ((a = ar.exec(m[1])) !== null) attrs[a[1]] = a[2];
      connections.push(attrs);
    }
    return this.structuredResponse(`Found ${connections.length} signal connection(s) in '${args.scenePath}':`, {
      scene: args.scenePath.replace(/^res:\/\//, ''),
      count: connections.length,
      connections,
    });
  }

  private async handleListExportPresets(args: any) {
    args = this.normalizeParameters(args);
    const err = this.checkProject(args.projectPath);
    if (err) return err;
    const cfg = join(args.projectPath, 'export_presets.cfg');
    if (!existsSync(cfg)) {
      return this.structuredResponse('No export_presets.cfg found (no export presets configured).', { count: 0, presets: [] });
    }
    const text = this.safeReadText(cfg) || '';
    const sections = this.parseGodotCfg(text);
    const presets = sections
      .filter((s) => /^preset\.\d+$/.test(s.section))
      .map((s) => ({
        name: s.values.name || '',
        platform: s.values.platform || '',
        runnable: s.values.runnable === 'true',
        export_path: s.values.export_path || '',
      }));
    return this.structuredResponse(`Found ${presets.length} export preset(s):`, { count: presets.length, presets });
  }

  private async handleGetExportInfo(args: any) {
    args = this.normalizeParameters(args);
    if (!args.presetName) return this.missing('presetName');
    const err = this.checkProject(args.projectPath);
    if (err) return err;
    const cfg = join(args.projectPath, 'export_presets.cfg');
    if (!existsSync(cfg)) return this.createErrorResponse('No export_presets.cfg found.', []);
    const text = this.safeReadText(cfg) || '';
    const sections = this.parseGodotCfg(text);
    // A preset's options live in the section immediately following its header.
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (/^preset\.\d+$/.test(s.section) && s.values.name === args.presetName) {
        const options = sections[i + 1] && /\.options$/.test(sections[i + 1].section) ? sections[i + 1].values : {};
        return this.structuredResponse(`Export preset '${args.presetName}':`, { preset: s.values, options });
      }
    }
    return this.createErrorResponse(`Export preset not found: ${args.presetName}`, ['Use list_export_presets to see available presets']);
  }

  private async handleReadResource(args: any) {
    args = this.normalizeParameters(args);
    if (!args.resourcePath) return this.missing('resourcePath');
    const err = this.checkProject(args.projectPath, args.resourcePath);
    if (err) return err;
    const rel = String(args.resourcePath).replace(/^res:\/\//, '');
    const full = join(args.projectPath, rel);
    if (!existsSync(full)) return this.createErrorResponse(`Resource not found: ${args.resourcePath}`, []);
    const textExts = ['tres', 'tscn', 'gd', 'gdshader', 'shader', 'cfg', 'godot', 'json', 'import'];
    const dot = rel.lastIndexOf('.');
    const ext = dot > 0 ? rel.slice(dot + 1).toLowerCase() : '';
    if (textExts.includes(ext)) {
      const text = this.safeReadText(full);
      if (text === null) return this.createErrorResponse(`Resource too large or unreadable: ${args.resourcePath}`, []);
      return { content: [{ type: 'text', text }] };
    }
    let size = 0;
    try { size = statSync(full).size; } catch { /* ignore */ }
    return this.structuredResponse(`Binary resource '${rel}':`, { path: rel, type: ext || 'unknown', size, note: 'Binary resource — content not shown.' });
  }

  // ----- Inspection / analysis (engine-backed) -----

  private async handleAnalyzeSceneComplexity(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    return this.dispatchOp('analyze_scene_complexity', args.projectPath, { scenePath: args.scenePath },
      `Complexity of '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleAnalyzeSignalFlow(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    return this.dispatchOp('analyze_signal_flow', args.projectPath, { scenePath: args.scenePath },
      `Signal flow of '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleGetProjectSettings(args: any) {
    args = this.normalizeParameters(args);
    return this.dispatchOp('get_project_settings', args.projectPath, { filter: args.filter || '' },
      'Project settings:');
  }

  private async handleGetSceneExports(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    return this.dispatchOp('get_scene_exports', args.projectPath, { scenePath: args.scenePath },
      `Exports of '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleGetNodeGroups(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    return this.dispatchOp('get_node_groups', args.projectPath, { scenePath: args.scenePath, nodePath: args.nodePath },
      `Groups of '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleFindNodesByType(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.type) return this.missing('scenePath', 'type');
    return this.dispatchOp('find_nodes_by_type', args.projectPath, { scenePath: args.scenePath, type: args.type },
      `Nodes of type '${args.type}' in '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleFindNodesInGroup(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.group) return this.missing('scenePath', 'group');
    return this.dispatchOp('find_nodes_in_group', args.projectPath, { scenePath: args.scenePath, group: args.group },
      `Nodes in group '${args.group}' in '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleGetInputActions(args: any) {
    args = this.normalizeParameters(args);
    return this.dispatchOp('get_input_actions', args.projectPath, { includeBuiltin: !!args.includeBuiltin },
      'Input actions:');
  }

  // ----- TileMap (TileMapLayer / legacy TileMap) -----

  private async handleTilemapSetCell(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || args.x === undefined || args.y === undefined) {
      return this.missing('scenePath', 'nodePath', 'x', 'y');
    }
    return this.dispatchOp('tilemap_set_cell', args.projectPath,
      {
        scenePath: args.scenePath, nodePath: args.nodePath,
        x: args.x, y: args.y,
        sourceId: args.sourceId === undefined ? -1 : args.sourceId,
        atlasCoords: args.atlasCoords || [0, 0],
        alternative: args.alternative === undefined ? 0 : args.alternative,
      },
      `Set cell (${args.x},${args.y}) on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleTilemapFillRect(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined ||
        args.x === undefined || args.y === undefined || args.w === undefined || args.h === undefined) {
      return this.missing('scenePath', 'nodePath', 'x', 'y', 'w', 'h');
    }
    return this.dispatchOp('tilemap_fill_rect', args.projectPath,
      {
        scenePath: args.scenePath, nodePath: args.nodePath,
        x: args.x, y: args.y, w: args.w, h: args.h,
        sourceId: args.sourceId === undefined ? -1 : args.sourceId,
        atlasCoords: args.atlasCoords || [0, 0],
        alternative: args.alternative === undefined ? 0 : args.alternative,
      },
      `Filled ${args.w}x${args.h} rectangle at (${args.x},${args.y}) on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleTilemapGetCell(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || args.x === undefined || args.y === undefined) {
      return this.missing('scenePath', 'nodePath', 'x', 'y');
    }
    return this.dispatchOp('tilemap_get_cell', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, x: args.x, y: args.y },
      `Cell (${args.x},${args.y}) of '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleTilemapClear(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    return this.dispatchOp('tilemap_clear', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath },
      `Cleared '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleTilemapGetInfo(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    return this.dispatchOp('tilemap_get_info', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath },
      `TileMap info for '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleTilemapGetUsedCells(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    return this.dispatchOp('tilemap_get_used_cells', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath },
      `Used cells of '${args.nodePath}':`, [args.scenePath]);
  }

  // ----- Animation (AnimationPlayer) -----

  private async handleListAnimations(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    return this.dispatchOp('list_animations', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath },
      `Animations on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleAddAnimationTrack(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.animation || !args.trackPath) {
      return this.missing('scenePath', 'nodePath', 'animation', 'trackPath');
    }
    return this.dispatchOp('add_animation_track', args.projectPath,
      {
        scenePath: args.scenePath, nodePath: args.nodePath,
        animation: args.animation, trackPath: args.trackPath,
        trackType: args.trackType || 'value',
      },
      `Added track to animation '${args.animation}':`, [args.scenePath]);
  }

  private async handleSetAnimationKeyframe(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.animation || args.time === undefined) {
      return this.missing('scenePath', 'nodePath', 'animation', 'time');
    }
    if (args.trackIndex === undefined && !args.trackPath) return this.missing('trackIndex', 'trackPath');
    const p: OperationParams = {
      scenePath: args.scenePath, nodePath: args.nodePath,
      animation: args.animation, time: args.time, value: args.value,
    };
    if (args.trackIndex !== undefined) p.trackIndex = args.trackIndex;
    if (args.trackPath !== undefined) p.trackPath = args.trackPath;
    if (args.easing !== undefined) p.easing = args.easing;
    return this.dispatchOp('set_animation_keyframe', args.projectPath, p,
      `Inserted key in animation '${args.animation}':`, [args.scenePath]);
  }

  private async handleGetAnimationInfo(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.animation) {
      return this.missing('scenePath', 'nodePath', 'animation');
    }
    return this.dispatchOp('get_animation_info', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, animation: args.animation },
      `Animation info for '${args.animation}':`, [args.scenePath]);
  }

  private async handleRemoveAnimation(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.animation) {
      return this.missing('scenePath', 'nodePath', 'animation');
    }
    return this.dispatchOp('remove_animation', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, animation: args.animation },
      `Removed animation '${args.animation}':`, [args.scenePath]);
  }

  // ----- AnimationTree -----

  private async handleCreateAnimationTree(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    const p: OperationParams = {
      scenePath: args.scenePath, nodePath: args.nodePath,
      rootType: args.rootType || 'state_machine',
    };
    if (args.parentPath !== undefined) p.parentPath = args.parentPath;
    if (args.animPlayer !== undefined) p.animPlayer = args.animPlayer;
    return this.dispatchOp('create_animation_tree', args.projectPath, p,
      `Created AnimationTree '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleGetAnimationTreeStructure(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    return this.dispatchOp('get_animation_tree_structure', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath },
      `AnimationTree structure for '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleAddStateMachineState(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.stateName) {
      return this.missing('scenePath', 'nodePath', 'stateName');
    }
    const p: OperationParams = {
      scenePath: args.scenePath, nodePath: args.nodePath,
      stateName: args.stateName, stateType: args.stateType || 'animation',
      position: args.position || [0, 0],
    };
    if (args.animation !== undefined) p.animation = args.animation;
    return this.dispatchOp('add_state_machine_state', args.projectPath, p,
      `Added state '${args.stateName}':`, [args.scenePath]);
  }

  private async handleRemoveStateMachineState(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.stateName) {
      return this.missing('scenePath', 'nodePath', 'stateName');
    }
    return this.dispatchOp('remove_state_machine_state', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, stateName: args.stateName },
      `Removed state '${args.stateName}':`, [args.scenePath]);
  }

  private async handleAddStateMachineTransition(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.from || !args.to) {
      return this.missing('scenePath', 'nodePath', 'from', 'to');
    }
    const p: OperationParams = {
      scenePath: args.scenePath, nodePath: args.nodePath,
      from: args.from, to: args.to,
      switchMode: args.switchMode || 'immediate',
      advanceMode: args.advanceMode || 'enabled',
    };
    if (args.advanceExpression !== undefined) p.advanceExpression = args.advanceExpression;
    return this.dispatchOp('add_state_machine_transition', args.projectPath, p,
      `Added transition '${args.from}' -> '${args.to}':`, [args.scenePath]);
  }

  private async handleRemoveStateMachineTransition(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.from || !args.to) {
      return this.missing('scenePath', 'nodePath', 'from', 'to');
    }
    return this.dispatchOp('remove_state_machine_transition', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, from: args.from, to: args.to },
      `Removed transition '${args.from}' -> '${args.to}':`, [args.scenePath]);
  }

  private async handleSetBlendTreeNode(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.btNodeName || !args.btNodeType) {
      return this.missing('scenePath', 'nodePath', 'btNodeName', 'btNodeType');
    }
    return this.dispatchOp('set_blend_tree_node', args.projectPath,
      {
        scenePath: args.scenePath, nodePath: args.nodePath,
        btNodeName: args.btNodeName, btNodeType: args.btNodeType,
        position: args.position || [0, 0],
      },
      `Set blend tree node '${args.btNodeName}':`, [args.scenePath]);
  }

  private async handleSetTreeParameter(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.parameter || args.value === undefined) {
      return this.missing('scenePath', 'nodePath', 'parameter', 'value');
    }
    return this.dispatchOp('set_tree_parameter', args.projectPath,
      {
        scenePath: args.scenePath, nodePath: args.nodePath,
        parameter: args.parameter, value: args.value,
      },
      `Set parameter '${args.parameter}':`, [args.scenePath]);
  }

  // ----- Audio (AudioServer buses + AudioStreamPlayer nodes) -----

  private async handleAddAudioBus(args: any) {
    args = this.normalizeParameters(args);
    if (!args.name) return this.missing('name');
    return this.dispatchOp('add_audio_bus', args.projectPath,
      { name: args.name, sendBus: args.sendBus || 'Master' },
      `Added audio bus '${args.name}':`);
  }

  private async handleSetAudioBus(args: any) {
    args = this.normalizeParameters(args);
    if (args.busName === undefined && args.busIndex === undefined) {
      return this.missing('busName', 'busIndex');
    }
    const opParams: OperationParams = {};
    if (args.busName !== undefined) opParams.busName = args.busName;
    if (args.busIndex !== undefined) opParams.busIndex = args.busIndex;
    if (args.volumeDb !== undefined) opParams.volumeDb = args.volumeDb;
    if (args.solo !== undefined) opParams.solo = args.solo;
    if (args.mute !== undefined) opParams.mute = args.mute;
    if (args.bypassEffects !== undefined) opParams.bypassEffects = args.bypassEffects;
    if (args.send !== undefined) opParams.send = args.send;
    const busLabel = args.busName !== undefined ? args.busName : `#${args.busIndex}`;
    return this.dispatchOp('set_audio_bus', args.projectPath, opParams,
      `Updated audio bus '${busLabel}':`);
  }

  private async handleAddAudioBusEffect(args: any) {
    args = this.normalizeParameters(args);
    if (!args.effectType) return this.missing('effectType');
    if (args.busName === undefined && args.busIndex === undefined) {
      return this.missing('busName', 'busIndex');
    }
    const opParams: OperationParams = { effectType: args.effectType };
    if (args.busName !== undefined) opParams.busName = args.busName;
    if (args.busIndex !== undefined) opParams.busIndex = args.busIndex;
    if (args.volumeDb !== undefined) opParams.volumeDb = args.volumeDb;
    if (args.cutoffHz !== undefined) opParams.cutoffHz = args.cutoffHz;
    if (args.wet !== undefined) opParams.wet = args.wet;
    if (args.dry !== undefined) opParams.dry = args.dry;
    return this.dispatchOp('add_audio_bus_effect', args.projectPath, opParams,
      `Added '${args.effectType}' effect:`);
  }

  private async handleGetAudioBusLayout(args: any) {
    args = this.normalizeParameters(args);
    return this.dispatchOp('get_audio_bus_layout', args.projectPath, {},
      `Audio bus layout:`);
  }

  private async handleAddAudioPlayer(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.name) return this.missing('scenePath', 'name');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      parentPath: args.parentPath === undefined ? '' : args.parentPath,
      name: args.name,
      bus: args.bus || 'Master',
      is3d: !!args.is3d,
      is2d: !!args.is2d,
    };
    if (args.stream !== undefined) opParams.stream = args.stream;
    if (args.volumeDb !== undefined) opParams.volumeDb = args.volumeDb;
    if (args.autoplay !== undefined) opParams.autoplay = args.autoplay;
    return this.dispatchOp('add_audio_player', args.projectPath, opParams,
      `Added audio player '${args.name}':`, [args.scenePath]);
  }

  private async handleGetAudioInfo(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    return this.dispatchOp('get_audio_info', args.projectPath,
      { scenePath: args.scenePath },
      `Audio nodes in scene:`, [args.scenePath]);
  }

  // ----- Shaders -----

  private async handleCreateShader(args: any) {
    args = this.normalizeParameters(args);
    if (!args.path) return this.missing('path');
    if (!args.path.toLowerCase().endsWith('.gdshader')) {
      return this.createErrorResponse(`Shader path must end with .gdshader: ${args.path}`, ['Use a project-relative path ending in .gdshader']);
    }
    const err = this.checkProject(args.projectPath, args.path);
    if (err) return err;
    try {
      const full = join(args.projectPath, args.path);
      if (existsSync(full)) {
        return this.createErrorResponse(`Shader already exists: ${args.path}`, ['Use edit_shader to modify an existing shader']);
      }
      const shaderType = args.shaderType || 'canvas_item';
      const validTypes = ['spatial', 'canvas_item', 'particles', 'sky', 'fog'];
      if (!validTypes.includes(shaderType)) {
        return this.createErrorResponse(`Invalid shaderType: ${shaderType}`, [`Use one of: ${validTypes.join(', ')}`]);
      }
      const content = args.content ? args.content : this.shaderTemplate(shaderType);
      const dir = dirname(full);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(full, content, 'utf-8');
      return this.structuredResponse(`Created shader '${args.path}'.`, { path: args.path, shaderType, bytes: content.length });
    } catch (error: any) {
      return this.createErrorResponse(`Failed to create shader: ${error?.message || 'Unknown error'}`, []);
    }
  }

  private shaderTemplate(shaderType: string): string {
    switch (shaderType) {
      case 'spatial':
        return `shader_type spatial;\n\nvoid fragment() {\n\tALBEDO = vec3(1.0);\n}\n`;
      case 'particles':
        return `shader_type particles;\n\nvoid process() {\n}\n`;
      case 'sky':
        return `shader_type sky;\n\nvoid sky() {\n\tCOLOR = vec3(0.0);\n}\n`;
      case 'fog':
        return `shader_type fog;\n\nvoid fog() {\n\tDENSITY = 0.0;\n}\n`;
      case 'canvas_item':
      default:
        return `shader_type canvas_item;\n\nvoid fragment() {\n\tCOLOR = texture(TEXTURE, UV);\n}\n`;
    }
  }

  private async handleReadShader(args: any) {
    args = this.normalizeParameters(args);
    if (!args.path) return this.missing('path');
    const err = this.checkProject(args.projectPath, args.path);
    if (err) return err;
    try {
      const full = join(args.projectPath, args.path);
      if (!existsSync(full)) return this.createErrorResponse(`Shader not found: ${args.path}`, []);
      const content = readFileSync(full, 'utf-8');
      return { content: [{ type: 'text', text: content }] };
    } catch (error: any) {
      return this.createErrorResponse(`Failed to read shader: ${error?.message || 'Unknown error'}`, []);
    }
  }

  private async handleEditShader(args: any) {
    args = this.normalizeParameters(args);
    if (!args.path || args.content === undefined) return this.missing('path', 'content');
    const err = this.checkProject(args.projectPath, args.path);
    if (err) return err;
    try {
      const full = join(args.projectPath, args.path);
      if (!existsSync(full)) return this.createErrorResponse(`Shader not found: ${args.path}`, ['Use create_shader to create a new shader']);
      writeFileSync(full, args.content, 'utf-8');
      return this.structuredResponse(`Updated shader '${args.path}'.`, { path: args.path, bytes: args.content.length });
    } catch (error: any) {
      return this.createErrorResponse(`Failed to edit shader: ${error?.message || 'Unknown error'}`, []);
    }
  }

  private async handleAssignShaderMaterial(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.shaderPath) {
      return this.missing('scenePath', 'nodePath', 'shaderPath');
    }
    return this.dispatchOp('assign_shader_material', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, shaderPath: args.shaderPath },
      `Assigned shader material to '${args.nodePath}':`, [args.scenePath, args.shaderPath]);
  }

  private async handleSetShaderParam(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.param || args.value === undefined) {
      return this.missing('scenePath', 'nodePath', 'param', 'value');
    }
    return this.dispatchOp('set_shader_param', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, param: args.param, value: args.value },
      `Set shader param '${args.param}' on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleGetShaderParams(args: any) {
    args = this.normalizeParameters(args);
    if (!args.shaderPath && !(args.scenePath && args.nodePath !== undefined)) {
      return this.createErrorResponse('Provide either shaderPath, or scenePath and nodePath', [
        'Pass shaderPath to inspect a shader directly',
        'Pass scenePath and nodePath to inspect a node\'s ShaderMaterial',
      ]);
    }
    const opParams: OperationParams = {};
    const extraPaths: string[] = [];
    if (args.shaderPath) { opParams.shaderPath = args.shaderPath; extraPaths.push(args.shaderPath); }
    if (args.scenePath) { opParams.scenePath = args.scenePath; extraPaths.push(args.scenePath); }
    if (args.nodePath !== undefined) opParams.nodePath = args.nodePath;
    return this.dispatchOp('get_shader_params', args.projectPath, opParams,
      `Shader uniforms:`, extraPaths);
  }

  // ----- Themes -----

  private async handleCreateTheme(args: any) {
    args = this.normalizeParameters(args);
    if (!args.path) return this.missing('path');
    return this.dispatchOp('create_theme', args.projectPath, { path: args.path },
      `Created theme '${args.path}':`, [args.path]);
  }

  private async handleSetThemeColor(args: any) {
    args = this.normalizeParameters(args);
    if (!args.themePath || !args.name || !args.themeType || args.color === undefined) {
      return this.missing('themePath', 'name', 'themeType', 'color');
    }
    return this.dispatchOp('set_theme_color', args.projectPath,
      { themePath: args.themePath, name: args.name, themeType: args.themeType, color: args.color },
      `Set theme color '${args.name}' (${args.themeType}):`, [args.themePath]);
  }

  private async handleSetThemeConstant(args: any) {
    args = this.normalizeParameters(args);
    if (!args.themePath || !args.name || !args.themeType || args.value === undefined) {
      return this.missing('themePath', 'name', 'themeType', 'value');
    }
    return this.dispatchOp('set_theme_constant', args.projectPath,
      { themePath: args.themePath, name: args.name, themeType: args.themeType, value: args.value },
      `Set theme constant '${args.name}' (${args.themeType}):`, [args.themePath]);
  }

  private async handleSetThemeFontSize(args: any) {
    args = this.normalizeParameters(args);
    if (!args.themePath || !args.name || !args.themeType || args.size === undefined) {
      return this.missing('themePath', 'name', 'themeType', 'size');
    }
    return this.dispatchOp('set_theme_font_size', args.projectPath,
      { themePath: args.themePath, name: args.name, themeType: args.themeType, size: args.size },
      `Set theme font size '${args.name}' (${args.themeType}):`, [args.themePath]);
  }

  private async handleSetThemeStylebox(args: any) {
    args = this.normalizeParameters(args);
    if (!args.themePath || !args.name || !args.themeType) {
      return this.missing('themePath', 'name', 'themeType');
    }
    const opParams: OperationParams = {
      themePath: args.themePath,
      name: args.name,
      themeType: args.themeType,
      styleboxType: args.styleboxType || 'flat',
    };
    if (args.properties !== undefined) opParams.properties = args.properties;
    return this.dispatchOp('set_theme_stylebox', args.projectPath, opParams,
      `Set theme stylebox '${args.name}' (${args.themeType}):`, [args.themePath]);
  }

  private async handleGetThemeInfo(args: any) {
    args = this.normalizeParameters(args);
    if (!args.themePath) return this.missing('themePath');
    return this.dispatchOp('get_theme_info', args.projectPath, { themePath: args.themePath },
      `Theme info for '${args.themePath}':`, [args.themePath]);
  }

  // ----- Control layout -----

  private async handleSetupControl(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    if (!args.anchorPreset && args.hSizeFlags === undefined && args.vSizeFlags === undefined) {
      return this.createErrorResponse('Provide at least one of anchorPreset, hSizeFlags, vSizeFlags', [
        'Pass anchorPreset (e.g. full_rect) and/or hSizeFlags/vSizeFlags',
      ]);
    }
    const opParams: OperationParams = { scenePath: args.scenePath, nodePath: args.nodePath };
    if (args.anchorPreset !== undefined) opParams.anchorPreset = args.anchorPreset;
    if (args.hSizeFlags !== undefined) opParams.hSizeFlags = args.hSizeFlags;
    if (args.vSizeFlags !== undefined) opParams.vSizeFlags = args.vSizeFlags;
    return this.dispatchOp('setup_control', args.projectPath, opParams,
      `Configured Control '${args.nodePath}':`, [args.scenePath]);
  }

  // ----- Particles -----

  private async handleCreateParticles(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.name) return this.missing('scenePath', 'name');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      parentPath: args.parentPath === undefined ? '' : args.parentPath,
      name: args.name,
      is3d: !!args.is3d,
    };
    if (args.amount !== undefined) opParams.amount = args.amount;
    if (args.lifetime !== undefined) opParams.lifetime = args.lifetime;
    if (args.oneShot !== undefined) opParams.oneShot = args.oneShot;
    if (args.emissionShape !== undefined) opParams.emissionShape = args.emissionShape;
    return this.dispatchOp('create_particles', args.projectPath, opParams,
      `Created particles '${args.name}':`, [args.scenePath]);
  }

  private async handleSetParticleMaterial(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    const opParams: OperationParams = { scenePath: args.scenePath, nodePath: args.nodePath };
    const keys = ['amount', 'lifetime', 'oneShot', 'emitting', 'explosiveness', 'randomness',
      'direction', 'spread', 'initialVelocityMin', 'initialVelocityMax', 'gravity',
      'scaleMin', 'scaleMax', 'color', 'angularVelocityMin', 'angularVelocityMax',
      'orbitVelocityMin', 'orbitVelocityMax', 'dampingMin', 'dampingMax'];
    for (const k of keys) {
      if (args[k] !== undefined) opParams[k] = args[k];
    }
    return this.dispatchOp('set_particle_material', args.projectPath, opParams,
      `Updated particle material on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleSetParticleColorGradient(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.stops) {
      return this.missing('scenePath', 'nodePath', 'stops');
    }
    return this.dispatchOp('set_particle_color_gradient', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, stops: args.stops },
      `Set particle color gradient on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleApplyParticlePreset(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.preset) {
      return this.missing('scenePath', 'nodePath', 'preset');
    }
    return this.dispatchOp('apply_particle_preset', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, preset: args.preset },
      `Applied particle preset '${args.preset}' to '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleGetParticleInfo(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    return this.dispatchOp('get_particle_info', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath },
      `Particle info for '${args.nodePath}':`, [args.scenePath]);
  }

  // ----- Physics -----

  private async handleSetupPhysicsBody(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    const opParams: OperationParams = { scenePath: args.scenePath, nodePath: args.nodePath };
    const keys = ['collisionLayer', 'collisionMask', 'motionMode', 'mass', 'gravityScale',
      'linearDamp', 'angularDamp', 'freeze', 'freezeMode', 'contactMonitor', 'maxContactsReported'];
    for (const k of keys) {
      if (args[k] !== undefined) opParams[k] = args[k];
    }
    return this.dispatchOp('setup_physics_body', args.projectPath, opParams,
      `Configured physics body '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleSetupCollision(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.shapeType) {
      return this.missing('scenePath', 'nodePath', 'shapeType');
    }
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      nodePath: args.nodePath,
      shapeType: args.shapeType,
      dimension: args.dimension || '2d',
    };
    if (args.size !== undefined) opParams.size = args.size;
    if (args.radius !== undefined) opParams.radius = args.radius;
    if (args.height !== undefined) opParams.height = args.height;
    if (args.points !== undefined) opParams.points = args.points;
    if (args.oneWayCollision !== undefined) opParams.oneWayCollision = args.oneWayCollision;
    if (args.disabled !== undefined) opParams.disabled = args.disabled;
    return this.dispatchOp('setup_collision', args.projectPath, opParams,
      `Added collision shape to '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleSetPhysicsLayers(args: any) {
    args = this.normalizeParameters(args);
    if (!args.names) return this.missing('names');
    return this.dispatchOp('set_physics_layers', args.projectPath,
      { dimension: args.dimension || '2d', names: args.names },
      `Set physics layer names:`, []);
  }

  private async handleGetPhysicsLayers(args: any) {
    args = this.normalizeParameters(args);
    return this.dispatchOp('get_physics_layers', args.projectPath, {},
      `Physics layer names:`, []);
  }

  private async handleAddRaycast(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.name) return this.missing('scenePath', 'name');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      parentPath: args.parentPath === undefined ? '' : args.parentPath,
      name: args.name,
      dimension: args.dimension || '2d',
    };
    if (args.targetPosition !== undefined) opParams.targetPosition = args.targetPosition;
    if (args.collisionMask !== undefined) opParams.collisionMask = args.collisionMask;
    if (args.enabled !== undefined) opParams.enabled = args.enabled;
    return this.dispatchOp('add_raycast', args.projectPath, opParams,
      `Added raycast '${args.name}':`, [args.scenePath]);
  }

  private async handleGetCollisionInfo(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    return this.dispatchOp('get_collision_info', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath },
      `Collision info for '${args.nodePath}':`, [args.scenePath]);
  }

  // ----- Navigation -----

  private async handleSetupNavigationRegion(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.name) return this.missing('scenePath', 'name');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      parentPath: args.parentPath === undefined ? '' : args.parentPath,
      name: args.name,
      dimension: args.dimension || '2d',
    };
    if (args.navigationLayers !== undefined) opParams.navigationLayers = args.navigationLayers;
    return this.dispatchOp('setup_navigation_region', args.projectPath, opParams,
      `Added navigation region '${args.name}':`, [args.scenePath]);
  }

  private async handleBakeNavigationMesh(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    const opParams: OperationParams = { scenePath: args.scenePath, nodePath: args.nodePath };
    if (args.outlineVertices !== undefined) opParams.outlineVertices = args.outlineVertices;
    return this.dispatchOp('bake_navigation_mesh', args.projectPath, opParams,
      `Baked navigation mesh on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleSetupNavigationAgent(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.name) return this.missing('scenePath', 'name');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      parentPath: args.parentPath === undefined ? '' : args.parentPath,
      name: args.name,
      dimension: args.dimension || '2d',
    };
    const keys = ['radius', 'maxSpeed', 'pathDesiredDistance', 'targetDesiredDistance',
      'avoidanceEnabled', 'navigationLayers'];
    for (const k of keys) {
      if (args[k] !== undefined) opParams[k] = args[k];
    }
    return this.dispatchOp('setup_navigation_agent', args.projectPath, opParams,
      `Added navigation agent '${args.name}':`, [args.scenePath]);
  }

  private async handleSetNavigationLayers(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || args.navigationLayers === undefined) {
      return this.missing('scenePath', 'nodePath', 'navigationLayers');
    }
    return this.dispatchOp('set_navigation_layers', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, navigationLayers: args.navigationLayers },
      `Set navigation layers on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleGetNavigationInfo(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    return this.dispatchOp('get_navigation_info', args.projectPath,
      { scenePath: args.scenePath },
      `Navigation info for scene:`, [args.scenePath]);
  }

  // ----- 3D -----

  private async handleAddMeshInstance(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.name) return this.missing('scenePath', 'name');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      parentPath: args.parentPath === undefined ? '' : args.parentPath,
      name: args.name,
      meshType: args.meshType || 'box',
    };
    if (args.size !== undefined) opParams.size = args.size;
    if (args.radius !== undefined) opParams.radius = args.radius;
    if (args.height !== undefined) opParams.height = args.height;
    return this.dispatchOp('add_mesh_instance', args.projectPath, opParams,
      `Added mesh instance '${args.name}':`, [args.scenePath]);
  }

  private async handleSetupLighting(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      parentPath: args.parentPath === undefined ? '' : args.parentPath,
      lightType: args.lightType || 'directional',
    };
    if (args.name !== undefined) opParams.name = args.name;
    if (args.preset !== undefined) opParams.preset = args.preset;
    if (args.energy !== undefined) opParams.energy = args.energy;
    if (args.color !== undefined) opParams.color = args.color;
    return this.dispatchOp('setup_lighting', args.projectPath, opParams,
      `Added light:`, [args.scenePath]);
  }

  private async handleSetMaterial3d(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined) return this.missing('scenePath', 'nodePath');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      nodePath: args.nodePath,
      surfaceIndex: args.surfaceIndex === undefined ? 0 : args.surfaceIndex,
    };
    if (args.albedoColor !== undefined) opParams.albedoColor = args.albedoColor;
    if (args.metallic !== undefined) opParams.metallic = args.metallic;
    if (args.roughness !== undefined) opParams.roughness = args.roughness;
    return this.dispatchOp('set_material_3d', args.projectPath, opParams,
      `Applied material to '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleSetupEnvironment(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      parentPath: args.parentPath === undefined ? '' : args.parentPath,
      name: args.name || 'WorldEnvironment',
      backgroundMode: args.backgroundMode || 'sky',
    };
    if (args.features !== undefined) opParams.features = args.features;
    if (args.clearColor !== undefined) opParams.clearColor = args.clearColor;
    return this.dispatchOp('setup_environment', args.projectPath, opParams,
      `Added world environment:`, [args.scenePath]);
  }

  private async handleSetupCamera3d(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      parentPath: args.parentPath === undefined ? '' : args.parentPath,
      name: args.name || 'Camera3D',
      projection: args.projection || 'perspective',
    };
    if (args.fov !== undefined) opParams.fov = args.fov;
    if (args.position !== undefined) opParams.position = args.position;
    if (args.current !== undefined) opParams.current = args.current;
    return this.dispatchOp('setup_camera_3d', args.projectPath, opParams,
      `Added camera:`, [args.scenePath]);
  }

  private async handleAddGridmap(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.name) return this.missing('scenePath', 'name');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      parentPath: args.parentPath === undefined ? '' : args.parentPath,
      name: args.name,
    };
    if (args.meshLibrary !== undefined) opParams.meshLibrary = args.meshLibrary;
    if (args.cellSize !== undefined) opParams.cellSize = args.cellSize;
    return this.dispatchOp('add_gridmap', args.projectPath, opParams,
      `Added gridmap '${args.name}':`, [args.scenePath]);
  }

  // --- Node / script / batch / uid toolset ---------------------------------

  // Convenience alias of set_node_property.
  private async handleUpdateProperty(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.property || args.value === undefined) {
      return this.missing('scenePath', 'nodePath', 'property', 'value');
    }
    return this.dispatchOp('set_node_property', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, property: args.property, value: args.value },
      `Set '${args.property}' on '${args.nodePath}':`, [args.scenePath]);
  }

  // Alias of check_script: delegate to the same parse-check logic.
  private async handleValidateScript(args: any) {
    return this.handleCheckScript(args);
  }

  // Alias of instance_scene: map name -> nodeName and dispatch.
  private async handleAddSceneInstance(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.instanceScenePath) return this.missing('scenePath', 'instanceScenePath');
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      instanceScenePath: args.instanceScenePath,
      parentNodePath: args.parentPath || '',
    };
    if (args.name) opParams.nodeName = args.name;
    return this.dispatchOp('instance_scene', args.projectPath, opParams,
      `Instanced '${args.instanceScenePath}' into '${args.scenePath}':`, [args.scenePath, args.instanceScenePath]);
  }

  private async handleMoveNode(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || args.newParent === undefined) {
      return this.missing('scenePath', 'nodePath', 'newParent');
    }
    return this.dispatchOp('move_node', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, newParent: args.newParent, keepGlobalTransform: args.keepGlobalTransform !== false },
      `Moved '${args.nodePath}' under '${args.newParent}':`, [args.scenePath]);
  }

  private async handleAddResource(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.property || !args.resourceType) {
      return this.missing('scenePath', 'nodePath', 'property', 'resourceType');
    }
    const opParams: OperationParams = {
      scenePath: args.scenePath,
      nodePath: args.nodePath,
      property: args.property,
      resourceType: args.resourceType,
    };
    if (args.properties) opParams.properties = args.properties;
    return this.dispatchOp('add_resource', args.projectPath, opParams,
      `Assigned ${args.resourceType} to '${args.property}' on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleSetAnchorPreset(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !args.preset) {
      return this.missing('scenePath', 'nodePath', 'preset');
    }
    return this.dispatchOp('set_anchor_preset', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, preset: args.preset },
      `Set anchor preset '${args.preset}' on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleSetNodeGroups(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || args.nodePath === undefined || !Array.isArray(args.groups)) {
      return this.missing('scenePath', 'nodePath', 'groups');
    }
    return this.dispatchOp('set_node_groups', args.projectPath,
      { scenePath: args.scenePath, nodePath: args.nodePath, groups: args.groups },
      `Set groups on '${args.nodePath}':`, [args.scenePath]);
  }

  private async handleBatchAddNodes(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !Array.isArray(args.nodes)) return this.missing('scenePath', 'nodes');
    return this.dispatchOp('batch_add_nodes', args.projectPath,
      { scenePath: args.scenePath, nodes: args.nodes },
      `Added ${args.nodes.length} node(s) to '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleBatchSetProperty(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath || !args.property || args.value === undefined) {
      return this.missing('scenePath', 'property', 'value');
    }
    if (!Array.isArray(args.nodePaths) && !args.nodeType) {
      return this.missing('nodePaths or nodeType');
    }
    const opParams: OperationParams = { scenePath: args.scenePath, property: args.property, value: args.value };
    if (Array.isArray(args.nodePaths)) opParams.nodePaths = args.nodePaths;
    if (args.nodeType) opParams.nodeType = args.nodeType;
    return this.dispatchOp('batch_set_property', args.projectPath, opParams,
      `Set '${args.property}' across nodes in '${args.scenePath}':`, [args.scenePath]);
  }

  private async handleCrossSceneSetProperty(args: any) {
    args = this.normalizeParameters(args);
    if (!Array.isArray(args.scenePaths) || !args.nodeType || !args.property || args.value === undefined) {
      return this.missing('scenePaths', 'nodeType', 'property', 'value');
    }
    return this.dispatchOp('cross_scene_set_property', args.projectPath,
      { scenePaths: args.scenePaths, nodeType: args.nodeType, property: args.property, value: args.value, dryRun: args.dryRun === true },
      `Set '${args.property}' on ${args.nodeType} across ${args.scenePaths.length} scene(s):`, args.scenePaths);
  }

  // Overwrite an existing .gd script file (filesystem op).
  private async handleEditScript(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scriptPath || args.content === undefined) return this.missing('scriptPath', 'content');
    const err = this.checkProject(args.projectPath, args.scriptPath);
    if (err) return err;
    try {
      const full = join(args.projectPath, args.scriptPath);
      if (!existsSync(full)) return this.createErrorResponse(`Script not found: ${args.scriptPath}`, ['Use create_script to create a new script']);
      writeFileSync(full, args.content, 'utf-8');
      return this.structuredResponse(`Updated script '${args.scriptPath}'.`, { path: args.scriptPath, bytes: args.content.length });
    } catch (error: any) {
      return this.createErrorResponse(`Failed to edit script: ${error?.message || 'Unknown error'}`, []);
    }
  }

  // Delete a .tscn scene file (filesystem op) with strict safety checks.
  private async handleDeleteScene(args: any) {
    args = this.normalizeParameters(args);
    if (!args.scenePath) return this.missing('scenePath');
    if (!args.scenePath.toLowerCase().endsWith('.tscn')) {
      return this.createErrorResponse(`Refusing to delete non-scene file: ${args.scenePath}`, ['Only .tscn files can be deleted with delete_scene']);
    }
    const err = this.checkProject(args.projectPath, args.scenePath);
    if (err) return err;
    try {
      const full = join(args.projectPath, args.scenePath);
      if (!existsSync(full)) return this.createErrorResponse(`Scene not found: ${args.scenePath}`, ['Verify the scene path is correct']);
      unlinkSync(full);
      return this.structuredResponse(`Deleted scene '${args.scenePath}'.`, { path: args.scenePath, deleted: true });
    } catch (error: any) {
      return this.createErrorResponse(`Failed to delete scene: ${error?.message || 'Unknown error'}`, []);
    }
  }

  private async handleSetInputAction(args: any) {
    args = this.normalizeParameters(args);
    if (!args.action || !Array.isArray(args.events)) return this.missing('action', 'events');
    const opParams: OperationParams = { action: args.action, events: args.events };
    if (args.deadzone !== undefined) opParams.deadzone = args.deadzone;
    return this.dispatchOp('set_input_action', args.projectPath, opParams,
      `Set input action '${args.action}':`);
  }

  private async handleUidToProjectPath(args: any) {
    args = this.normalizeParameters(args);
    if (!args.uid) return this.missing('uid');
    return this.dispatchOp('uid_to_project_path', args.projectPath,
      { uid: args.uid }, `Resolved UID '${args.uid}':`);
  }

  private async handleProjectPathToUid(args: any) {
    args = this.normalizeParameters(args);
    if (!args.path) return this.missing('path');
    return this.dispatchOp('project_path_to_uid', args.projectPath,
      { path: args.path }, `Resolved path '${args.path}':`, [args.path]);
  }

  private async handleGetAndroidPresetInfo(args: any) {
    args = this.normalizeParameters(args);
    const err = this.checkProject(args.projectPath);
    if (err) return err;
    const cfg = join(args.projectPath, 'export_presets.cfg');
    if (!existsSync(cfg)) return this.createErrorResponse('No export_presets.cfg found (no export presets configured).', []);
    const text = this.safeReadText(cfg) || '';
    const sections = this.parseGodotCfg(text);
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (!/^preset\.\d+$/.test(s.section)) continue;
      const isAndroid = (s.values.platform || '').toLowerCase() === 'android';
      const matches = args.presetName ? s.values.name === args.presetName : isAndroid;
      if (!matches) continue;
      const options = sections[i + 1] && /\.options$/.test(sections[i + 1].section) ? sections[i + 1].values : {};
      return this.structuredResponse(`Android export preset '${s.values.name}':`, {
        preset: s.values,
        package_name: options['package/unique_name'],
        version_code: options['version/code'],
        version_name: options['version/name'],
        keystore_debug: options['keystore/debug'],
        keystore_release: options['keystore/release'],
        min_sdk: options['gradle_build/min_sdk'],
        target_sdk: options['gradle_build/target_sdk'],
        options,
      });
    }
    return this.createErrorResponse(
      args.presetName ? `Export preset not found: ${args.presetName}` : 'No Android export preset found.',
      ['Add an Android export preset in Godot, or pass a valid presetName', 'Use list_export_presets to see configured presets']
    );
  }

  /**
   * Run the MCP server
   */
  async run() {
    try {
      // Detect Godot path before starting the server
      await this.detectGodotPath();

      if (!this.godotPath) {
        console.error('[SERVER] Failed to find a valid Godot executable path');
        console.error('[SERVER] Please set GODOT_PATH environment variable or provide a valid path');
        process.exit(1);
      }

      // Check if the path is valid
      const isValid = await this.isValidGodotPath(this.godotPath);

      if (!isValid) {
        if (this.strictPathValidation) {
          // In strict mode, exit if the path is invalid
          console.error(`[SERVER] Invalid Godot path: ${this.godotPath}`);
          console.error('[SERVER] Please set a valid GODOT_PATH environment variable or provide a valid path');
          process.exit(1);
        } else {
          // In compatibility mode, warn but continue with the default path
          console.error(`[SERVER] Warning: Using potentially invalid Godot path: ${this.godotPath}`);
          console.error('[SERVER] This may cause issues when executing Godot commands');
          console.error('[SERVER] This fallback behavior will be removed in a future version. Set strictPathValidation: true to opt-in to the new behavior.');
        }
      }

      console.error(`[SERVER] Using Godot at: ${this.godotPath}`);

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Godot MCP server running on stdio');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SERVER] Failed to start:', errorMessage);
      process.exit(1);
    }
  }
}

// Create and run the server
const server = new GodotServer();
server.run().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Failed to run server:', errorMessage);
  process.exit(1);
});
