/**
 * MCP config loader — reads from .pi/mcp.json and ~/.pi/agent/mcp.json.
 * Project config overrides global config per server.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface McpServerConfig {
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	transport: "stdio" | "streamable-http" | "sse";
	url?: string;
	headers?: Record<string, string>;
	lifecycle: "eager" | "lazy";
	requestTimeoutMs?: number;
}

export interface McpSettings {
	toolPrefix: string;
	requestTimeoutMs: number;
}

export interface McpConfig {
	settings: McpSettings;
	mcpServers: Record<string, McpServerConfig>;
}

const DEFAULTS: McpSettings = {
	toolPrefix: "mcp",
	requestTimeoutMs: 30000,
};

function parseConfig(raw: unknown): McpConfig {
	if (typeof raw !== "object" || raw === null) {
		return { settings: { ...DEFAULTS }, mcpServers: {} };
	}

	const obj = raw as Record<string, unknown>;

	// Parse settings
	const rawSettings = (obj.settings ?? {}) as Record<string, unknown>;
	const settings: McpSettings = {
		toolPrefix: typeof rawSettings.toolPrefix === "string" ? rawSettings.toolPrefix : DEFAULTS.toolPrefix,
		requestTimeoutMs:
			typeof rawSettings.requestTimeoutMs === "number" ? rawSettings.requestTimeoutMs : DEFAULTS.requestTimeoutMs,
	};

	// Parse servers
	const rawServers = (obj.mcpServers ?? {}) as Record<string, unknown>;
	const mcpServers: Record<string, McpServerConfig> = {};

	for (const [name, rawCfg] of Object.entries(rawServers)) {
		if (typeof rawCfg !== "object" || rawCfg === null) continue;
		const c = rawCfg as Record<string, unknown>;
		mcpServers[name] = {
			command: typeof c.command === "string" ? c.command : undefined,
			args: Array.isArray(c.args) ? c.args.map(String) : [],
			env: typeof c.env === "object" && c.env !== null ? (c.env as Record<string, string>) : undefined,
			transport: c.transport === "streamable-http" || c.transport === "sse" ? c.transport : "stdio",
			url: typeof c.url === "string" ? c.url : undefined,
			headers:
				typeof c.headers === "object" && c.headers !== null ? (c.headers as Record<string, string>) : undefined,
			lifecycle: c.lifecycle === "eager" ? "eager" : "lazy",
			requestTimeoutMs: typeof c.requestTimeoutMs === "number" ? c.requestTimeoutMs : undefined,
		};
	}

	return { settings, mcpServers };
}

function mergeConfigs(global: McpConfig, project: McpConfig): McpConfig {
	return {
		settings: { ...global.settings, ...project.settings },
		mcpServers: { ...global.mcpServers, ...project.mcpServers },
	};
}

async function readJson(path: string): Promise<unknown | null> {
	try {
		const text = await readFile(path, "utf8");
		return JSON.parse(text);
	} catch (err: unknown) {
		const e = err as NodeJS.ErrnoException;
		if (e.code === "ENOENT") return null;
		throw err;
	}
}

/**
 * Load and merge global (~/.pi/agent/mcp.json) and project (.pi/mcp.json) config.
 */
export async function loadMcpConfig(cwd: string): Promise<McpConfig> {
	const globalPath = join(homedir(), ".pi", "agent", "mcp.json");
	const projectPath = join(cwd, ".pi", "mcp.json");

	const [globalRaw, projectRaw] = await Promise.all([readJson(globalPath), readJson(projectPath)]);

	if (globalRaw === null && projectRaw === null) {
		return { settings: { ...DEFAULTS }, mcpServers: {} };
	}

	const globalCfg = globalRaw !== null ? parseConfig(globalRaw) : { settings: { ...DEFAULTS }, mcpServers: {} };
	if (projectRaw === null) return globalCfg;

	return mergeConfigs(globalCfg, parseConfig(projectRaw));
}
