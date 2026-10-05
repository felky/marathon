# marathon

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)
![Platforms: Windows, macOS, Linux](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)

Run a project's processes side by side in a single terminal window.

marathon (`mth`) reads a small `mth.json` file and launches every task in its own pane: live output, per-task status, and keyboard control. It is a lightweight alternative to juggling terminal tabs or adopting a full monorepo tool — it works with pnpm, npm, yarn and bun workspaces, Cargo projects, or plain scripts.

```text
┌ ● api ────────────────────────────┬ ● web ────────────────────────────┐
│listening on :3000                 │web: ready in 240 ms               │
│GET /health 200                    │12:04:11  hmr update               │
│12:04:11  api tick 4               │hmr update /src/App.tsx            │
├───────────────────────────────────┼watching for changes               │
│tools: starting                    │12:04:12  hmr update               │
│worker ready                       │12:04:13  hmr update               │
│12:04:11  tools tick 2             │ready                              │
└───────────────────────────────────┴───────────────────────────────────┘
 1 api  2 tools  3 web                        3/3 running · Ctrl-B ? help
```

## Features

- **One window, many panes.** Every task runs in a real pseudo-terminal, so colors, spinners, progress bars and interactive prompts behave exactly as they do in a normal terminal.
- **Keyboard-driven.** `Ctrl-B` is the leader: switch panes, scroll output, restart or kill a task, and quit everything.
- **Per-task status.** Titles show a dot — green running, gray finished, red failed, yellow killed.
- **Simple configuration.** One `mth.json` per project. A task is either a one-line command or an object with `cwd`, `env`, `color` and `shell`.
- **Runs from anywhere.** `mth link` saves a project by name, so `mth api` starts it from any directory.
- **CI-friendly.** `--plain` prefixes each line with the task name and exits with the first non-zero exit code.

## Requirements

- Node.js 18 or newer
- A terminal with ANSI and alternate-screen support (Windows Terminal, VS Code, iTerm2, GNOME Terminal, Alacritty, Kitty, …)
- On Windows, Windows 10 1809 or newer (ConPTY)

## Installation

```sh
git clone https://github.com/felky/marathon.git
cd marathon
npm install
npm link
```

`npm link` puts `mth` on your `PATH`. To remove it later:

```sh
npm unlink -g marathon
```

You can also run it without installing anything:

```sh
node bin/mth.js
```

## Quick start

```sh
cd my-project
mth init          # create mth.json, detecting workspace packages
mth               # run everything in panes
mth link          # save it as "my-project"
mth my-project    # run it from anywhere
```

## Configuration

`mth.json` lives in the project root. `mth` finds it by walking up from the current directory.

```json
{
  "name": "acme",
  "layout": "auto",
  "default": ["api", "web"],
  "tasks": {
    "api": "pnpm --filter @acme/api dev",
    "tools": {
      "cmd": "cargo run",
      "cwd": "services/tools",
      "color": "magenta",
      "env": { "RUST_LOG": "debug" },
      "shell": "cmd"
    },
    "web": { "cmd": "pnpm --filter web dev", "cwd": "apps/web" }
  }
}
```

### Task options

