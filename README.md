<p align="center">
  <a href="https://github.com/Codevaani/Pi-Enhanced">
    <img alt="pie logo" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>

---

# Pi Enhanced (pie) — Coding Agent Monorepo

> **Forked from [earendil-works/pi](https://github.com/earendil-works/pi). Maintained by [@Codevaani](https://github.com/Codevaani).**

The open-source, extensible coding agent CLI. Built for developers who want full control over their AI-assisted workflow.

* **pie** (`packages/coding-agent`): Interactive coding agent CLI with tools, extensions, skills, and widgets
* **[@earendil-works/pi-agent-core](packages/agent)**: Agent runtime with tool calling and state management
* **[@earendil-works/pi-ai](packages/ai)**: Unified multi-provider LLM API (OpenAI, Anthropic, Google, …)

## Quick Start

```bash
npm install -g @earendil-works/pi-coding-agent
# or
brew install pi
```

Then:

```bash
pie  # Start interactive mode
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
| `todo` | Track multi-step progress with live widget |
| `web_search` | Search the live web via Exa MCP |
| `codebase_search` | Search project codebase (ripgrep + optional semantic reranking) |

## Features

- **Multi-provider**: OpenAI, Anthropic, Google, Groq, xAI, OpenRouter, Mistral, and more
- **Extensions**: Add custom tools, UI widgets, event hooks
- **Skills**: Load CLI tools as LLM-accessible skills
- **Prompt templates**: Reusable prompt snippets
- **Session management**: Fork, branch, resume, compact conversations
- **Codebase indexing**: `/indexinit` → background incremental index + `codebase_search` tool
- **Semantic search**: Embedding-based reranking with `@xenova/transformers` (optional)
- **Live widgets**: Todo tracker, indexing progress, and more
- **Keybinding config**: Fully customizable via `~/.pi/keybindings.json`

## Development

```bash
git clone https://github.com/Codevaani/Pi-Enhanced.git
cd Pi-Enhanced

npm install --ignore-scripts
npm run check
./pi-test.sh  # Run pie from sources
```

## License

MIT — see [LICENSE](LICENSE).
