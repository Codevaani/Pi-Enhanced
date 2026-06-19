/**
 * MCP (Model Context Protocol) integration for Pi.
 *
 * Entry point for the built-in MCP module. Orchestrates config loading,
 * server connections, and tool bridging.
 */

import type { ToolDefinition } from "../extensions/types.ts";
import { loadMcpConfig, type McpConfig } from "./config.ts";
import { McpServerManager } from "./server-manager.ts";
import { McpToolBridge, type McpToolDef } from "./tool-bridge.ts";

export interface McpToolLifecycle {
	registerTool: (def: ToolDefinition) => void;
	unregisterTool: (name: string) => void;
	onToolsChanged: () => void;
	onLog: (message: string) => void;
}

export class McpManager {
	private config: McpConfig | null = null;
	private serverManager: McpServerManager | null = null;
	private toolBridge: McpToolBridge | null = null;
	private lifecycle: McpToolLifecycle | null = null;
	private resolvedCwd = "";

	/**
	 * Initialize MCP — load config, start eager servers.
	 * Returns true if any MCP servers were configured.
	 */
	async initialize(cwd: string, lifecycle: McpToolLifecycle): Promise<boolean> {
		this.resolvedCwd = cwd;
		this.lifecycle = lifecycle;
		this.config = await loadMcpConfig(cwd);

		if (Object.keys(this.config.mcpServers).length === 0) {
			return false;
		}

		this.toolBridge = new McpToolBridge(
			this.config.settings,
			(def) => lifecycle.registerTool(def),
			(name) => lifecycle.unregisterTool(name),
		);

		this.serverManager = new McpServerManager(
			this.config,
			(serverName, tools) => this._onTools(serverName, tools),
			(_serverName, msg) => lifecycle.onLog(msg),
		);

		// Start eager servers (don't await — let them connect in background)
		this.serverManager.startEagerServers(cwd).catch(() => {});

		return true;
	}

	private _onTools(serverName: string, tools: McpToolDef[]): void {
		if (!this.toolBridge || !this.serverManager) return;

		if (tools.length === 0) {
			this.toolBridge.removeServerTools(serverName);
		} else {
			this.toolBridge.registerServerTools(serverName, tools, async (toolName, params, signal) => {
				return this.serverManager!.callTool(serverName, toolName, params, signal);
			});
		}

		// Notify the caller once per batch instead of once per tool.
		this.lifecycle?.onToolsChanged();
	}

	/** Shutdown all MCP servers */
	async shutdown(): Promise<void> {
		await this.serverManager?.shutdownAll();
	}

	/** Get status of all MCP servers as formatted string */
	getStatusSummary(): string {
		if (!this.serverManager) return "MCP not initialized";
		return this.serverManager.getStatusSummary();
	}

	/** Get a specific server's state */
	getServer(name: string) {
		return this.serverManager?.getServer(name);
	}

	/** Start a specific server */
	async startServer(name: string): Promise<void> {
		if (!this.serverManager || !this.config) throw new Error("MCP not initialized");
		await this.serverManager.startServer(name, this.resolvedCwd);
	}

	/** Stop a specific server */
	async stopServer(name: string): Promise<void> {
		if (!this.serverManager) throw new Error("MCP not initialized");
		await this.serverManager.stopServer(name);
	}

	/** Get count of registered MCP tools */
	get toolCount(): number {
		return this.toolBridge?.toolCount ?? 0;
	}

	/** Check if MCP is active */
	get isActive(): boolean {
		return this.config !== null && Object.keys(this.config.mcpServers).length > 0;
	}

	/** Get MCP tool names */
	getAllMcpToolNames(): string[] {
		return this.toolBridge?.getAllToolNames() ?? [];
	}
}
