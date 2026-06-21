# Design note: a live-editor / runtime bridge

> Status: **proposal / deferred.** This documents capabilities that are intentionally
> *not* implemented yet, and what it would take to add them. Nothing here is wired up.
> Targets **Godot 4.x**, matching the server.

## Why these tools don't exist today

`godot-mcp-extended` is a **headless, stateless** server. Every engine operation is a fresh
`godot --headless --script godot_operations.gd <op> <params>` invocation that:

1. boots a throwaway `SceneTree`,
2. loads/edits/saves project files on disk,
3. prints a single `__RESULT__<json>` line, and
4. exits.

This model is great for *authoring* — it reads and writes `.tscn` / `.tres` / `.gd` files
deterministically and needs nothing running. But it has no concept of:

- a **running game** with live node state, physics, and frames;
- a **persistent editor** with a viewport, an output log, an UndoRedo history, and a camera;
- **time** — input over multiple frames, waiting for a node to appear, recording/replaying.

A whole class of useful tools needs exactly those things. They cannot be expressed as a
one-shot headless script because there is no live process to talk to. **51 deferred tools**
are catalogued below, grouped by what they fundamentally require, each with the contract a
future implementer would build to.

## The capability gap — 51 deferred tools

Group subtotals: A 20 · B 16 · C 3 · D 5 · E 5 · F 2 = **51**.

Each line is: **`tool`** — purpose — *key params* — **requires** — Godot 4 API/subsystem.

### A. Running-game inspection & control (needs a running game) — 20

- **`get_game_scene_tree`** — dump the running game's node hierarchy — *maxDepth, typeFilter?, scriptFilter?, namedOnly?* — running game — `SceneTree.root` traversal over the bridge.
- **`get_game_node_properties`** — read all/filtered properties of a live node — *nodePath, properties?* — running game — `Node.get` / `get_property_list`.
- **`set_game_node_property`** — mutate one property on a live node — *nodePath, property, value* — running game — `Node.set`.
- **`batch_get_properties`** — read properties across many live nodes in one call — *nodes:[{nodePath, properties}]* — running game — bulk `Node.get`.
- **`monitor_properties`** — stream a node's property values over N frames — *nodePath, properties, frameCount, frameInterval* — running game + frame loop — per-frame snapshot.
- **`watch_signals`** — capture signal emissions for a duration — *nodePaths, signalFilter?, durationMs* — running game — temporary `Signal.connect` intercepts.
- **`get_autoload`** — inspect an autoload singleton's properties — *name, properties?* — running game — resolve autoload node + `get`.
- **`find_nodes_by_script`** — find live nodes whose script matches — *script, properties?* — running game — tree walk + script-path compare.
- **`find_nearby_nodes`** — find live nodes within a spatial radius — *position{x,y,z}, radius?, typeFilter?, groupFilter?, maxResults?* — running game — `PhysicsServer2D/3D` shape query or distance scan.
- **`find_ui_elements`** — enumerate visible `Control` nodes — *typeFilter?* — running game — `CanvasLayer`/`Control` traversal + `is_visible_in_tree`.
- **`wait_for_node`** — block until a node path exists or times out — *nodePath, timeout, pollFrames?* — running game + frame loop — polled `get_node_or_null`.
- **`execute_game_script`** — run arbitrary GDScript in the game context — *code* — running game (**dangerous**) — dynamic `GDScript` compile + run.
- **`capture_frames`** — grab a sequence of frame images — *count, frameInterval, halfResolution?* — running game + viewport — `Viewport.get_texture().get_image()` per frame.
- **`get_game_screenshot`** — capture the current game viewport — *savePath?* — running game + viewport — `Image` save / base64.
- **`start_recording`** — begin recording the input/frame timeline — *(none)* — running game — event-log accumulation.
- **`stop_recording`** — end the recording session — *(none)* — running game — finalize event log.
- **`replay_recording`** — play back a recorded input sequence — *events:[{type,timeMs,…}], speed?* — running game + frame timing — sequenced `Input.parse_input_event`.
- **`navigate_to`** — pathfind a character to a target — *target(node|{x,y,z}), playerPath?, moveSpeed?* — running game + physics — `NavigationServer2D/3D` path query.
- **`move_to`** — move to a target and block until arrival/timeout — *target, playerPath?, arrivalRadius?, timeout?, run?, lookAtTarget?* — running game + frame loop — velocity drive + position poll.
- **`click_button_by_text`** — press a UI button found by its label — *text, partial?* — running game — `Control` text match + `pressed` emit.

### B. Editor-state inspection & control (needs a live editor) — 16

