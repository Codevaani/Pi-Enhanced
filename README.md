<p align="center">
  <a href="https://github.com/Codevaani/Pi-Enhanced">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Codevaani/Pi-Enhanced/main/assets/pie-dark.png">
      <img alt="pie logo" src="https://raw.githubusercontent.com/Codevaani/Pi-Enhanced/main/assets/pie-light.png" width="128">
    </picture>
  </a>
</p>

# pie — Extensible AI Coding Assistant CLI


Pi-Enhanced (`pie`) is an open-source, highly extensible terminal-based coding agent CLI designed to give developers absolute control over their AI-assisted development workflows. It supports multiple LLM providers, conversation session branching, drag-and-drop file attachments, and modular developer tooling inside a premium Terminal User Interface (TUI).

---

## Key Capabilities

* **Multi-Provider LLM Engine**: Native support for Anthropic (Claude), OpenAI (GPT), Google (Gemini), Groq, xAI (Grok), OpenRouter, Mistral, and Amazon Bedrock.
* **Interactive TUI**: A terminal interface featuring real-time response streaming, searchable model selectors (`/model`), active session browsers, and cost/token usage tracking in the footer.
* **Built-in Developer Tools**:
  * `read` / `write`: Read file content and safely write new files.
  * `edit`: Surgical find-and-replace tool for exact code updates.
  * `bash`: Run shell commands locally or in a sandbox environment.
  * `ripgrep` / `find` / `ls`: Rapidly locate files and search contents respecting `.gitignore`.
* **Advanced Session Management**: Branch conversations from any historical message (`/branch`), resume active sessions (`--resume`), and export chats to HTML.
* **Extensible Slash Commands**: Turn custom prompts into slash commands by placing `.txt` files in `~/.pie/slash-commands/`.

---

## Installation

```bash
npm install -g --ignore-scripts @codevaani7838/pie-coding-agent
```

---

## Getting Started

Start the interactive terminal application by running:
```bash
pie
```

### Command Usage Examples

* **Interactive Mode with Prompt**:
  ```bash
  pie "Explain the setup in package.json"
  ```
* **Process a Prompt and Exit (Non-Interactive)**:
  ```bash
  pie -p "List all test files in the workspace"
  ```
* **Attach Files or Images**:
  ```bash
  pie @src/main.ts @assets/design.png "Refactor this layout based on the design mockup"
  ```
* **Limit Models or Set Custom Thinking Levels**:
  ```bash
  pie --models claude-sonnet-4-5:high,gemini-2.5-pro:medium
  ```

---

## Repository Structure

This monorepo is divided into decoupled workspaces under the `packages/` directory:

* **[packages/coding-agent](packages/coding-agent)**: Core CLI orchestrator, tool registry, and session database managers.
* **[packages/tui](packages/tui)**: High-performance terminal UI renderer supporting differential updates and custom themes.
* **[packages/agent](packages/agent)**: Decoupled agent state machine execution loop.
* **[packages/ai](packages/ai)**: Universal model routing client supporting automatic model configuration and credentials loading.

---

## Development Setup

Clone the repository and install workspace dependencies:

```bash
git clone https://github.com/Codevaani/Pi-Enhanced.git
cd Pi-Enhanced

# Install dependencies (respects lockstep workspace versioning)
npm install --ignore-scripts

# Verify code formatting and run validation checks
npm run check

# Launch the CLI locally from source
./pie-test.sh
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
