import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setKeybindings } from "@earendil-works/pie-tui";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import { TrustSelectorComponent } from "../src/modes/interactive/components/trust-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";
import { resolvePath } from "../src/utils/paths.ts";

describe("TrustSelectorComponent", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	beforeEach(() => {
		setKeybindings(new KeybindingsManager());
	});

	it("marks the saved trusted decision", () => {
		const projectPath = resolvePath(join(tmpdir(), "project"));
		const selector = new TrustSelectorComponent({
			cwd: projectPath,
			savedDecision: { path: projectPath, decision: true },
			projectTrusted: true,
			onSelect: () => {},
			onCancel: () => {},
		});

		const output = stripAnsi(selector.render(120).join("\n"));

		expect(output).toContain(`Saved decision: trusted (${projectPath})`);
		expect(output).toContain("Current session: trusted");
		expect(output).toContain("Trust ✓");
		expect(output).not.toContain("Do not trust ✓");
	});

	it("selects a trust decision", () => {
		const projectPath = resolvePath(join(tmpdir(), "project"));
		const onSelect = vi.fn();
		const selector = new TrustSelectorComponent({
			cwd: projectPath,
			savedDecision: null,
			projectTrusted: false,
			onSelect,
			onCancel: () => {},
		});

		selector.handleInput("\n");

		expect(onSelect).toHaveBeenCalledWith({ trusted: true, updates: [{ path: projectPath, decision: true }] });
	});

	it("labels saved ancestor decisions as inherited", () => {
		const parentPath = resolvePath(join(tmpdir(), "parent"));
		const projectPath = join(parentPath, "project", "nested");
		const selector = new TrustSelectorComponent({
			cwd: projectPath,
			savedDecision: { path: parentPath, decision: true },
			projectTrusted: true,
			onSelect: () => {},
			onCancel: () => {},
		});

		const output = stripAnsi(selector.render(120).join("\n"));

		expect(output).toContain(`Saved decision: trusted (inherited from ${parentPath})`);
	});

	it("adds a trust parent option", () => {
		const projectPath = resolvePath(join(tmpdir(), "parent", "project"));
		const parentPath = dirname(projectPath);
		const onSelect = vi.fn();
		const selector = new TrustSelectorComponent({
			cwd: projectPath,
			savedDecision: { path: parentPath, decision: true },
			projectTrusted: true,
			onSelect,
			onCancel: () => {},
		});

		const output = stripAnsi(selector.render(120).join("\n"));
		expect(output).toContain(`Saved decision: trusted (inherited from ${parentPath})`);
		expect(output).toContain(`Trust parent folder (${parentPath}) ✓`);

		selector.handleInput("\n");

		expect(onSelect).toHaveBeenCalledWith({
			trusted: true,
			updates: [
				{ path: parentPath, decision: true },
				{ path: projectPath, decision: null },
			],
		});
	});
});
