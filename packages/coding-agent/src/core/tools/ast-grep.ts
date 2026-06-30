import { createInterface } from "node:readline";
import type { AgentTool } from "@codevaani7838/pie-agent-core";
import { Text } from "@codevaani7838/pie-tui";
import { spawn } from "child_process";
import { type Static, Type } from "typebox";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.ts";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import { ensureTool } from "../../utils/tools-manager.ts";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { resolveToCwd } from "./path-utils.ts";
import { getTextOutput, invalidArgText, shortenPath, str } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";
import { DEFAULT_MAX_BYTES, formatSize, type TruncationResult, truncateHead } from "./truncate.ts";

const astGrepSchema = Type.Object({
	pattern: Type.String({ description: "AST pattern to match using tree-sitter pattern syntax" }),
	lang: Type.Optional(
		Type.String({
			description:
				"Language to parse (e.g. typescript, python, rust, go, java, javascript, c, cpp). Required unless pattern is language-agnostic.",
		}),
	),
	kind: Type.Optional(
		Type.String({
			description:
				"AST node kind to match (ESQuery-style selector, e.g. function_declaration, call_expression, class_declaration, method_definition, arrow_function). See ast-grep reference for full kind list per language.",
		}),
	),
	selector: Type.Optional(
		Type.String({
			description:
				"AST kind to extract a sub-part of the matched pattern. Defines which sub-syntax node kind is the actual matcher.",
		}),
	),
	strictness: Type.Optional(
		Type.Union(
			[
				Type.Literal("cst"),
				Type.Literal("smart"),
				Type.Literal("ast"),
				Type.Literal("relaxed"),
				Type.Literal("signature"),
				Type.Literal("template"),
			],
			{
				description:
					"Pattern strictness: cst (exact), smart (match all except trivial), ast (AST nodes only), relaxed (AST without comments), signature (without comments/text), template (match text only). Default: smart.",
			},
		),
	),
	paths: Type.Optional(Type.Array(Type.String(), { description: "Paths to search (default: current directory)" })),
	globs: Type.Optional(
		Type.Array(Type.String(), {
			description:
				"Glob patterns to include/exclude files. Precede with ! to exclude. Example: ['*.ts', '!*.spec.ts']",
		}),
	),
	context: Type.Optional(
		Type.Number({ description: "Number of context lines before and after each match (default: 0)" }),
	),
	limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return (default: 50)" })),
});

export type AstGrepToolInput = Static<typeof astGrepSchema>;
const DEFAULT_LIMIT = 50;

export interface AstGrepToolDetails {
	truncation?: TruncationResult;
	matchLimitReached?: number;
}

function formatAstGrepCall(args: AstGrepToolInput | undefined, theme: Theme): string {
	const pattern = str(args?.pattern);
	const lang = str(args?.lang);
	const kind = str(args?.kind);
	const invalidArg = invalidArgText(theme);

	let text =
		theme.fg("toolTitle", theme.bold("ast_grep")) +
		" " +
		(pattern === null ? invalidArg : theme.fg("accent", `/${pattern || ""}/`));
	if (lang) text += theme.fg("toolOutput", ` (${lang})`);
	if (kind) text += theme.fg("toolOutput", ` kind:${kind}`);
	if (args?.paths?.length) {
		const pathStr = args.paths.map((p) => shortenPath(p)).join(", ");
		text += theme.fg("toolOutput", ` in ${pathStr}`);
	}
	return text;
}

function formatAstGrepResult(
	result: {
		content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		details?: AstGrepToolDetails;
	},
	options: ToolRenderResultOptions,
	theme: Theme,
	showImages: boolean,
): string {
	const output = getTextOutput(result, showImages).trim();
	let text = "";
	if (output) {
		const lines = output.split("\n");
		const maxLines = options.expanded ? lines.length : 20;
		const displayLines = lines.slice(0, maxLines);
		const remaining = lines.length - maxLines;
		text += `\n${displayLines.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
		if (remaining > 0) {
			text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")}${theme.fg("muted", ")")}`;
		}
	}

	const matchLimit = result.details?.matchLimitReached;
	const truncation = result.details?.truncation;
	if (matchLimit || truncation?.truncated) {
		const warnings: string[] = [];
		if (matchLimit) warnings.push(`${matchLimit} matches limit`);
		if (truncation?.truncated) warnings.push(`${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit`);
		text += `\n${theme.fg("warning", `[Truncated: ${warnings.join(", ")}]`)}`;
	}
	return text;
}

