import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAstEditTool, createAstEditToolDefinition } from "../src/core/tools/ast-edit.ts";

function hasSg(): boolean {
	const result = spawnSync("sg", ["--version"], { stdio: "pipe" });
	return result.error === undefined || result.error === null;
}

const itWhenSg = hasSg() ? it : it.skip;

function textOutput(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content
		.filter((content) => content.type === "text")
		.map((content) => content.text ?? "")
		.join("\n");
}

describe("ast_edit tool", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	});

	async function createTempDir(): Promise<string> {
		const dir = await mkdtemp(join(tmpdir(), "pi-ast-edit-"));
		tempDirs.push(dir);
		return dir;
	}

	it("defines the ast_edit tool", () => {
		const definition = createAstEditToolDefinition(process.cwd());

		expect(definition.name).toBe("ast_edit");
		expect(definition.label).toBe("ast_edit");
		expect(definition.description).toContain("AST pattern");
	});

	itWhenSg("previews a structural rewrite without modifying files", async () => {
		const dir = await createTempDir();
		const file = join(dir, "example.ts");
		const original = 'function f() {\n\tconsole.log(\n\t\t"x"\n\t);\n}\n';
		await writeFile(file, original);

		const tool = createAstEditTool(dir);
		const result = await tool.execute("call-1", {
			pattern: "console.log($A)",
			rewrite: "logger.info($A)",
			lang: "typescript",
			paths: [file],
		});

		expect(await readFile(file, "utf-8")).toBe(original);
		expect(result.details?.mode).toBe("preview");
		expect(result.details?.matchCount).toBe(1);
		expect(textOutput(result)).toContain("Preview AST rewrite for 1 match(es). No files were modified.");
		expect(textOutput(result)).toContain("logger.info");
	});

	itWhenSg("applies a structural rewrite when mode is apply", async () => {
		const dir = await createTempDir();
		const file = join(dir, "example.ts");
		await writeFile(file, 'function f() {\n\tconsole.log(\n\t\t"x"\n\t);\n}\n');

		const tool = createAstEditTool(dir);
		const result = await tool.execute("call-1", {
			pattern: "console.log($A)",
			rewrite: "logger.info($A)",
			lang: "typescript",
			paths: [file],
			mode: "apply",
		});

		expect(await readFile(file, "utf-8")).toBe('function f() {\n\tlogger.info("x");\n}\n');
		expect(result.details?.mode).toBe("apply");
		expect(result.details?.matchCount).toBe(1);
		expect(textOutput(result)).toContain("Applied AST rewrite to 1 match(es).");
	});

	itWhenSg("returns no matches without modifying files", async () => {
		const dir = await createTempDir();
		const file = join(dir, "example.ts");
		const original = "function f() {}\n";
		await writeFile(file, original);

		const tool = createAstEditTool(dir);
		const result = await tool.execute("call-1", {
			pattern: "console.log($A)",
			rewrite: "logger.info($A)",
			lang: "typescript",
			paths: [file],
			mode: "apply",
		});

		expect(await readFile(file, "utf-8")).toBe(original);
		expect(result.details?.matchCount).toBe(0);
		expect(textOutput(result)).toBe("No matches found");
	});

	itWhenSg("refuses to apply when matches exceed the limit", async () => {
		const dir = await createTempDir();
		const file = join(dir, "example.ts");
		const original = 'console.log("a");\nconsole.log("b");\n';
		await writeFile(file, original);

		const tool = createAstEditTool(dir);
		await expect(
			tool.execute("call-1", {
				pattern: "console.log($A)",
				rewrite: "logger.info($A)",
				lang: "typescript",
				paths: [file],
				mode: "apply",
				limit: 1,
			}),
		).rejects.toThrow(/matched more than 1/);
		expect(await readFile(file, "utf-8")).toBe(original);
	});
});
