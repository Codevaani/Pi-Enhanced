/**
 * MCP server manager — manages lifecycle of MCP server connections.
 */

import { type ChildProcess, spawn } from "node:child_process";
import type { McpConfig, McpServerConfig } from "./config.ts";
import { McpError } from "./errors.ts";
import type { McpToolDef } from "./tool-bridge.ts";

// MCP JSON-RPC types
interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: string;
	method: string;
	params?: Record<string, unknown>;
}

interface JsonRpcNotification {
	jsonrpc: "2.0";
	method: string;
	params?: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: string;
	result?: unknown;
	error?: { code: number; message: string };
}

export type ToolListCallback = (serverName: string, tools: McpToolDef[]) => void;
export type LogCallback = (serverName: string, message: string) => void;

export interface McpServerState {
	name: string;
	config: McpServerConfig;
	state: "stopped" | "connecting" | "connected" | "error";
	lastError?: Error;
	pid?: number;
}

interface PendingRequest {
	resolve: (v: JsonRpcResponse) => void;
	reject: (e: Error) => void;
	signal?: AbortSignal;
	abortHandler?: () => void;
}

// ─── Transport abstraction ──────────────────────────────────────────────

interface Transport {
	readonly requestTimeoutMs: number;
	readonly pid?: number;
	send(request: JsonRpcRequest, signal?: AbortSignal): Promise<JsonRpcResponse>;
	sendNotification(notification: JsonRpcNotification): Promise<void>;
	close(): Promise<void>;
}

class StdioTransport implements Transport {
	private process: ChildProcess;
	private buffer = "";
	private pending = new Map<string, PendingRequest>();
	private closed = false;
	readonly requestTimeoutMs: number;

	get pid(): number | undefined {
		return this.process?.pid;
	}

