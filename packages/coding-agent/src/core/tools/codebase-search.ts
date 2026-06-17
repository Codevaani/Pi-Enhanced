import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import { rerankBySimilarity } from "../codebase-embeddings.ts";
import { CodebaseIndexer, type SearchResult } from "../codebase-indexer.ts";
import type {
	AgentToolResult,
	ToolDefinition,
	ToolRenderContext,
	ToolRenderResultOptions,
} from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

// =========================================================================
// Schema
// =========================================================================

const codebaseSearchSchema = Type.Object({
	query: Type.String({ description: "Search query (literal text, not regex)" }),
	semantic: Type.Optional(
		Type.Boolean({
			description:
				"Enable semantic reranking using an embedding model. " +
				"First use downloads ~25MB model to ~/.cache/huggingface/. " +
				"Can return different results than exact keyword search. (default: false)",
		}),
	),
	path_filter: Type.Optional(
		Type.String({
			description: "Optional glob filter (e.g. 'src/**/*.ts') to narrow search scope",
		}),
	),
	max_results: Type.Optional(
		Type.Number({
			description: "Maximum results to return (default: 10, max: 50)",
		}),
	),
	context_lines: Type.Optional(
		Type.Number({
			description: "Number of context lines around each match (default: 0)",
		}),
	),
});

export type { SearchResult };
export type CodebaseSearchInput = Static<typeof codebaseSearchSchema>;

const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS_LIMIT = 50;

// =========================================================================
// Rendering
// =========================================================================

function formatCodebaseSearchCall(args: CodebaseSearchInput, theme: Theme): string {
	const parts = [theme.fg("toolTitle", theme.bold("codebase_search")), `"${args.query}"`];
	if (args.semantic) parts.push(theme.fg("accent", "(semantic)"));
	if (args.path_filter) parts.push(theme.fg("dim", `in ${args.path_filter}`));
	return parts.join(" ");
}

function formatCodebaseSearchResult(
	result: AgentToolResult<{ results: SearchResult[]; totalResults: number }>,
	_options: ToolRenderResultOptions,
	theme: Theme,
): string {
	const details = result.details;
	if (!details || details.results.length === 0) {
		return theme.fg("dim", "No results found");
	}

	const lines: string[] = [];
	const { results, totalResults } = details;
	lines.push(
		theme.fg("muted", `${results.length} result${results.length === 1 ? "" : "s"}`) +
			(totalResults > results.length
				? theme.fg("dim", ` (${totalResults} total, reranked top ${results.length})`)
				: ""),
	);

	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		if (i > 0) lines.push("");
		const idx = theme.fg("accent", `${i + 1}.`);
		const filePath = theme.fg("text", r.relativePath);
		const lineNo = theme.fg("dim", `:${r.line}:${r.column}`);
		const lang = theme.fg("dim", ` [${r.lang}]`);
		lines.push(`${idx} ${filePath}${lineNo}${lang}`);
		lines.push(`   ${theme.fg("muted", r.lineContent.trimEnd() ?? "")}`);
	}

	return lines.join("\n");
}

// =========================================================================
// Tool Definition
// =========================================================================

export function createCodebaseSearchToolDefinition(
	cwd: string,
): ToolDefinition<typeof codebaseSearchSchema, { results: SearchResult[]; totalResults: number }> {
	const indexer = new CodebaseIndexer({ projectRoot: cwd });

	return {
		name: "codebase_search",
		label: "codebase_search",
		description:
			`ALWAYS use codebase_search before answering ANY question about the project codebase. ` +
			`Do NOT rely on training data — the project may have changed. ` +
			`Searches the project. Supports glob filters and optional semantic reranking.`,
		promptSnippet: "ALWAYS search codebase for code questions — do NOT rely on memory",
		promptGuidelines: [
			"CRITICAL: For ANY question about project code, ALWAYS start with codebase_search. Do NOT answer from training data.",
			"If you need to understand code structure, call codebase_search first, then read the relevant files.",
			"Use semantic:true for natural language queries like 'authentication' or 'error handling'.",
			"Use path_filter to narrow to specific directories (e.g. 'src/**/*.ts').",
		],
		parameters: codebaseSearchSchema,
		async execute(
			_toolCallId: string,
			params: CodebaseSearchInput,
			_signal: AbortSignal | undefined,
			_onUpdate: any,
			_ctx: any,
		): Promise<AgentToolResult<{ results: SearchResult[]; totalResults: number }>> {
			const query = params.query.trim();
			if (!query) {
				return {
					content: [{ type: "text", text: "Error: query cannot be empty" }],
					details: { results: [], totalResults: 0 },
				};
			}

			const maxResults = Math.min(
				MAX_RESULTS_LIMIT,
				Math.max(1, Math.floor(params.max_results ?? DEFAULT_MAX_RESULTS)),
			);
			const useSemantic = params.semantic ?? false;

			try {
				// Step 1: Keyword search via rg (always runs first)
				const results = indexer.search({
					query,
					pathFilter: params.path_filter,
					maxResults: useSemantic ? 50 : maxResults, // get more for reranking
					contextLines: params.context_lines ?? 0,
				});

				let finalResults = results;

				// Step 2: Semantic reranking (optional)
				if (useSemantic && results.length > 0) {
					try {
						finalResults = await rerankBySimilarity(query, results, maxResults);
					} catch (_e: any) {
						// Embedding failed — fall back to keyword results
						finalResults = results.slice(0, maxResults);
					}
				}

				const displayResults = finalResults.slice(0, maxResults);

				// Build readable text for the LLM
				const textLines: string[] = [];
				for (const r of displayResults) {
					textLines.push(`${r.relativePath}:${r.line}:${r.column}  ${r.lineContent.trimEnd() ?? ""}`);
				}
				const text = textLines.length > 0 ? textLines.join("\n") : "No results found";

				return {
					content: [{ type: "text", text }],
					details: {
						results: displayResults,
						totalResults: results.length,
					},
				};
			} catch (e: any) {
				return {
					content: [{ type: "text", text: `Error: ${e?.message ?? String(e)}` }],
					details: { results: [], totalResults: 0 },
				};
			}
		},
		renderCall(args: CodebaseSearchInput, theme: Theme, _context: ToolRenderContext): Text {
			return new Text(formatCodebaseSearchCall(args, theme), 0, 0);
		},
		renderResult(
			result: AgentToolResult<{ results: SearchResult[]; totalResults: number }>,
			options: ToolRenderResultOptions,
			theme: Theme,
			_context: ToolRenderContext,
		): Text {
			return new Text(formatCodebaseSearchResult(result, options, theme), 0, 0);
		},
	};
}

export function createCodebaseSearchTool(cwd: string): AgentTool<typeof codebaseSearchSchema> {
	return wrapToolDefinition(createCodebaseSearchToolDefinition(cwd));
}
