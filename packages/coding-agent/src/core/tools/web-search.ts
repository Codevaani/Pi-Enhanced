import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
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

export const webSearchSchema = Type.Object({
	query: Type.String({ description: "Search query" }),
	num_results: Type.Optional(Type.Number({ description: "Number of results to return (default: 5, max: 10)" })),
});

export type WebSearchInput = Static<typeof webSearchSchema>;

const DEFAULT_NUM_RESULTS = 5;
const MAX_NUM_RESULTS = 10;
const EXA_MCP_URL = "https://mcp.exa.ai/mcp?tools=web_search_exa";

// =========================================================================
// Types
// =========================================================================

export interface WebSearchResult {
	title: string;
	url: string;
	publishedDate?: string;
	author?: string;
	highlights?: string[];
	text?: string;
}

export interface WebSearchDetails {
	results: WebSearchResult[];
	query: string;
	searchTimeMs?: number;
}

// =========================================================================
// Exa MCP client
// =========================================================================

interface JsonRpcResponse {
	result?: {
		content?: Array<{
			type: string;
			text?: string;
			data?: string;
			mimeType?: string;
		}>;
		_meta?: { searchTime?: number };
	};
	error?: { code: number; message: string };
}

async function callExaWebSearch(
	query: string,
	numResults: number,
	signal: AbortSignal | undefined,
): Promise<{ text: string; searchTimeMs?: number }> {
	const body = {
		jsonrpc: "2.0",
		id: `web-search-${Date.now()}`,
		method: "tools/call",
		params: {
			name: "web_search_exa",
			arguments: {
				query,
				num_results: numResults,
			},
		},
	};

	const response = await fetch(EXA_MCP_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify(body),
		signal,
	});

	if (!response.ok) {
		throw new Error(`Exa HTTP ${response.status}: ${response.statusText}`);
	}

	const raw = await response.text();
	return parseEventStream(raw);
}

/**
 * Exa returns Server-Sent Events: `event: message\ndata: {...}\n\n`.
 * We may receive a single event or multiple; concatenate all `data:` payloads
 * and return the first one that has both a result and text content.
 */
function parseEventStream(raw: string): { text: string; searchTimeMs?: number } {
	const lines = raw.split(/\r?\n/);
	let pendingEvent = "";
	let lastText: string | undefined;
	let lastTime: number | undefined;

	for (const line of lines) {
		if (line.startsWith("event:")) {
			pendingEvent = line.slice(6).trim();
			continue;
		}
		if (line.startsWith("data:")) {
			const payload = line.slice(5).trim();
			if (!payload) continue;
			if (pendingEvent !== "message" && pendingEvent !== "") {
				pendingEvent = "";
				continue;
			}
			pendingEvent = "";
			try {
				const parsed = JSON.parse(payload) as JsonRpcResponse;
				if (parsed.error) {
					throw new Error(`Exa JSON-RPC ${parsed.error.code}: ${parsed.error.message}`);
				}
				const content = parsed.result?.content;
				if (Array.isArray(content)) {
					for (const block of content) {
						if (block.type === "text" && typeof block.text === "string") {
							lastText = block.text;
						}
					}
				}
				if (typeof parsed.result?._meta?.searchTime === "number") {
					lastTime = parsed.result._meta.searchTime;
				}
			} catch (e) {
				if (e instanceof SyntaxError) continue;
				throw e;
			}
		}
	}

	if (lastText === undefined) {
		throw new Error("Exa returned no text content");
	}

	return { text: lastText, searchTimeMs: lastTime };
}

/**
 * Parse Exa's text payload. Exa returns results separated by `\n---\n`,
 * each result looks like:
 *
 *   Title: <title>
 *   URL: <url>
 *   Published: <date>
 *   Author: <author>
 *   Highlights:
 *   <highlight1>
 *   ...
 *   <text snippet>
 */
function parseExaText(text: string): WebSearchResult[] {
	const blocks = text.split(/\n---\n/);
	const results: WebSearchResult[] = [];

	for (const block of blocks) {
		const lines = block.split("\n");
		const current: Partial<WebSearchResult> = {};
		let section: "header" | "highlights" | "text" = "header";
		const highlights: string[] = [];
		const textLines: string[] = [];

		for (const line of lines) {
			if (section === "header") {
				const titleMatch = /^Title:\s*(.*)$/.exec(line);
				if (titleMatch) {
					current.title = titleMatch[1].trim();
					continue;
				}
				const urlMatch = /^URL:\s*(.*)$/.exec(line);
				if (urlMatch) {
					current.url = urlMatch[1].trim();
					continue;
				}
				const publishedMatch = /^Published:\s*(.*)$/.exec(line);
				if (publishedMatch) {
					current.publishedDate = publishedMatch[1].trim();
					continue;
				}
				const authorMatch = /^Author:\s*(.*)$/.exec(line);
				if (authorMatch) {
					current.author = authorMatch[1].trim();
					continue;
				}
				if (/^Highlights:\s*$/.test(line)) {
					section = "highlights";
					continue;
				}
				if (line.trim() === "") continue;
				// Heuristic: once we hit a non-Header line, the rest is body text
				if (current.title && current.url) {
					section = "text";
				}
			}

			if (section === "highlights") {
				if (line.trim() === "" && highlights.length > 0) {
					section = "text";
					continue;
				}
				highlights.push(line);
			} else {
				textLines.push(line);
			}
		}

		if (current.title && current.url) {
			if (highlights.length > 0) current.highlights = highlights;
			const body = textLines.join("\n").trim();
			if (body) current.text = body;
			results.push(current as WebSearchResult);
		}
	}

	return results;
}