/**
 * Parse ast-grep JSON stream output into human-readable lines.
 * Each line from ast-grep --json=stream is a JSON object with file match info.
 */
function parseAstGrepJsonStream(lines: string[]): { outputLines: string[]; matchCount: number } {
	const outputLines: string[] = [];
	let matchCount = 0;

	for (const rawLine of lines) {
		if (!rawLine.trim()) continue;
		let parsed: any;
		try {
			parsed = JSON.parse(rawLine);
		} catch {
			continue;
		}

		const filePath = parsed.file;
		if (!filePath) continue;

		matchCount++;
		const start = parsed.range?.start;
		const lineNumber = typeof start?.line === "number" ? start.line + 1 : 1;
		const col = typeof start?.column === "number" ? start.column + 1 : 1;
		const textMatch = typeof parsed.text === "string" ? parsed.text.replace(/\r/g, "") : "";
		const firstLine = textMatch.split("\n")[0] ?? "";
		outputLines.push(`${filePath}:${lineNumber}:${col}: ${firstLine}`);

		const linesText = typeof parsed.lines === "string" ? parsed.lines.replace(/\r/g, "") : "";
		if (linesText.includes("\n")) {
			for (const line of linesText.split("\n")) {
				if (line.length === 0) continue;
				outputLines.push(`  ${line}`);
			}
			outputLines.push("");
		}
	}

	return { outputLines, matchCount };
}

