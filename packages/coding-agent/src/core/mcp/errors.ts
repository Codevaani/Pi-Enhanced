/**
 * MCP-specific error types with distinct codes.
 */

export class McpError extends Error {
	readonly code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = "McpError";
		this.code = code;
	}
}
