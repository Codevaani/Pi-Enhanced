# Changelog

## [0.0.1] - 2026-06-25

### Added

- Added `pie uninstall` command — self-uninstalls the CLI by deleting the binary and `~/.pie/agent` config directory. Works on Linux, macOS, and Windows.
- Added `self-uninstall` command type to package manager CLI.

### Changed

- Switched version check from pi.dev API to GitHub Releases API (`api.github.com/repos/Codevaani/Pi-Enhanced/releases/latest`).
- Simplified install method detection — only `bun-binary` and `unknown` remain. Removed all npm/pnpm/yarn/bun package manager code paths.
- Self-update (`pie update --self`) now shows the GitHub Releases download URL instead of running npm/pnpm/yarn/bun commands.

### Removed

- Removed LSP subsystem (`src/lsp/`) including all LSP tool registration, imports, and interactive mode display.
- Removed all npm/pnpm/yarn/bun package manager update/uninstall infrastructure: `SelfUpdateCommand`, `getSelfUpdateCommand`, `getSelfUpdateCommandForMethod`, `readCommandOutput`, `getInferredNpmInstall`, `getGlobalPackageRoots`, `isManagedByGlobalPackageManager`, `isSelfUpdatePathWritable`, `runSelfUpdate`, `prepareWindowsNpmSelfUpdate`, `printSelfUpdateUnavailable`, `printSelfUpdateFallback`, `printSelfUpdateNote`.
- Removed unused `windows-self-update` quarantine utilities from package manager CLI (kept in startup flow).
- Removed stale `.github/` workflow and template files (APPROVED_CONTRIBUTORS, issue templates, CI workflows).

### Fixed

- Updated self-update tests to match GitHub API response format (`tag_name` instead of `version`/`packageName`).
- Fixed test assertions for bun-binary self-update flow.
- Removed unused `PACKAGE_NAME` import from package-command-paths test.
