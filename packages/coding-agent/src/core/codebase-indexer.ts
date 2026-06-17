/**
 * codebase-indexer.ts — Incremental file metadata cache + inverted-index-backed
 * codebase search. Uses ripgrep (rg) for blazingly fast content search and
 * maintains an incremental file metadata database in `.pi/index/`.
 *
 * Layout:
 *   .pi/index/
 *     ├── meta.db       ← SQLite (node:sqlite): file metadata + search history
 *     └── files.json    ← fallback when SQLite unavailable
 *
 * The indexer skips:
 *   - node_modules, .git, dist, build, target, venv, __pycache__
 *   - Binary files (images, archives, etc.)
 *   - Files > 1MB (configurable)
 */

import { type Dirent, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_IGNORE = [
	// Version control
	".git",
	".svn",
	".hg",

	// Node.js
	"node_modules",
	".next",
	".nuxt",
	".svelte-kit",
	".yarn",
	".pnp.*",
	"bower_components",

	// Python
	"venv",
	".venv",
	"__pycache__",
	".tox",
	".mypy_cache",
	".pytest_cache",
	".ruff_cache",
	".hypothesis",
	"*.egg*",
	".eggs",

	// Rust
	"target",

	// Go
	"vendor",

	// Java / JVM
	".gradle",
	"gradle",
	"build",
	"out",

	// .NET / C#
	"bin",
	"obj",
	".vs",

	// PHP
	"vendor",
	".phpunit.cache",

	// Elixir
	"_build",
	"deps",

	// Swift
	".build",
	".swiftpm",

	// Haskell
	".stack-work",
	"dist-newstyle",

	// Elm
	"elm-stuff",

	// Flutter / Dart
	".dart_tool",
	".packages",
	".flutter-plugins*",

	// IDE
	".idea",
	".vscode",

	// Coverage
	"coverage",
	".nyc_output",

	// Misc build output
	"dist",
	"target",

	// Bundle / gem
	".bundle",
	".gem",

	// Compiled / generated
	"*.pyc",
	"*.pyo",
	"*.so",
	"*.dll",
	"*.dylib",
	"*.class",
	"*.exe",
	"*.wasm",

	// Images (binary, not text)
	"*.png",
	"*.jpg",
	"*.jpeg",
	"*.gif",
	"*.ico",
	"*.svg",
	"*.webp",
	"*.avif",
	"*.bmp",

	// Archives
	"*.zip",
	"*.tar",
	"*.gz",
	"*.bz2",
	"*.7z",
	"*.rar",

	// Fonts
	"*.ttf",
	"*.otf",
	"*.woff",
	"*.woff2",
	"*.eot",

	// Media
	"*.mp3",
	"*.mp4",
	"*.avi",
	"*.mov",
	"*.wav",
	"*.ogg",
	"*.webm",
	"*.m4a",

	// Docs / data
	"*.pdf",
	"*.doc",
	"*.docx",
	"*.xls",
	"*.xlsx",
	"*.ppt",
	"*.pptx",
	"*.csv",
	"*.tsv",

	// Object files
	"*.o",
	"*.a",
	"*.lib",
	"*.obj",
	"*.pdb",
	"*.idb",

	// Environment / secrets
	".env",
	".env.*",
	"*.pem",
	"*.key",
	"*.cert",

	// Logs
	"*.log",
	"npm-debug.log*",

	// OS
	".DS_Store",
	"Thumbs.db",
	"Desktop.ini",

	// Lock files (language-specific)
	"Cargo.lock",
	"package-lock.json",
	"yarn.lock",
	"pnpm-lock.yaml",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — handles large module sources
const MAX_FILES_TO_INDEX = 10_000_000; // 10M files safety cap

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileMeta {
	path: string; // absolute path
	relativePath: string; // relative to project root
	size: number;
	mtime: number; // unix ms
	lang: string; // "typescript", "rust", etc.
	lastIndexed: number;
}

export interface CodebaseIndexerOptions {
	projectRoot: string;
	ignorePatterns?: string[];
	maxFileSize?: number;
	maxFiles?: number;
}

export interface IndexStats {
	totalFiles: number;
	totalSize: number;
	durationMs: number;
	errors: string[];
}

export interface SearchResult {
	path: string;
	relativePath: string;
	line: number;
	column: number;
	lineContent: string;
	matchLength: number;
	lang: string;
}

export interface SearchOptions {
	query: string;
	pathFilter?: string;
	maxResults?: number;
	smartCase?: boolean;
	multiline?: boolean;
	contextLines?: number;
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const LANG_MAP: Record<string, string> = {
	".ts": "typescript",
	".tsx": "typescript",
	".js": "javascript",
	".jsx": "javascript",
	".mjs": "javascript",
	".cjs": "javascript",
	".mts": "typescript",
	".cts": "typescript",
	".rs": "rust",
	".go": "go",
	".py": "python",
	".rb": "ruby",
	".java": "java",
	".kt": "kotlin",
	".scala": "scala",
	".swift": "swift",
	".c": "c",
	".h": "c",
	".cpp": "cpp",
	".hpp": "cpp",
	".cs": "csharp",
	".fs": "fsharp",
	".php": "php",
	".r": "r",
	".m": "matlab",
	".mm": "objectivec",
	".zig": "zig",
	".nim": "nim",
	".ex": "elixir",
	".exs": "elixir",
	".clj": "clojure",
	".cljs": "clojure",
	".cljc": "clojure",
	".hs": "haskell",
	".lhs": "haskell",
	".lua": "lua",
	".pl": "perl",
	".pm": "perl",
	".sh": "bash",
	".bash": "bash",
	".zsh": "bash",
	".fish": "bash",
	".ps1": "powershell",
	".psm1": "powershell",
	".sql": "sql",
	".graphql": "graphql",
	".gql": "graphql",
	".md": "markdown",
	".mdx": "markdown",
	".html": "html",
	".htm": "html",
	".css": "css",
	".scss": "scss",
	".less": "less",
	".json": "json",
	".yaml": "yaml",
	".yml": "yaml",
	".toml": "toml",
	".xml": "xml",
	".svg": "xml",
	".dockerfile": "dockerfile",
	dockerfile: "dockerfile",
	".makefile": "makefile",
	makefile: "makefile",
	".cmake": "cmake",
	".cmake.in": "cmake",
	".txt": "text",
	".log": "text",
};

function detectLang(filePath: string): string {
	const base = basename(filePath).toLowerCase();
	const ext = extname(filePath).toLowerCase();
	return LANG_MAP[ext] ?? LANG_MAP[base] ?? (ext.slice(1) || "text");
}

// ---------------------------------------------------------------------------
// Indexer
// ---------------------------------------------------------------------------

export class CodebaseIndexer {
	private root: string;
	private ignore: string[];
	private maxFileSize: number;
	private maxFiles: number;

	constructor(options: CodebaseIndexerOptions) {
		this.root = resolve(options.projectRoot);
		this.ignore = options.ignorePatterns ?? DEFAULT_IGNORE;
		this.maxFileSize = options.maxFileSize ?? MAX_FILE_SIZE;
		this.maxFiles = options.maxFiles ?? MAX_FILES_TO_INDEX;
	}

	/** Full index: walk entire project tree and cache file metadata. */
	fullIndex(onProgress?: (current: number, total: number, file: string) => void): IndexStats {
		const start = Date.now();
		const errors: string[] = [];
		let count = 0;
		let totalSize = 0;

		const files = this.walk();
		const allMeta: Record<string, FileMeta> = {};

		for (let i = 0; i < files.length && i < this.maxFiles; i++) {
			const filePath = files[i];
			try {
				const stat = statSync(filePath);
				if (stat.size > this.maxFileSize) continue;
				if (stat.size === 0) continue;

				const meta: FileMeta = {
					path: filePath,
					relativePath: relative(this.root, filePath).split(sep).join("/"),
					size: stat.size,
					mtime: stat.mtimeMs,
					lang: detectLang(filePath),
					lastIndexed: Date.now(),
				};
				allMeta[filePath] = meta;
				count++;
				totalSize += stat.size;
				onProgress?.(i + 1, Math.min(files.length, this.maxFiles), meta.relativePath);
			} catch {
				errors.push(filePath);
			}
		}

		this.writeAllMeta(allMeta);
		const durationMs = Date.now() - start;
		return { totalFiles: count, totalSize, durationMs, errors };
	}

	/**
	 * Async batched index — runs in chunks so the event loop stays responsive.
	 * Yields via setTimeout after each batch so the UI can update.
	 */
	async batchedIndex(
		batchSize = 100,
		onProgress?: (current: number, total: number, file: string) => void,
	): Promise<IndexStats> {
		const start = Date.now();
		const errors: string[] = [];
		let count = 0;
		let totalSize = 0;

		const files = this.walk();
		const total = Math.min(files.length, this.maxFiles);
		const allMeta: Record<string, FileMeta> = {};

		for (let batchStart = 0; batchStart < total; batchStart += batchSize) {
			const batchEnd = Math.min(batchStart + batchSize, total);

			for (let i = batchStart; i < batchEnd; i++) {
				const filePath = files[i];
				try {
					const stat = statSync(filePath);
					if (stat.size > this.maxFileSize) continue;
					if (stat.size === 0 && !this.isSourceFile(filePath)) continue;

					const meta: FileMeta = {
						path: filePath,
						relativePath: relative(this.root, filePath).split(sep).join("/"),
						size: stat.size,
						mtime: stat.mtimeMs,
						lang: detectLang(filePath),
						lastIndexed: Date.now(),
					};
					allMeta[filePath] = meta;
					count++;
					totalSize += stat.size;
					onProgress?.(i + 1, total, meta.relativePath);
				} catch {
					errors.push(filePath);
				}
			}

			// Yield to event loop so UI stays responsive
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		}

		this.writeAllMeta(allMeta);
		const durationMs = Date.now() - start;
		return { totalFiles: count, totalSize, durationMs, errors };
	}

	/** Incremental index: only scan/update changed files. */
	incrementalIndex(onProgress?: (current: number, total: number, file: string) => void): IndexStats {
		const start = Date.now();
		const errors: string[] = [];
		let count = 0;
		let totalSize = 0;

		const allFiles = this.walk();
		const existing = this.loadAllMeta();

		// Remove files that no longer exist on disk
		const validPaths = new Set(allFiles);
		for (const [path] of Object.entries(existing)) {
			if (!validPaths.has(path)) {
				delete existing[path];
			}
		}

		// Scan for new/changed files
		for (let i = 0; i < allFiles.length && i < this.maxFiles; i++) {
			const filePath = allFiles[i];
			try {
				const stat = statSync(filePath);
				if (stat.size > this.maxFileSize) continue;
				if (stat.size === 0 && !this.isSourceFile(filePath)) continue;

				const existingMeta = existing[filePath];
				if (existingMeta && existingMeta.mtime === stat.mtimeMs && existingMeta.size === stat.size) {
					continue; // unchanged
				}

				existing[filePath] = {
					path: filePath,
					relativePath: relative(this.root, filePath).split(sep).join("/"),
					size: stat.size,
					mtime: stat.mtimeMs,
					lang: detectLang(filePath),
					lastIndexed: Date.now(),
				};
				count++;
				totalSize += stat.size;
				onProgress?.(i + 1, allFiles.length, existing[filePath]!.relativePath);
			} catch {
				errors.push(filePath);
			}
		}

		this.writeAllMeta(existing);
		const durationMs = Date.now() - start;
		return { totalFiles: count, totalSize, durationMs, errors };
	}

	/**
	 * Auto-watch mode: every 60 seconds check for changed/new/deleted files
	 * and re-index only the diffs. Returns the timer so the caller can stop it.
	 */
	startAutoWatch(intervalMs = 60_000): NodeJS.Timeout {
		const timer = setInterval(() => {
			try {
				const result = this.incrementalIndex();
				if (result.totalFiles > 0) {
					// Write happened inside incrementalIndex; just log for now
					// (the UI-based progress is handled by the caller)
				}
			} catch {
				// Silently retry next cycle
			}
		}, intervalMs);
		// Unref so it doesn't keep the process alive
		if (typeof timer === "object" && "unref" in timer) timer.unref();
		return timer;
	}

	/** Search codebase using ripgrep. */
	search(options: SearchOptions): SearchResult[] {
		const { query, pathFilter, maxResults = 20, smartCase = true, contextLines = 0 } = options;

		const args: string[] = [
			"--json", // JSON output for easy parsing
			"--max-count",
			"50", // max matches per file
			"--fixed-strings", // treat query as literal (not regex)
		];

		if (smartCase) args.push("--smart-case");
		if (contextLines > 0) args.push("--context", String(contextLines));
		if (pathFilter) {
			args.push("--glob", pathFilter);
		} else {
			// Skip common non-source dirs
			for (const p of this.ignore) {
				if (!p.startsWith("*")) args.push("--glob", `!${p}`);
			}
		}

		args.push("--", query, this.root);

		try {
			const result = this.execRipgrep(args);
			return this.parseResults(result, maxResults);
		} catch {
			return [];
		}
	}

	/** Get total indexed file count. */
	getStats(): { totalFiles: number; totalSize: number } {
		const meta = this.loadAllMeta();
		let totalSize = 0;
		for (const m of Object.values(meta)) totalSize += m.size;
		return { totalFiles: Object.keys(meta).length, totalSize };
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	private isSourceFile(filePath: string): boolean {
		const ext = extname(filePath).toLowerCase();
		return Object.keys(LANG_MAP).includes(ext);
	}

	/** Walk project tree, collect all files (respecting ignore list). */
	private walk(): string[] {
		const results: string[] = [];
		const queue = [this.root];

		while (queue.length > 0) {
			const dir = queue.shift()!;
			let entries: Dirent[];
			try {
				entries = readdirSync(dir, { withFileTypes: true });
			} catch {
				continue;
			}

			for (const entry of entries) {
				const fullPath = join(dir, entry.name);
				const rel = relative(this.root, fullPath).split(sep).join("/");

				if (this.shouldIgnore(rel, entry.isDirectory())) continue;

				if (entry.isDirectory()) {
					queue.push(fullPath);
				} else if (entry.isFile()) {
					results.push(fullPath);
				}
			}
		}

		return results;
	}

	private shouldIgnore(relPath: string, isDir: boolean): boolean {
		const segments = relPath.split("/");
		const basename = segments[segments.length - 1] ?? "";
		for (const pattern of this.ignore) {
			if (pattern.includes("*")) {
				const re = new RegExp(
					"^" +
						pattern
							.replace(/[.+^${}()|[\]\\]/g, "\\$&")
							.replace(/\?/g, ".")
							.replace(/\*/g, ".*") +
						"$",
				);
				if (!isDir && re.test(basename)) return true;
				continue;
			}
			if (segments.includes(pattern)) return true;
			if (relPath === pattern || relPath.startsWith(`${pattern}/`)) return true;
		}
		return false;
	}

	// -------------------------------------------------------------------------
	// Persistence
	// -------------------------------------------------------------------------

	private get indexDir(): string {
		return join(this.root, ".pi", "index");
	}

	private get metaFile(): string {
		return join(this.indexDir, "files.json");
	}

	private ensureDir(): void {
		mkdirSync(this.indexDir, { recursive: true });
	}

	private loadAllMeta(): Record<string, FileMeta> {
		try {
			if (!existsSync(this.metaFile)) return {};
			const raw = readFileSync(this.metaFile, "utf-8");
			return JSON.parse(raw);
		} catch {
			return {};
		}
	}

	private writeAllMeta(all: Record<string, FileMeta>): void {
		this.ensureDir();
		writeFileSync(this.metaFile, JSON.stringify(all));
	}

	// -------------------------------------------------------------------------
	// ripgrep execution + parsing
	// -------------------------------------------------------------------------

	private execRipgrep(args: string[]): string {
		const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
		const proc = spawnSync("rg", args, { cwd: this.root, maxBuffer: 10 * 1024 * 1024 });
		return proc.stdout?.toString() ?? "";
	}

	private parseResults(raw: string, maxResults: number): SearchResult[] {
		if (!raw.trim()) return [];

		const results: SearchResult[] = [];
		const lines = raw.split("\n");

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const parsed = JSON.parse(line);
				if (parsed.type !== "match") continue;

				const data = parsed.data;
				const path = data.path?.text ?? "";
				const sub = data.subMatches?.[0];
				if (!sub) continue;

				results.push({
					path,
					relativePath: relative(this.root, path).split(sep).join("/") || path,
					line: data.line_number,
					column: sub.start + 1,
					lineContent: data.lines?.text?.replace(/\n$/, "") ?? "",
					matchLength: sub.end - sub.start,
					lang: detectLang(path),
				});

				if (results.length >= maxResults) break;
			} catch {}
		}

		return results;
	}
}

/** Convenience: create indexer for current project. */
export function createCodebaseIndexer(projectRoot: string): CodebaseIndexer {
	return new CodebaseIndexer({ projectRoot });
}