| Field | Type | Description |
| --- | --- | --- |
| `cmd` | string | Command to run. Required when the task is an object; a task may also be a plain string. |
| `cwd` | string | Working directory, relative to `mth.json`. Defaults to the project root. |
| `env` | object | Extra environment variables for this task. |
| `color` | string | Title color. One of `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `blue`, `purple`, `magenta`, `pink`, `white`, `gray`. |
| `shell` | string | Shell override for this task, for example `"cmd"`, `"pwsh"` or `"bash"`. |

### Top-level options

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Project name. Defaults to the folder name. |
| `layout` | string | `auto` (default), `cols`, `rows` or `grid`. |
| `default` | string[] | Tasks to run when none are named on the command line. Defaults to all tasks. |
| `shell` | string | Shell override for every task. |

Every command runs through a shell:

- **Windows:** `pwsh` if it is on `PATH`, otherwise `powershell.exe`. PowerShell 5.1 does not support `&&`; use `;`, or set `"shell": "cmd"` for that task.
- **macOS/Linux:** `$SHELL -lc`, so tools installed through nvm, asdf and similar are on `PATH`.

## Commands

| Command | Description |
| --- | --- |
| `mth` | Run the project in the current folder. |
| `mth <project> [task...]` | Run a saved project, optionally a subset of its tasks. |
| `mth ls` | List saved projects and their tasks. |
| `mth link [name]` | Save the current folder as a project. |
| `mth unlink <name>` | Forget a saved project. |
| `mth init [--force]` | Create `mth.json` here. |
| `mth doctor` | Print environment and dependency status. |
| `mth help` | Show usage. |

Flags: `--plain`, `--layout=<auto|cols|rows|grid>`, `--shell=<path>`, `--bail`, `--version`.

Saved projects are stored in `~/.mth/projects.json`; set `MTH_HOME` to relocate that file.

## Keyboard shortcuts

Normal keystrokes are forwarded to the focused pane, so interactive dev servers work. `Ctrl-B` is the leader key.

| Keys | Action |
| --- | --- |
| `Ctrl-B ?` | Help overlay. |
| `Ctrl-B q` | Quit and stop all tasks. |
| `Ctrl-B r` | Restart the focused task. |
| `Ctrl-B x` | Kill the focused task. |
| `Ctrl-B n` / `Ctrl-B p` | Focus next / previous pane. |
| `Ctrl-B 1..9` | Focus a pane by number. |
| `Ctrl-B` + arrows | Move focus. |
| `Ctrl-B [` | Scroll mode (arrows, PgUp/PgDn, `g`/`G`, `Esc` to exit). |
| `Ctrl-B Ctrl-B` | Send a literal `Ctrl-B` to the focused task. |

## Plain mode

When stdout is not a TTY, or with `--plain`, the pane UI is replaced by line prefixes:

```text
[api  ] listening on :3000
[web  ] ready in 240 ms
[api  ] ── api finished ──
```

The process exits with the first non-zero task exit code. `--bail` stops every task on the first failure.

## How it works

Each task runs in a pseudo-terminal (`node-pty`), so it believes it is attached to a real terminal. A headless xterm (`@xterm/headless`) per pane keeps that task's screen buffer and scrollback, and the renderer composites the panes into one screen using absolute cursor positioning. Keyboard input is forwarded to the focused pane; `Ctrl-B` is intercepted by `mth`.

## Platform notes

- **Windows** uses ConPTY, and task trees are terminated with `taskkill /T /F`.
- **macOS and Linux** run each task through a login shell and kill it by signalling its process group.
- `NO_COLOR` is respected.

## Troubleshooting

- **`mth: command not found`** — reopen the terminal after `npm link`, and make sure the npm global bin directory is on your `PATH`.
- **A command fails with a syntax error on Windows** — the default shell is PowerShell. For `&&` or cmd-specific syntax, set `"shell": "cmd"` on the task.
- **A tool is not found on macOS** — tasks run through `$SHELL -lc`; add the tool to your shell profile's `PATH`.
- **`node-pty` fails to install** — a prebuilt binary may be missing for your platform. Install build tools (Xcode Command Line Tools, `build-essential`, or Visual Studio Build Tools) and reinstall.
- **Panes are cramped** — resize the window. At least 20x6 cells are required; below that `mth` shows a "terminal too small" message.
- **Output looks wrong in an unusual terminal** — use `mth --plain`.

## Contributing

Issues and pull requests are welcome. Run `npm test` before opening a PR; it covers configuration parsing, workspace detection, layout maths, plain mode, and the pane UI through a real pseudo-terminal.

## Development

```sh
npm install
npm test                       # unit and pty integration tests
node bin/mth.js examples/demo  # three live tickers in panes
```

## License

Released under the MIT License.