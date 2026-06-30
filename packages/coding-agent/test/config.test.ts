import { afterEach, expect, test } from "vitest";
import { detectInstallMethod, getSelfUpdateUnavailableInstruction, getUpdateInstruction } from "../src/config.ts";

afterEach(() => {
	delete process.env.PI_PACKAGE_DIR;
});

test("detectInstallMethod returns unknown when not running as bun-binary", () => {
	expect(detectInstallMethod()).toBe("unknown");
});

test("getSelfUpdateUnavailableInstruction returns empty string", () => {
	const result = getSelfUpdateUnavailableInstruction("@codevaani7838/pie-coding-agent");
	expect(result).toBe("");
});

test("getUpdateInstruction returns empty string", () => {
	const result = getUpdateInstruction("@codevaani7838/pie-coding-agent");
	expect(result).toBe("");
});
