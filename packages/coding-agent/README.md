<p align="center">
  <a href="https://github.com/Codevaani/Pi-Enhanced">
    <img alt="pie logo" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>

---

# pie — Pi Enhanced Coding Agent

> **Forked from [earendil-works/pi](https://github.com/earendil-works/pi). Maintained by [@Codevaani](https://github.com/Codevaani).**

Pi is a minimal terminal coding harness. Adapt pi to your workflows, not the other way around, without having to fork and modify pi internals. Extend it with TypeScript [Extensions](#extensions), [Skills](#skills), [Prompt Templates](#prompt-templates), and [Themes](#themes). Put your extensions, skills, prompt templates, and themes in [Pi Packages](#pi-packages) and share them with others via npm or git.

Pi ships with powerful defaults but skips features like sub agents and plan mode. Instead, you can ask pi to build what you want or install a third party pi package that matches your workflow.

## Quick Start

```bash
npm install -g --ignore-scripts @codevaani7838/pie-coding-agent
```

Authenticate:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pie
```

## Built-in Tools

| Tool | Description |
|------|-------------|
| `read` | Read file contents |
| `bash` | Execute shell commands |
| `edit` | Edit files with diff |
| `write` | Create or overwrite files |
| `ripgrep` | Search file contents |
| `find` | Find files by path |
| `ls` | List directory contents |
| `todo` | Track multi-step progress with live widget above editor |
| `web_search` | Search the live web via Exa MCP |

## Additional Features (Pi Enhanced)

| Feature | Command / Description |
|---------|----------------------|
| **Todo Widget** | Built-in todo tool + `/todo` toggle + live progress widget above editor |
| **Web Search** | `web_search { query }` — live search via Exa MCP |
| **Loop Mode** | `/loop` → automatically re-sends your last prompt after each turn |
| **Rewind** | `/rewind` → restore code + conversation to any previous user message |

## Commands

| Command | Description |
|---------|-------------|
| `/model` | Switch models |
| `/settings` | Thinking level, theme, delivery |
| `/resume` | Pick from previous sessions |
| `/new` | Start a new session |
| `/tree` | Navigate session tree (switch branches) |
| `/fork` | Create a new session from a previous message |
| `/compact` | Manually compact context |
| `/todo` | Toggle the todo widget (enable/disable) |
| `/loop` | Toggle loop mode (re-sends prompt after each turn) |
| `/export [file]` | Export session to HTML/JSONL |
| `/share` | Upload as private GitHub gist |
| `/quit` | Quit |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+C | Clear editor |
| Ctrl+C twice | Quit |
| Escape | Cancel/abort |
| Ctrl+L | Open model selector |
| Ctrl+P / Shift+Ctrl+P | Cycle models forward/backward |
| Shift+Tab | Cycle thinking level |
| Ctrl+O | Collapse/expand tool output |
| Ctrl+T | Collapse/expand thinking blocks |

## Customization

### Extensions

TypeScript modules that extend pie with custom tools, commands, keyboard shortcuts, event handlers, and UI components.

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerTool({ name: "deploy", ... });
  pi.registerCommand("stats", { ... });
}
```

Place in `~/.pie/agent/extensions/`, `.pie/extensions/`, or a [pi package](#pi-packages). See [docs/extensions.md](docs/extensions.md).

### Skills & Prompt Templates

Skills are on-demand capability packages (`.pie/skills/`). Prompt templates are reusable Markdown snippets (`.pie/prompts/`). See [docs/skills.md](docs/skills.md) and [docs/prompt-templates.md](docs/prompt-templates.md).

## Development

```bash
git clone https://github.com/Codevaani/Pi-Enhanced.git
cd Pi-Enhanced
npm install --ignore-scripts
npm run check
./pi-test.sh  # Run pie from sources
```

## License

MIT
