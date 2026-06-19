/**
 * MCP tool bridge — converts MCP tool definitions to Pi ToolDefinitions
 * and manages their lifecycle.
 */

import type { ToolDefinition } from "../extensions/types.ts";
import type { McpSettings } from "./config.ts";

// ─── Types ────────────────────────────────────────────────────────────

export interface McpToolDef {
	name: string;
	description?: string;
	inputSchema: Record<string, unknown>;
}

export type ToolRegisterFn = (def: ToolDefinition) => void;
export type ToolUnregisterFn = (name: string) => void;

// ─── Schema conversion ─────────────────────────────────────────────────

/**
 * Minimal JSON Schema → TypeBox schema conversion.
 * Handles common types used by real-world MCP servers.
 */
function convertSchema(schema: unknown): Record<string, unknown> {
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
		return { type: "object", properties: {} };
	}
	return convertSchemaObject(schema as Record<string, unknown>);
}

function convertSchemaObject(s: Record<string, unknown>): Record<string, unknown> {
	const type = s.type;
	if (!type && !s.oneOf && !s.anyOf && !s.$ref) {
		// No type info — return open object
		return { type: "object", properties: {} };
	}

	const result: Record<string, unknown> = {};
	if (typeof type === "string") {
		result.type = type === "integer" ? "number" : type;
	} else if (Array.isArray(type)) {
		const nonNull = type.filter((t) => t !== "null");
		result.type = nonNull.length === 1 ? nonNull[0] : "string";
	}
	if (s.description) {
		result.description = s.description;
	}
	if (Array.isArray(s.enum)) {
		result.enum = s.enum;
	}
	if (type === "object" || (Array.isArray(type) && type.includes("object"))) {
		const props = s.properties as Record<string, unknown> | undefined;
		if (props) {
			const converted: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(props)) {
				converted[k] = convertSchemaObject(v as Record<string, unknown>);
			}
			result.properties = converted;
		}
		if (s.required) {
			result.required = s.required;
		}
	}
	if (type === "array") {
		const items = s.items as Record<string, unknown> | undefined;
		if (items) {
			result.items = convertSchemaObject(items);
		}
	}
	return result;
}

function buildToolName(prefix: string, serverName: string, toolName: string): string {
	const raw = `${prefix}_${serverName}_${toolName}`;
	const safe = raw.replace(/[^a-zA-Z0-9_]/g, "_");
	const MAX = 64;
	if (safe.length <= MAX) return safe;
	const hash = Math.abs(safe.split("").reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0))
		.toString(36)
		.slice(0, 8);
	return `${safe.slice(0, MAX - 9)}_${hash}`;
}

// ─── Tool Bridge ────────────────────────────────────────────────────────

export class McpToolBridge {
	private readonly settings: McpSettings;
	private readonly register: ToolRegisterFn;
	private readonly unregister: ToolUnregisterFn;
	/** serverName → Set<pieToolName> */
	private readonly serverTools = new Map<string, Set<string>>();
	/** pieToolName → serverName (reverse lookup) */
	private readonly toolToServer = new Map<string, string>();

	constructor(settings: McpSettings, register: ToolRegisterFn, unregister: ToolUnregisterFn) {
		this.settings = settings;
		this.register = register;
		this.unregister = unregister;
	}

	/**
	 * Register all tools from an MCP server.
	 * The execute function is a closure that calls the MCP server.
	 */
	registerServerTools(
		serverName: string,
		tools: McpToolDef[],
		executeTool: (
			toolName: string,
			params: unknown,
			signal?: AbortSignal,
		) => Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }>,
	): void {
		const existing = this.serverTools.get(serverName);
		if (existing) {
			// Unregister old tools first
			for (const name of existing) {
				this.unregister(name);
				this.toolToServer.delete(name);
			}
		}

		const toolNames = new Set<string>();
		for (const tool of tools) {
			const piName = buildToolName(this.settings.toolPrefix, serverName, tool.name);
			toolNames.add(piName);
			this.toolToServer.set(piName, serverName);

			const description = tool.description ?? `MCP tool: ${tool.name}`;
			const schema = convertSchema(tool.inputSchema);

			this.register({
				name: piName,
				label: tool.name,
				description,
				promptSnippet: description.slice(0, 120),
				parameters: schema,
				async execute(
					_toolCallId: string,
					params: unknown,
					signal: AbortSignal | undefined,
					_onUpdate: unknown,
					_ctx: unknown,
				) {
					if (signal?.aborted) {
						return { content: [{ type: "text" as const, text: "Cancelled" }], details: {} };
					}
					try {
						const result = await executeTool(tool.name, params, signal);
						return { content: result.content, details: {} };
					} catch (err: unknown) {
						const msg = err instanceof Error ? err.message : String(err);
						return { content: [{ type: "text" as const, text: `Error: ${msg}` }], details: {} };
					}
				},
			});
		}

		this.serverTools.set(serverName, toolNames);
	}

	/** Remove all tools for a server */
	removeServerTools(serverName: string): void {
		const toolNames = this.serverTools.get(serverName);
		if (!toolNames) return;
		for (const name of toolNames) {
			this.unregister(name);
			this.toolToServer.delete(name);
		}
		this.serverTools.delete(serverName);
	}

	/** Get count of registered MCP tools */
	get toolCount(): number {
		return this.toolToServer.size;
	}

	/** Get all registered tool names */
	getAllToolNames(): string[] {
		return [...this.toolToServer.keys()];
	}
}
