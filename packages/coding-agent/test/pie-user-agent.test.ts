import { describe, expect, it } from "vitest";
import { getPieUserAgent } from "../src/utils/pie-user-agent.ts";

describe("getPieUserAgent", () => {
	it("formats the user agent expected by pi.dev", () => {
		const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
		const userAgent = getPieUserAgent("1.2.3");

		expect(userAgent).toBe(`pie/1.2.3 (${process.platform}; ${runtime}; ${process.arch})`);
		expect(userAgent).toMatch(/^pie\/[^\s()]+ \([^;()]+;\s*[^;()]+;\s*[^()]+\)$/);
	});
});
