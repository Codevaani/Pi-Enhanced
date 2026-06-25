# Changelog

## [0.0.1] - 2026-06-25

### First Release of Pi-Enhanced (pie)

This is the initial official release of **Pi-Enhanced** (`pie`), a fully open-source, highly extensible, and multi-provider AI coding assistant CLI. Designed from the ground up to give developers complete control over their AI-assisted software development workflows, this release introduces a robust terminal-based user interface (TUI) alongside advanced agent capabilities.

#### Key Features Included

- **Multi-Provider LLM Integration**: First-class support for OpenAI, Anthropic, Google Gemini, Groq, xAI, OpenRouter, Mistral, and Amazon Bedrock.
- **Interactive Terminal User Interface (TUI)**: A feature-rich, high-performance terminal layout featuring:
  - Real-time streaming response blocks.
  - Interactive model selector with fuzzy search (`/model`).
  - Active session selection and history browser.
  - Auto-compaction warnings and tokens/costs indicator inside the footer.
- **Surgical Code Editing Tooling**:
  - `read`: Read target files with context checking.
  - `edit`: Apply precise find/replace edits to local files securely.
  - `write`: Create or overwrite files automatically.
  - `bash`: Run shell commands in a sandboxed or local execution environment.
  - `ripgrep` & `find`: Fast file exploration respecting `.gitignore`.
- **Advanced Attachment & Command Pipeline**:
  - Drag-and-drop file/image attachments directly inside supported terminals.
  - File-based custom slash commands parsed from `~/.pie/slash-commands/`.
  - Conversation branching (`/branch`) to resume work from any previous point.