	constructor(cmd: string, args: string[], env?: Record<string, string>, requestTimeoutMs = 30000) {
		this.requestTimeoutMs = requestTimeoutMs;
		this.process = spawn(cmd, args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, ...env },
		});

		this.process.stdout?.on("data", (chunk: Buffer) => {
			this.buffer += chunk.toString();
			this.processBuffer();
		});

		this.process.stderr?.on("data", (_chunk: Buffer) => {
			// MCP servers often log to stderr — ignore by default
		});

		this.process.on("error", (err) => {
			this.closed = true;
			for (const { reject } of this.pending.values()) {
				reject(new Error(`Process error: ${err.message}`));
			}
			this.pending.clear();
		});

		this.process.on("close", (code) => {
			this.closed = true;
			for (const { reject } of this.pending.values()) {
				reject(new Error(`Process exited with code ${code}`));
			}
			this.pending.clear();
		});
	}

	private processBuffer(): void {
		const lines = this.buffer.split("\n");
		this.buffer = lines.pop() ?? "";
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const message = JSON.parse(trimmed) as JsonRpcResponse | JsonRpcNotification;
				// Only response messages carry an id; notifications do not.
				if ("id" in message && typeof message.id === "string") {
					const pending = this.pending.get(message.id);
					if (pending) {
						this.pending.delete(message.id);
						this.removeAbortHandler(pending);
						pending.resolve(message);
					}
				}
			} catch {
				// Ignore non-JSON lines
			}
		}
	}

	private removeAbortHandler(pending: PendingRequest): void {
		if (pending.signal && pending.abortHandler) {
			pending.signal.removeEventListener("abort", pending.abortHandler);
		}
	}

	async send(request: JsonRpcRequest, signal?: AbortSignal): Promise<JsonRpcResponse> {
		if (this.closed) throw new Error("Transport closed");
		return new Promise((resolve, reject) => {
			const pending: PendingRequest = { resolve, reject, signal };
			this.pending.set(request.id, pending);

			const timeout = setTimeout(() => {
				this.removeAbortHandler(pending);
				this.pending.delete(request.id);
				reject(new Error(`Request timeout: ${request.method}`));
			}, this.requestTimeoutMs);

			const abortHandler = () => {
				clearTimeout(timeout);
				this.removeAbortHandler(pending);
				this.pending.delete(request.id);
				this.sendNotification({
					jsonrpc: "2.0",
					method: "notifications/cancelled",
					params: { requestId: request.id, reason: "client cancelled" },
				}).catch(() => {});
				reject(new Error("Cancelled"));
			};

			if (signal?.aborted) {
				abortHandler();
				return;
			}
			signal?.addEventListener("abort", abortHandler, { once: true });
			pending.abortHandler = abortHandler;

			try {
				this.process.stdin?.write(`${JSON.stringify(request)}\n`);
			} catch (err) {
				clearTimeout(timeout);
				this.removeAbortHandler(pending);
				this.pending.delete(request.id);
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	}

	async sendNotification(notification: JsonRpcNotification): Promise<void> {
		if (this.closed) throw new Error("Transport closed");
		this.process.stdin?.write(`${JSON.stringify(notification)}\n`);
	}

	close(): Promise<void> {
		this.closed = true;
		return new Promise((resolve) => {
			for (const pending of this.pending.values()) {
				this.removeAbortHandler(pending);
				pending.reject(new Error("Transport closed"));
			}
			this.pending.clear();
			this.process.stdin?.end();
			this.process.on("exit", () => resolve());
			setTimeout(() => {
				this.process.killed || this.process.kill("SIGKILL");
				resolve();
			}, 2000);
		});
	}
}

class HttpTransport implements Transport {
	private url: string;
	private headers: Record<string, string>;
	private closed = false;
	readonly requestTimeoutMs: number;
	readonly pid = undefined;

	constructor(url: string, headers?: Record<string, string>, requestTimeoutMs = 30000) {
		this.url = url;
		this.headers = { "Content-Type": "application/json", ...headers };
		this.requestTimeoutMs = requestTimeoutMs;
	}

	async send(request: JsonRpcRequest, signal?: AbortSignal): Promise<JsonRpcResponse> {
		if (this.closed) throw new Error("Transport closed");
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

		const onAbort = () => controller.abort();
		signal?.addEventListener("abort", onAbort, { once: true });

		try {
			const response = await fetch(this.url, {
				method: "POST",
				headers: this.headers,
				body: JSON.stringify(request),
				signal: controller.signal,
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			return (await response.json()) as JsonRpcResponse;
		} finally {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", onAbort);
		}
	}

	async sendNotification(notification: JsonRpcNotification): Promise<void> {
		if (this.closed) throw new Error("Transport closed");
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
		try {
			const response = await fetch(this.url, {
				method: "POST",
				headers: this.headers,
				body: JSON.stringify(notification),
				signal: controller.signal,
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		} finally {
			clearTimeout(timeout);
		}
	}

	close(): Promise<void> {
		this.closed = true;
		return Promise.resolve();
	}
}

// ─── Server Manager ─────────────────────────────────────────────────────

export class McpServerManager {
	private readonly config: McpConfig;
	private readonly onTools: ToolListCallback;
	private readonly onLog: LogCallback;
	private readonly servers = new Map<string, McpServerState>();
	private readonly transports = new Map<string, Transport>();

	constructor(config: McpConfig, onTools: ToolListCallback, onLog: LogCallback) {
		this.config = config;
		this.onTools = onTools;
		this.onLog = onLog;
	}

	getServer(name: string): McpServerState | undefined {
		return this.servers.get(name);
	}

	getAllServers(): McpServerState[] {
		return [...this.servers.values()];
	}

	getStatusSummary(): string {
		const lines: string[] = [];
		for (const server of this.servers.values()) {
			const icon = server.state === "connected" ? "✓" : server.state === "error" ? "✗" : "○";
			lines.push(`  ${icon} ${server.name}: ${server.state}`);
			if (server.lastError) {
				lines.push(`     last error: ${server.lastError.message}`);
			}
		}
		return lines.join("\n") || "  No MCP servers configured";
	}

	async startServer(name: string, _cwd: string): Promise<void> {
		const cfg = this.config.mcpServers[name];
		if (!cfg) throw new McpError(`Unknown server: ${name}`, "not_found");

		const requestTimeoutMs = cfg.requestTimeoutMs ?? this.config.settings.requestTimeoutMs;

		const state: McpServerState = {
			name,
			config: cfg,
			state: "connecting",
		};
		this.servers.set(name, state);

		try {
			let transport: Transport;

			if (cfg.transport === "stdio") {
				if (!cfg.command) throw new McpError(`No command configured for server ${name}`, "config");
				transport = new StdioTransport(cfg.command, cfg.args ?? [], cfg.env, requestTimeoutMs);
				state.pid = transport.pid;
			} else {
				if (!cfg.url) throw new McpError(`No URL configured for server ${name}`, "config");
				transport = new HttpTransport(cfg.url, cfg.headers, requestTimeoutMs);
			}

			// Initialize with MCP protocol
			const initResult = await transport.send({
				jsonrpc: "2.0",
				id: `init-${name}`,
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: { tools: {} },
					clientInfo: { name: "pi", version: "0.79.6" },
				},
			});

			if (initResult.error) {
				throw new Error(`Initialize failed: ${initResult.error.message}`);
			}

			// Send initialized notification (no id, no response expected per MCP spec)
			await transport.sendNotification({
				jsonrpc: "2.0",
				method: "notifications/initialized",
			});

			// List tools
			const listResult = await transport.send({
				jsonrpc: "2.0",
				id: `list-${name}`,
				method: "tools/list",
			});

			if (listResult.error) {
				throw new Error(`tools/list failed: ${listResult.error.message}`);
			}

			const tools = ((listResult.result as { tools?: McpToolDef[] })?.tools ?? []) as McpToolDef[];
			this.transports.set(name, transport);
			state.state = "connected";
			state.lastError = undefined;

			this.onTools(name, tools);
			this.onLog(name, `Connected (${tools.length} tools)`);
		} catch (err) {
			state.state = "error";
			state.lastError = err instanceof Error ? err : new Error(String(err));
			this.onLog(name, `Failed: ${state.lastError.message}`);
			throw err;
		}
	}

	async callTool(
		name: string,
		toolName: string,
		params: unknown,
		signal?: AbortSignal,
	): Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }> {
		const transport = this.transports.get(name);
		if (!transport) throw new McpError(`Server "${name}" not connected`, "not_connected");

		const result = await transport.send(
			{
				jsonrpc: "2.0",
				id: `call-${name}-${Date.now()}`,
				method: "tools/call",
				params: { name: toolName, arguments: params },
			},
			signal,
		);

		if (result.error) {
			return { content: [{ type: "text", text: `Error: ${result.error.message}` }], details: {} };
		}

		const content = ((result.result as { content?: Array<{ type: string; text?: string }> })?.content ?? []).map(
			(c) => ({ type: "text" as const, text: c.text ?? JSON.stringify(c) }),
		);

		return { content, details: {} };
	}

	async stopServer(name: string): Promise<void> {
		const state = this.servers.get(name);
		if (!state) return;

		const transport = this.transports.get(name);
		if (transport) {
			try {
				await transport.close();
			} catch {
				// ignore close errors
			}
			this.transports.delete(name);
		}

		state.state = "stopped";
		this.onTools(name, []);
		this.onLog(name, "Stopped");
	}

	async shutdownAll(): Promise<void> {
		const names = [...this.transports.keys()];
		await Promise.allSettled(names.map((n) => this.stopServer(n)));
	}

	async startEagerServers(cwd: string): Promise<void> {
		const results = await Promise.allSettled(
			Object.entries(this.config.mcpServers)
				.filter(([, cfg]) => cfg.lifecycle === "eager")
				.map(([name]) => this.startServer(name, cwd)),
		);

		for (const result of results) {
			if (result.status === "rejected") {
				this.onLog(
					"system",
					`Eager server start failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
				);
			}
		}
	}
}
