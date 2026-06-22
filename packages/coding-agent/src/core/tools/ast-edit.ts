import { createInterface } from "node:readline";
import type { AgentTool } from "@earendil-works/pie-agent-core";
import { Text } from "@earendil-works/pie-tui";
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

const astEditSchema = Type.Object({
	pattern: Type.String({ description: "AST pattern to match using tree-sitter pattern syntax" }),
	rewrite: Type.String({ description: "Replacement pattern using ast-grep metavariables" }),
	lang: Type.Optional(
		Type.String({
			description:
				"Language to parse (e.g. typescript, python, rust, go, java, javascript, c, cpp). Required unless pattern is language-agnostic.",
		}),
	),
	kind: Type.Optional(
		Type.String({
			description:
				"AST node kind to match (ESQuery-style selector, e.g. function_declaration, call_expression, class_declaration, method_definition).",
		}),
	),
	selector: Type.Optional(
		Type.String({ description: "AST kind to extract as the actual matcher from the matched pattern." }),
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
			{ description: "Pattern strictness. Default: smart." },
		),
	),
	paths: Type.Optional(Type.Array(Type.String(), { description: "Existing files or directories to rewrite" })),
	globs: Type.Optional(
		Type.Array(Type.String(), {
			description: "Glob patterns to include/exclude files. Precede with ! to exclude.",
		}),
	),
	limit: Type.Optional(
		Type.Number({ description: "Maximum number of matches allowed before refusing (default: 50)" }),
	),
	mode: Type.Optional(
		Type.Union([Type.Literal("preview"), Type.Literal("apply")], {
			description: "preview shows the rewrite diff without writing files; apply writes changes. Default: preview.",
		}),
	),
});

export type AstEditToolInput = Static<typeof astEditSchema>;
const DEFAULT_LIMIT = 50;

export interface AstEditToolDetails {
	mode: "preview" | "apply";
	matchCount: number;
	truncation?: TruncationResult;
	matchLimitReached?: number;
}

export interface AstEditToolOptions {
	/** Reserved for future custom operations. */
	operations?: Record<string, never>;
}

type AstEditMode = "preview" | "apply";

type AstEditRunOptions = {
	pattern: string;
	rewrite?: string;
	lang?: string;
	kind?: string;
	selector?: string;
	strictness?: string;
	paths?: string[];
	globs?: string[];
	updateAll?: boolean;
	json?: boolean;
};

function formatAstEditCall(args: AstEditToolInput | undefined, theme: Theme): string {
	const pattern = str(args?.pattern);
	const rewrite = str(args?.rewrite);
	const invalidArg = invalidArgText(theme);
	const mode = args?.mode ?? "preview";
	let text =
		theme.fg("toolTitle", theme.bold("ast_edit")) +
		" " +
		(pattern === null ? invalidArg : theme.fg("accent", `/${pattern || ""}/`)) +
		theme.fg("toolOutput", " -> ") +
		(rewrite === null ? invalidArg : theme.fg("accent", `/${rewrite || ""}/`));
	if (args?.lang) text += theme.fg("toolOutput", ` (${args.lang})`);
	if (args?.paths?.length) text += theme.fg("toolOutput", ` in ${args.paths.map((p) => shortenPath(p)).join(", ")}`);
	text += theme.fg(mode === "apply" ? "warning" : "muted", ` [${mode}]`);
	return text;
}

function formatAstEditResult(
	result: {
		content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		details?: AstEditToolDetails;
	},
	options: ToolRenderResultOptions,
	theme: Theme,
	showImages: boolean,
): string {
	const output = getTextOutput(result, showImages).trim();
	let text = "";
	if (output) {
		const lines = output.split("\n");
		const maxLines = options.expanded ? lines.length : 30;
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

function buildAstGrepArgs(options: AstEditRunOptions): string[] {
	const args: string[] = ["run", "--color=never"];
	if (options.json) args.push("--json=stream");
	args.push("-p", options.pattern);
	if (options.rewrite !== undefined) args.push("--rewrite", options.rewrite);
	if (options.lang) args.push("-l", options.lang);
	if (options.kind) args.push("-k", options.kind);
	if (options.selector) args.push("--selector", options.selector);
	if (options.strictness) args.push("--strictness", options.strictness);
	if (options.globs) {
		for (const glob of options.globs) args.push("--globs", glob);
	}
	args.push("--heading", "never", "--no-ignore", "hidden");
	if (options.updateAll) args.push("--update-all");
	for (const path of options.paths ?? ["."]) args.push(path);
	return args;
}

function runAstGrep(sgPath: string, args: string[], signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}
		const child = spawn(sgPath, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		const onAbort = () => child.kill();
		signal?.addEventListener("abort", onAbort, { once: true });
		child.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			signal?.removeEventListener("abort", onAbort);
			reject(new Error(`Failed to run ast-grep: ${error.message}`));
		});
		child.on("close", (code) => {
			signal?.removeEventListener("abort", onAbort);
			if (signal?.aborted) {
				reject(new Error("Operation aborted"));
				return;
			}
			if (code !== 0) {
				reject(new Error(stderr.trim() || `ast-grep exited with code ${code}`));
				return;
			}
			resolve({ stdout, stderr });
		});
	});
}

