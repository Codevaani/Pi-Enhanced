import { afterEach, expect, test } from "vitest";
import { detectInstallMethod, getSelfUpdateUnavailableInstruction, getUpdateInstruction } from "../src/config.ts";

afterEach(() => {
	delete process.env.PI_PACKAGE_DIR;
});

test("detectInstallMethod returns unknown when not running as bun-binary", () => {
	expect(detectInstallMethod()).toBe("unknown");
});

test("getSelfUpdateUnavailableInstruction returns GitHub download URL", () => {
	const result = getSelfUpdateUnavailableInstruction("@earendil-works/pie-coding-agent");
	expect(result).toBe("Download from: https://github.com/Codevaani/Pi-Enhanced/releases/latest");
});

test("getUpdateInstruction returns GitHub download URL", () => {
	const result = getUpdateInstruction("@earendil-works/pie-coding-agent");
	expect(result).toBe("Download from: https://github.com/Codevaani/Pi-Enhanced/releases/latest");
});