export function createAstGrepToolDefinition(
	cwd: string,
): ToolDefinition<typeof astGrepSchema, AstGrepToolDetails | undefined> {
	return {
		name: "ast_grep",
		label: "ast_grep",
		description: `Search code by AST pattern using ast-grep. Understands code structure (not just text), enabling multiline patterns, function/class signatures, call expressions, decorators, imports, and other syntax-aware queries. Supports TypeScript, JavaScript, Python, Rust, Go, Java, C, C++, and more. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
		promptSnippet: "Search code by AST pattern (syntax-aware code search)",
		promptGuidelines: [
			"Use ast_grep for syntax-aware code search: function/class/method declarations, call expressions (including multiline), decorators, imports, exports, and any pattern where code structure matters.",
			"Use ripgrep instead when searching for plain text, regex patterns, comments, strings, or simple identifier occurrences.",
			"Specify the lang parameter for best results (e.g. typescript, python, rust). The pattern syntax matches the target language's tree-sitter grammar.",
			"Use kind to narrow to specific AST node types (e.g. kind:'function_declaration', kind:'call_expression', kind:'class_declaration').",
			"Use globs to scope to specific file patterns (e.g. ['*.ts']).",
			"Pattern examples: 'console.log($A)' finds all console.log calls (multiline supported); 'function $NAME($PARAMS) { $$$ }' finds all function declarations; 'class $NAME { $$$ }' finds all classes.",
		],
		parameters: astGrepSchema,
		async execute(
			_toolCallId,
			{
				pattern,
				lang,
				kind,
				selector,
				strictness,
				paths,
				globs,
				limit,
			}: {
				pattern: string;
				lang?: string;
				kind?: string;
				selector?: string;
				strictness?: string;
				paths?: string[];
				globs?: string[];
				limit?: number;
			},
			signal?: AbortSignal,
			_onUpdate?,
			_ctx?,
		) {
			return new Promise((resolve, reject) => {
				if (signal?.aborted) {
					reject(new Error("Operation aborted"));
					return;
				}
				let settled = false;
				const settle = (fn: () => void) => {
					if (!settled) {
						settled = true;
						fn();
					}
				};

				(async () => {
					try {
						const sgPath = await ensureTool("sg", true);
						if (!sgPath) {
							settle(() =>
								reject(
									new Error(
										"ast-grep (sg) is not available and could not be downloaded. Install manually: cargo install ast-grep or npm install -g @ast-grep/cli",
									),
								),
							);
							return;
						}

						// Resolve search paths relative to cwd.
						const searchPaths = paths && paths.length > 0 ? paths.map((p) => resolveToCwd(p, cwd)) : ["."];

						const effectiveLimit = Math.max(1, limit ?? DEFAULT_LIMIT);

						// Build ast-grep args.
						const args: string[] = ["run", "--json=stream", "--color=never"];

						// Add pattern (required by ast-grep).
						if (pattern) {
							args.push("-p", pattern);
						}

						// Add language.
						if (lang) {
							args.push("-l", lang);
						}

						// Add ESQuery-style kind.
						if (kind) {
							args.push("-k", kind);
						}

						// Add selector.
						if (selector) {
							args.push("--selector", selector);
						}

						// Add strictness.
						if (strictness) {
							args.push("--strictness", strictness);
						}

						// Add glob filters.
						if (globs && globs.length > 0) {
							for (const g of globs) {
								args.push("--globs", g);
							}
						}

						// No heading, no interactive, no color.
						args.push("--heading", "never");

						// Add limit via glom (ast-grep doesn't have a native --max-matches,
						// but we handle it client-side via output parsing).
						// We use --no-ignore hidden to find hidden files like rg --hidden.
						args.push("--no-ignore", "hidden");

						// Add search paths at the end.
						for (const sp of searchPaths) {
							args.push(sp);
						}

						const child = spawn(sgPath, args, { stdio: ["ignore", "pipe", "pipe"] });
						const rl = createInterface({ input: child.stdout });
						let stderr = "";
						let matchCount = 0;
						let matchLimitReached = false;
						let killedDueToLimit = false;
						const jsonLines: string[] = [];

						const cleanup = () => {
							rl.close();
							signal?.removeEventListener("abort", onAbort);
						};
						const stopChild = () => {
							if (!child.killed) {
								child.kill();
							}
						};
						const onAbort = () => {
							stopChild();
						};
						signal?.addEventListener("abort", onAbort, { once: true });

						child.stderr?.on("data", (chunk) => {
							stderr += chunk.toString();
						});

						rl.on("line", (line) => {
							if (!line.trim()) return;
							// Stop collecting once we hit the limit.
							if (matchCount >= effectiveLimit) {
								if (!killedDueToLimit) {
									matchLimitReached = true;
									killedDueToLimit = true;
									stopChild();
								}
								return;
							}
							try {
								JSON.parse(line);
							} catch {
								return;
							}
							matchCount++;
							jsonLines.push(line);
							if (matchCount >= effectiveLimit) {
								matchLimitReached = true;
								killedDueToLimit = true;
								stopChild();
							}
						});

						child.on("error", (error) => {
							cleanup();
							settle(() => reject(new Error(`Failed to run ast-grep: ${error.message}`)));
						});

						child.on("close", (code) => {
							cleanup();
							if (signal?.aborted) {
								settle(() => reject(new Error("Operation aborted")));
								return;
							}
							if (!killedDueToLimit && code !== 0) {
								const errorMsg = stderr.trim() || `ast-grep exited with code ${code}`;
								settle(() => reject(new Error(errorMsg)));
								return;
							}
							if (jsonLines.length === 0) {
								settle(() =>
									resolve({ content: [{ type: "text", text: "No matches found" }], details: undefined }),
								);
								return;
							}

							const { outputLines: parsedLines } = parseAstGrepJsonStream(jsonLines);
							if (parsedLines.length === 0) {
								settle(() =>
									resolve({ content: [{ type: "text", text: "No matches found" }], details: undefined }),
								);
								return;
							}

							const rawOutput = parsedLines.join("\n");
							const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
							let output = truncation.content;
							const details: AstGrepToolDetails = {};
							const notices: string[] = [];
							if (matchLimitReached) {
								notices.push(
									`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
								);
								details.matchLimitReached = effectiveLimit;
							}
							if (truncation.truncated) {
								notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
								details.truncation = truncation;
							}
							if (notices.length > 0) output += `\n\n[${notices.join(". ")}]`;

							settle(() =>
								resolve({
									content: [{ type: "text", text: output }],
									details: Object.keys(details).length > 0 ? details : undefined,
								}),
							);
						});
					} catch (err) {
						settle(() => reject(err as Error));
					}
				})();
			});
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatAstGrepCall(args, theme));
			return text;
		},
		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatAstGrepResult(result as any, options, theme, context.showImages));
			return text;
		},
	};
}

export function createAstGrepTool(cwd: string): AgentTool<typeof astGrepSchema> {
	return wrapToolDefinition(createAstGrepToolDefinition(cwd));
}