function countMatches(
	sgPath: string,
	options: AstEditRunOptions,
	limit: number,
	signal?: AbortSignal,
): Promise<number> {
	return new Promise((resolve, reject) => {
		const args = buildAstGrepArgs({ ...options, rewrite: undefined, updateAll: false, json: true });
		const child = spawn(sgPath, args, { stdio: ["ignore", "pipe", "pipe"] });
		const rl = createInterface({ input: child.stdout });
		let stderr = "";
		let count = 0;
		let killedDueToLimit = false;
		const onAbort = () => child.kill();
		signal?.addEventListener("abort", onAbort, { once: true });
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		rl.on("line", (line) => {
			if (!line.trim()) return;
			try {
				JSON.parse(line);
			} catch {
				return;
			}
			count++;
			if (count > limit && !child.killed) {
				killedDueToLimit = true;
				child.kill();
			}
		});
		child.on("error", (error) => {
			rl.close();
			signal?.removeEventListener("abort", onAbort);
			reject(new Error(`Failed to run ast-grep: ${error.message}`));
		});
		child.on("close", (code) => {
			rl.close();
			signal?.removeEventListener("abort", onAbort);
			if (signal?.aborted) {
				reject(new Error("Operation aborted"));
				return;
			}
			if (!killedDueToLimit && code !== 0 && code !== 1) {
				reject(new Error(stderr.trim() || `ast-grep exited with code ${code}`));
				return;
			}
			resolve(count);
		});
	});
}

export function createAstEditToolDefinition(
	cwd: string,
	_options?: AstEditToolOptions,
): ToolDefinition<typeof astEditSchema, AstEditToolDetails | undefined> {
	return {
		name: "ast_edit",
		label: "ast_edit",
		description: `Rewrite existing code by AST pattern using ast-grep. Use for structural rewrites such as multiline call replacements, import rewrites, assertion migrations, argument swaps, JSX attribute rewrites, enum/member access rewrites, and function signature changes. Do not use for simple text replacements, comments/JSDoc, formatting, creating files, or deleting files. Defaults to preview mode; use mode='apply' only when the rewrite should be written to disk. Refuses to run if matches exceed limit (default ${DEFAULT_LIMIT}).`,
		promptSnippet: "Rewrite code by AST pattern (syntax-aware structural edit)",
		promptGuidelines: [
			"Use ast_edit for structural rewrites where code shape matters, especially multiline call rewrites, import rewrites, argument swaps, JSX attributes, enum/member access, and signature changes.",
			"Use edit instead for single exact text changes, comments/JSDoc, line-number changes, creating/deleting content by position, or plain string replacements.",
			"Default to mode='preview' unless the user explicitly asked to apply the rewrite. Use mode='apply' only after the intended rewrite is clear.",
			"Always set lang when possible (e.g. typescript, javascript, python) and narrow paths/globs for broad rewrites.",
			"Pattern examples: pattern 'console.log($A)' rewrite 'logger.info($A)'; pattern 'assertEqual($A, $B)' rewrite 'assertEqual($B, $A)'; pattern 'import { $$$ } from \"old\"' rewrite 'import { $$$ } from \"new\"'.",
		],
		parameters: astEditSchema,
		async execute(
			_toolCallId,
			{ pattern, rewrite, lang, kind, selector, strictness, paths, globs, limit, mode }: AstEditToolInput,
			signal?: AbortSignal,
			_onUpdate?,
			_ctx?,
		) {
			const sgPath = await ensureTool("sg", true);
			if (!sgPath) {
				throw new Error(
					"ast-grep is not available and could not be downloaded. Install manually: cargo install ast-grep or npm install -g @ast-grep/cli",
				);
			}
			const resolvedPaths = paths && paths.length > 0 ? paths.map((p) => resolveToCwd(p, cwd)) : ["."];
			const effectiveLimit = Math.max(1, limit ?? DEFAULT_LIMIT);
			const effectiveMode: AstEditMode = mode ?? "preview";
			const runOptions: AstEditRunOptions = {
				pattern,
				rewrite,
				lang,
				kind,
				selector,
				strictness,
				paths: resolvedPaths,
				globs,
			};

			const matchCount = await countMatches(sgPath, runOptions, effectiveLimit, signal);
			if (matchCount === 0) {
				return {
					content: [{ type: "text", text: "No matches found" }],
					details: { mode: effectiveMode, matchCount },
				};
			}
			if (matchCount > effectiveLimit) {
				throw new Error(
					`ast_edit matched more than ${effectiveLimit} node(s). Refine pattern/path/globs or increase limit before applying.`,
				);
			}

			const args = buildAstGrepArgs({ ...runOptions, updateAll: effectiveMode === "apply" });
			const { stdout } = await runAstGrep(sgPath, args, signal);
			const summary =
				effectiveMode === "apply"
					? `Applied AST rewrite to ${matchCount} match(es).`
					: `Preview AST rewrite for ${matchCount} match(es). No files were modified.`;
			const rawOutput = stdout.trim() ? `${summary}\n\n${stdout.trim()}` : summary;
			const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
			let output = truncation.content;
			const details: AstEditToolDetails = { mode: effectiveMode, matchCount };
			if (truncation.truncated) {
				output += `\n\n[${formatSize(DEFAULT_MAX_BYTES)} limit reached]`;
				details.truncation = truncation;
			}
			return {
				content: [{ type: "text", text: output }],
				details,
			};
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatAstEditCall(args, theme));
			return text;
		},
		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatAstEditResult(result as never, options, theme, context.showImages));
			return text;
		},
	};
}

export function createAstEditTool(cwd: string, options?: AstEditToolOptions): AgentTool<typeof astEditSchema> {
	return wrapToolDefinition(createAstEditToolDefinition(cwd, options));
}
