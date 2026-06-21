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
import { existsSync, readdirSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
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
    // Basic validation to prevent path traversal
    if (!path || path.includes('..')) {
      return false;
    }

    // Add more validation as needed
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
    projectPath: string
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
        timeout: OPERATION_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 32,
      });

      // execFileAsync only resolves on exit code 0.
      return { stdout: stdout ?? '', stderr: stderr ?? '', code: 0 };
    } catch (error: unknown) {
      // If execFileAsync throws, it still contains stdout/stderr plus the exit code.
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        const execError = error as Error & { stdout: string; stderr: string; code?: number; killed?: boolean };
        if (execError.killed) {
          throw new Error(`Godot operation '${operation}' timed out after ${OPERATION_TIMEOUT_MS}ms`);
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
    projectPath: string
  ): Promise<{ success: boolean; result: any | null; stdout: string; stderr: string }> {
    const { stdout, stderr, code } = await this.executeOperation(operation, params, projectPath);

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
    for (const p of [projectPath, ...paths]) {
      if (p && !this.validatePath(p)) {
        return this.createErrorResponse('Invalid path', ['Provide valid paths without ".." segments']);
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