- **`get_editor_screenshot`** — capture the editor viewport — *savePath?* — live editor — `EditorInterface` base control viewport texture.
- **`get_editor_camera`** — read the 3D editor camera pose — *(none)* — live editor — editor `Camera3D` transform/fov.
- **`set_editor_camera`** — set the editor camera pose — *position?, rotationDegrees?, lookAt?, fov?* — live editor — editor `Camera3D` writes.
- **`get_editor_errors`** — collect compile/runtime errors — *maxLines?* — live editor — debugger/output panel scrape.
- **`get_output_log`** — fetch editor console output — *maxLines?, filter?* — live editor — EditorLog text / `user://logs`.
- **`clear_output`** — clear the editor console — *(none)* — live editor — editor log clear.
- **`get_open_scripts`** — list open script-editor tabs — *(none)* — live editor — `ScriptEditor.get_open_scripts`.
- **`get_signals`** — enumerate a scene node's signals + connections — *nodePath* — live editor (scene open) — `Node.get_signal_list` + connection introspection.
- **`get_resource_preview`** — generate a resource thumbnail — *path* — live editor — `EditorResourcePreview`.
- **`get_editor_performance`** — editor memory/CPU stats — *(none)* — live editor — `Performance` monitors.
- **`get_performance_monitors`** — real-time performance counters — *(none)* — live editor — `Performance.get_monitor`.
- **`compare_screenshots`** — pixel-diff two images — *imageA, imageB, threshold?* — math only (pairs with capture tools) — `Image` per-pixel delta.
- **`set_auto_dismiss`** — toggle auto-dismissal of editor dialogs — *enabled* — live editor — bridge-plugin state.
- **`execute_editor_script`** — run GDScript in the editor (tool) context — *code, allowUnsafeEditorIo?* — live editor (**dangerous**) — guarded `GDScript` tool run.
- **`reload_plugin`** — reload addon scripts — *(none)* — live editor — `EditorInterface.set_plugin_enabled` cycle.
- **`reload_project`** — rescan the project filesystem — *(none)* — live editor — `EditorFileSystem.scan`.

### C. Editor scene play/stop (needs a live editor) — 3

- **`open_scene`** — open a `.tscn` in the editor — *path* — live editor — `EditorInterface.open_scene_from_path`.
- **`play_scene`** — launch a scene from the editor — *mode("main"|"current"|path)* — live editor → game subprocess — `play_main_scene` / `play_current_scene` / `play_custom_scene`.
- **`stop_scene`** — stop the running game — *(none)* — running game + editor — `EditorInterface.stop_playing_scene`.

### D. Input simulation (needs a window + frame loop) — 5

- **`simulate_key`** — inject a key event — *keycode, pressed?, shift?, ctrl?, alt?* — running game — `InputEventKey` via `Input.parse_input_event`.
- **`simulate_action`** — inject an InputMap action — *action, pressed?, strength?* — running game — `InputEventAction`.
- **`simulate_mouse_click`** — inject a mouse button event — *button?, pressed?, doubleClick?, autoRelease?, x?, y?* — running game — `InputEventMouseButton`.
- **`simulate_mouse_move`** — inject mouse motion — *x?, y?, relativeX?, relativeY?, buttonMask?* — running game — `InputEventMouseMotion`.
- **`simulate_sequence`** — queue multiple input events across frames — *events:[{type,…}], frameDelay?* — running game + frame loop — sequenced injection.

### E. Runtime test harness (needs running game + frames + input) — 5

- **`run_test_scenario`** — run ordered steps (input/wait/assert/screenshot) — *steps:[{type,…}], scenePath?* — running game + editor — play scene + step orchestration (builds on A/C/D).
- **`assert_node_state`** — assert a live node property matches expected — *nodePath, property, expected, operator?(eq|neq|gt|lt|gte|lte|contains|type_is)* — running game — fetch + compare.
- **`assert_screen_text`** — assert text is visible in the UI — *text, partial?, caseSensitive?* — running game — `find_ui_elements` text search.
- **`run_stress_test`** — fire random input for a duration, detect crashes — *duration, actions?* — running game + frame loop — timed random batches.
- **`get_test_report`** — return accumulated assertion results — *clear?* — bridge state — in-memory results accumulator.

### F. Device / deploy (needs external tooling, e.g. `adb`) — 2

- **`list_android_devices`** — list connected Android devices — *(none)* — `adb` (Android SDK) — parse `adb devices -l`.
- **`deploy_to_android`** — export an APK, install, optionally launch — *presetName?|presetIndex?, deviceSerial?, debug?, launch?, skipExport?* — `adb` + Godot CLI — `godot --headless --export-*` then `adb install` + launch.

> **Already implemented (NOT deferred):** `get_android_preset_info` reads the Android export
> preset config from `export_presets.cfg` and is fully **headless** — it ships today
> (`handleGetAndroidPresetInfo` in `src/index.ts`). Only the live **device** operations above
> (which need `adb`) are deferred.
>
> **Partial headless analogues already in the server:** `run_project`, `run_scene_test`,
> `stop_project`, `get_debug_output`, `export_project`. The deferred versions go further by
> *inspecting and steering* a process while it runs.

## Proposed architecture

Add a second, **opt-in** transport that connects the MCP server to a *running* Godot instance,
without disturbing the existing headless path.

