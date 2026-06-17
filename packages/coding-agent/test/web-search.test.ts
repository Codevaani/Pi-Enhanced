import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebSearchTool } from "../src/core/tools/web-search.ts";

const webSearch = createWebSearchTool();

describe("web_search tool", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("validates that query cannot be empty", async () => {
		const result = await webSearch.execute("c1", { query: "  " });
		const text = result.content[0] as any;
		expect(text.text).toMatch(/empty/i);
	});

	it("clamps num_results to range 1..10", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response('event: message\ndata: {"result":{"content":[{"type":"text","text":""}]}}\n\n', {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await webSearch.execute("c1", { query: "x", num_results: 999 });
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.params.arguments.num_results).toBeLessThanOrEqual(10);

		await webSearch.execute("c1", { query: "x", num_results: 0 });
		const body2 = JSON.parse(fetchMock.mock.calls[1][1].body);
		expect(body2.params.arguments.num_results).toBeGreaterThanOrEqual(1);
	});

	it("parses Exa SSE response into results", async () => {
		// Indirect test: send SSE-shaped text and verify the tool does not crash
		// and returns an error message rather than an empty list.
		const exaText = "Title: Example\nURL: https://example.com/a\n";
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(
					`event: message\ndata: {"result":{"content":[{"type":"text","text":${JSON.stringify(exaText)}}]}}\n\n`,
					{ status: 200, headers: { "Content-Type": "text/event-stream" } },
				),
			);
		vi.stubGlobal("fetch", fetchMock);
		const result = await webSearch.execute("c1", { query: "x" });
		const text = result.content[0] as any;
		expect(text.text).toContain("Title: Example");
	});

	it("returns error text on HTTP failure", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("server error", { status: 500 })));
		const result = await webSearch.execute("c1", { query: "x" });
		const text = result.content[0] as any;
		expect(text.text).toMatch(/web_search failed/i);
	});
});
