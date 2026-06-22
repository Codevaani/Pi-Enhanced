<p align="center">
  <a href="https://github.com/Codevaani/Pi-Enhanced">
    <img alt="pie logo" src="https://raw.githubusercontent.com/Codevaani/Pi-Enhanced/main/assets/pie.png" width="128">
  </a>
</p>

---

# pie — AI Coding Assistant

> **v1.0.0** — First release. Maintained by [@Codevaani](https://github.com/Codevaani).

The open-source, extensible coding agent CLI. Built for developers who want full control over their AI-assisted workflow.

- **Multi-provider**: OpenAI, Anthropic, Google, Groq, xAI, OpenRouter, Mistral, and more
- **Extensions**: Add custom tools, UI widgets, event hooks
- **Skills**: Load CLI tools as LLM-accessible skills
- **Session management**: Fork, branch, resume, compact conversations
- **Live widgets**: Todo tracker, indexing progress, and more

---

## Install

### Linux / macOS (curl bash)

```bash
curl -fsSL https://github.com/Codevaani/Pi-Enhanced/releases/download/v1.0.0/install.sh | bash
```

### Windows (PowerShell)

```powershell
iwr -Uri https://github.com/Codevaani/Pi-Enhanced/releases/download/v1.0.0/install.ps1 -UseBasicParsing | iex
```

### Manual

Download the archive for your platform from the [releases page](https://github.com/Codevaani/Pi-Enhanced/releases), extract it, and add the binary to your PATH.

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `pie-darwin-arm64.tar.gz` |
| macOS (Intel) | `pie-darwin-x64.tar.gz` |
| Linux x64 | `pie-linux-x64.tar.gz` |
| Linux ARM64 | `pie-linux-arm64.tar.gz` |
| Windows x64 | `pie-windows-x64.zip` |
| Windows ARM64 | `pie-windows-arm64.zip` |

Then run:

```bash
pie  # Start interactive mode
```

---

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

---

## Development

```bash
git clone https://github.com/Codevaani/Pi-Enhanced.git
cd Pi-Enhanced

npm install --ignore-scripts
npm run check
./pie-test.sh  # Run pie from sources
```

---

## Contact

- Email: [codevaani.in@gmail.com](mailto:codevaani.in@gmail.com)
- GitHub: [@Codevaani](https://github.com/Codevaani)
- Issues: [github.com/Codevaani/Pi-Enhanced/issues](https://github.com/Codevaani/Pi-Enhanced/issues)

---

## License

MIT — see [LICENSE](LICENSE).