// =========================================================================
// Rendering
// =========================================================================

function formatWebSearchCall(args: WebSearchInput, theme: Theme): string {
	const n = args.num_results ?? DEFAULT_NUM_RESULTS;
	return `${theme.fg("toolTitle", theme.bold("web_search "))}${theme.fg("muted", `"${args.query}"`)} ${theme.fg("dim", `(top ${n})`)}`;
}

function formatWebSearchResult(
	result: AgentToolResult<WebSearchDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
): string {
	const first = result.content[0];
	const text = (first && first.type === "text" && first.text) || "";
	const details = result.details;
	const results = details?.results ?? parseExaText(text);

	if (results.length === 0) {
		return theme.fg("dim", "No results");
	}

	const lines: string[] = [];
	lines.push(
		`${theme.fg("muted", `${results.length} result${results.length === 1 ? "" : "s"}`)}${details?.searchTimeMs ? ` ${theme.fg("dim", `· ${details.searchTimeMs.toFixed(1)}s`)}` : ""}`,
	);

	const display = options.expanded ? results : results.slice(0, 3);
	for (let i = 0; i < display.length; i++) {
		const r = display[i];
		const idx = theme.fg("accent", `${i + 1}.`);
		const title = theme.fg("text", theme.bold(r.title));
		const url = theme.fg("dim", r.url);
		lines.push(`${idx} ${title}`);
		lines.push(`   ${url}`);
		if (r.publishedDate) {
			lines.push(`   ${theme.fg("dim", r.publishedDate)}`);
		}
		if (r.highlights && r.highlights.length > 0) {
			const first = r.highlights.find((h) => h.trim().length > 0) ?? "";
			if (first) {
				const snippet = first.length > 200 ? `${first.slice(0, 197)}…` : first;
				lines.push(`   ${theme.fg("muted", snippet)}`);
			}
		}
		if (i < display.length - 1) {
			lines.push("");
		}
	}

	if (!options.expanded && results.length > 3) {
		lines.push(theme.fg("dim", `… and ${results.length - 3} more (ctrl+o to expand)`));
	}

	return lines.join("\n");
}

// =========================================================================
// Tool Definition
// =========================================================================

export function createWebSearchToolDefinition(): ToolDefinition<typeof webSearchSchema, WebSearchDetails> {
	return {
		name: "web_search",
		label: "web_search",
		description: `Search the live web using Exa. Use for current events, recent documentation, or anything that may have changed since the training cutoff. Returns titles, URLs, dates, and a short highlight for each result.`,
		promptSnippet: "Search the live web for current information",
		promptGuidelines: [
			"Use web_search when the user asks about current events, recent releases, version numbers, or anything time-sensitive.",
			"Prefer 3-5 results unless the user explicitly asks for more depth.",
		],
		parameters: webSearchSchema,
		async execute(
			_toolCallId: string,
			params: WebSearchInput,
			signal: AbortSignal | undefined,
			_onUpdate: any,
			_ctx: any,
		): Promise<AgentToolResult<WebSearchDetails>> {
			const query = params.query.trim();
			if (!query) {
				return {
					content: [{ type: "text", text: "Error: query cannot be empty" }],
					details: { results: [], query },
				};
			}
			const numResults = Math.max(
				1,
				Math.min(MAX_NUM_RESULTS, Math.floor(params.num_results ?? DEFAULT_NUM_RESULTS)),
			);

			try {
				const { text, searchTimeMs } = await callExaWebSearch(query, numResults, signal);
				const results = parseExaText(text);
				return {
					content: [{ type: "text", text }],
					details: {
						results,
						query,
						...(typeof searchTimeMs === "number" ? { searchTimeMs } : {}),
					},
				};
			} catch (e: any) {
				const message = e?.message ?? String(e);
				if (signal?.aborted) {
					return {
						content: [{ type: "text", text: "Search cancelled" }],
						details: { results: [], query },
					};
				}
				return {
					content: [{ type: "text", text: `Error: web_search failed: ${message}` }],
					details: { results: [], query },
				};
			}
		},
		renderCall(args: WebSearchInput, theme: Theme, _context: ToolRenderContext): Text {
			return new Text(formatWebSearchCall(args, theme), 0, 0);
		},
		renderResult(
			result: AgentToolResult<WebSearchDetails>,
			options: ToolRenderResultOptions,
			theme: Theme,
			_context: ToolRenderContext,
		): Text {
			return new Text(formatWebSearchResult(result, options, theme), 0, 0);
		},
	};
}

export function createWebSearchTool(): AgentTool<typeof webSearchSchema> {
	return wrapToolDefinition(createWebSearchToolDefinition());
}