```
                 ┌─────────────────────── existing, unchanged ───────────────────────┐
  AI client ──stdio/MCP──> godot-mcp-extended ──exec──> godot --headless (one-shot)   │
                 └────────────────────────────────────────────────────────────────────┘
                                    │
                                    │  new, optional
                                    ▼
                         WebSocket / TCP (127.0.0.1:<port>)
                                    ▼
                  ┌──────────────── Godot editor (bridge plugin) ────────────────┐
                  │  • listens on a local port; authenticates the client          │
                  │  • runs editor-target methods against EditorInterface         │
                  │  • proxies game-target methods to the running game over its    │
                  │    own IPC (e.g. user:// request/response files or a socket)   │
                  └───────────────────────────────────────────────────────────────┘
                                    │ editor ⇄ game IPC
                                    ▼
                  ┌──────────────── running game (bridge autoload) ──────────────┐
                  │  • exposes the live SceneTree; injects InputEvents;           │
                  │  • captures viewport frames; polls per-frame for waits        │
                  └───────────────────────────────────────────────────────────────┘
```

### Components
1. **Bridge endpoint inside Godot.**
   - *Editor* tools: a small `EditorPlugin` (enabled per-project) that opens a localhost
     WebSocket/TCP server and dispatches methods against `EditorInterface`, the script editor,
     the output panel, `EditorUndoRedoManager`, and the open scene.
   - *Game* tools: an `autoload` (or a node the plugin injects on play) that exposes the running
     `SceneTree`, injects input via `Input.parse_input_event()`, captures screenshots via
     `get_viewport().get_texture().get_image()`, and polls per-frame for waits/recording.
2. **Client transport in the server.** A `BridgeClient` in `index.ts` that connects when a bridge
   is configured, speaks the envelope below, enforces per-request timeouts, and surfaces a clear
   "bridge not connected" error otherwise.
3. **Tool gating.** Deferred tools register only when a bridge is configured (see below); when
   absent they return a deterministic not-connected error and never hang.

### Wire protocol
JSON-RPC-style envelope over the localhost socket. Every request carries the target subsystem so
one endpoint multiplexes editor and game methods:

```jsonc
// request
{ "id": "42", "target": "game", "method": "get_game_node_properties",
  "params": { "nodePath": "/root/Main/Player" }, "token": "<shared-secret>" }
// success
{ "id": "42", "result": { "position": { "x": 100, "y": 50 }, "health": 3 } }
// error
{ "id": "42", "error": { "code": "NODE_NOT_FOUND", "message": "no node at /root/Main/Player" } }
```

- `target` is `"editor"` or `"game"`; the editor plugin proxies `target:"game"` calls to the
  running game over its own IPC, so the MCP server only ever talks to one port.
- Long/streaming ops (`monitor_properties`, `capture_frames`, `run_stress_test`) should emit
  incremental progress frames (`{"id","partial":…}`) and a final `result`.

### Tool gating + not-connected contract
- Configure with an env var, e.g. `GODOT_BRIDGE_PORT` (and optional `GODOT_BRIDGE_TOKEN`).
- When unset/unreachable, each deferred tool returns one deterministic error such as:
  `"Live bridge not connected. Start the Godot editor with the MCP bridge plugin enabled and set GODOT_BRIDGE_PORT."` — it must **fail fast**, never block.

### Session & concurrency model
- One bridge connection = one **session id**; at most one active *game* session at a time.
- Stateful ops (`start_recording`/`stop_recording`/`replay_recording`, `monitor_properties`,
  `get_test_report`) are scoped to the session so concurrent callers can't trample shared state;
  reject or queue a second recording/monitor rather than interleaving.

### Auth
- Bind to `127.0.0.1` only; the bridge is **opt-in**.
- Require a shared-secret **token handshake** for the connection, and gate the *dangerous* tools
  (`execute_editor_script`, `execute_game_script`, and `set_*`/`deploy_*`) behind it — ideally an
  explicit extra opt-in flag, since they run arbitrary code / mutate live/device state.

### Timeouts / performance budgets (defaults to start from)
- Per-request timeout (default ~10 s) distinct from the long-op budget.
- `wait_for_node` / `move_to`: default frame-wait timeout ~5 s (caller-overridable).
- `run_stress_test`: hard cap (e.g. 30 min) regardless of requested duration.
- Screenshots/frames: downscale or region-crop by default; prefer `compare_screenshots`
  structural diffs over shipping raw pixels.

### Coexistence / backward-compat
- The bridge is **strictly additive**; the headless path stays authoritative and unchanged.
- Deferred tools appear only when the bridge is configured, so default installs are unaffected.
- They complement (don't replace) the headless `run_project` / `run_scene_test` / `stop_project` /
  `get_debug_output` — those launch/await a process; the bridge versions *inspect and steer* a
  process that is already running.

## Suggested phasing (if/when picked up)
1. Bridge handshake + transport + auth; `get_game_scene_tree` / `get_game_node_properties`
   (read-only, proves the pipe).
2. `set_game_node_property`, `execute_game_script` (gated), `get_game_screenshot`.
3. Input simulation (group D) + `wait_for_node` + `capture_frames`.
4. Editor-state tools (group B) + scene play/stop (group C).
5. Runtime test harness (group E), built on phases 1–3.
6. Device/deploy (group F) — mostly wraps `adb` + the Godot CLI and can be largely headless.

Until then, these capabilities are out of scope and the server remains fully headless.
