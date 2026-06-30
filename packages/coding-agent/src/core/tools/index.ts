export {
	type AstEditToolDetails,
	type AstEditToolInput,
	type AstEditToolOptions,
	createAstEditTool,
	createAstEditToolDefinition,
} from "./ast-edit.ts";
export {
	type AstGrepToolDetails,
	type AstGrepToolInput,
	createAstGrepTool,
	createAstGrepToolDefinition,
} from "./ast-grep.ts";
export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	createBashTool,
	createBashToolDefinition,
	createLocalBashOperations,
} from "./bash.ts";
export {
	createEditTool,
	createEditToolDefinition,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
} from "./edit.ts";
export { withFileMutationQueue } from "./file-mutation-queue.ts";
export {
	createFindTool,
	createFindToolDefinition,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
} from "./find.ts";
export {
	createLsTool,
	createLsToolDefinition,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
} from "./ls.ts";
export {
	createReadTool,
	createReadToolDefinition,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
} from "./read.ts";
export {
	createRipgrepTool,
	createRipgrepToolDefinition,
	type RipgrepOperations,
	type RipgrepToolDetails,
	type RipgrepToolInput,
	type RipgrepToolOptions,
} from "./ripgrep.ts";
export {
	createTodoTool,
	createTodoToolDefinition,
	getTodoPhases,
	isTodoWidgetEnabled,
	resetState,
	setTodoWidgetEnabled,
	type TodoDetails,
	type TodoInput,
	type TodoPhase,
	type TodoStatus,
	type TodoTask,
} from "./todo.ts";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.ts";
export {
	createWriteTool,
	createWriteToolDefinition,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
} from "./write.ts";

import type { AgentTool } from "@codevaani7838/pie-agent-core";
import type { ToolDefinition } from "../extensions/types.ts";
import { type AstEditToolOptions, createAstEditTool, createAstEditToolDefinition } from "./ast-edit.ts";
import { createAstGrepTool, createAstGrepToolDefinition } from "./ast-grep.ts";
import { type BashToolOptions, createBashTool, createBashToolDefinition } from "./bash.ts";
import { createEditTool, createEditToolDefinition, type EditToolOptions } from "./edit.ts";
import { createFindTool, createFindToolDefinition, type FindToolOptions } from "./find.ts";
import { createLsTool, createLsToolDefinition, type LsToolOptions } from "./ls.ts";
import { createReadTool, createReadToolDefinition, type ReadToolOptions } from "./read.ts";
import { createRipgrepTool, createRipgrepToolDefinition, type RipgrepToolOptions } from "./ripgrep.ts";
import { createTodoTool, createTodoToolDefinition } from "./todo.ts";
import { createWebSearchTool, createWebSearchToolDefinition } from "./web-search.ts";
import { createWriteTool, createWriteToolDefinition, type WriteToolOptions } from "./write.ts";

export type Tool = AgentTool<any>;
export type ToolDef = ToolDefinition<any, any>;
export type ToolName =
	| "read"
	| "bash"
	| "edit"
	| "write"
	| "ripgrep"
	| "ast_grep"
	| "ast_edit"
	| "find"
	| "ls"
	| "todo"
	| "web_search";
export const allToolNames: Set<ToolName> = new Set([
	"read",
	"bash",
	"edit",
	"write",
	"ripgrep",
	"ast_grep",
	"ast_edit",
	"find",
	"ls",
	"todo",
	"web_search",
]);

export interface ToolsOptions {
	read?: ReadToolOptions;
	bash?: BashToolOptions;
	write?: WriteToolOptions;
	edit?: EditToolOptions;
	ripgrep?: RipgrepToolOptions;
	ast_grep?: Record<string, never>;
	ast_edit?: AstEditToolOptions;
	find?: FindToolOptions;
	ls?: LsToolOptions;
	todo?: Record<string, never>;
	web_search?: Record<string, never>;
}

export function createToolDefinition(toolName: ToolName, cwd: string, options?: ToolsOptions): ToolDef {
	switch (toolName) {
		case "read":
			return createReadToolDefinition(cwd, options?.read);
		case "bash":
			return createBashToolDefinition(cwd, options?.bash);
		case "edit":
			return createEditToolDefinition(cwd, options?.edit);
		case "write":
			return createWriteToolDefinition(cwd, options?.write);
		case "ripgrep":
			return createRipgrepToolDefinition(cwd, options?.ripgrep);
		case "ast_grep":
			return createAstGrepToolDefinition(cwd);
		case "ast_edit":
			return createAstEditToolDefinition(cwd, options?.ast_edit);
		case "find":
			return createFindToolDefinition(cwd, options?.find);
		case "ls":
			return createLsToolDefinition(cwd, options?.ls);
		case "todo":
			return createTodoToolDefinition();
		case "web_search":
			return createWebSearchToolDefinition();
		default:
			throw new Error(`Unknown tool name: ${toolName}`);
	}
}

export function createTool(toolName: ToolName, cwd: string, options?: ToolsOptions): Tool {
	switch (toolName) {
		case "read":
			return createReadTool(cwd, options?.read);
		case "bash":
			return createBashTool(cwd, options?.bash);
		case "edit":
			return createEditTool(cwd, options?.edit);
		case "write":
			return createWriteTool(cwd, options?.write);
		case "ripgrep":
			return createRipgrepTool(cwd, options?.ripgrep);
		case "ast_grep":
			return createAstGrepTool(cwd);
		case "ast_edit":
			return createAstEditTool(cwd, options?.ast_edit);
		case "find":
			return createFindTool(cwd, options?.find);
		case "ls":
			return createLsTool(cwd, options?.ls);
		case "todo":
			return createTodoTool();
		case "web_search":
			return createWebSearchTool();
		default:
			throw new Error(`Unknown tool name: ${toolName}`);
	}
}

export function createCodingToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [
		createReadToolDefinition(cwd, options?.read),
		createBashToolDefinition(cwd, options?.bash),
		createEditToolDefinition(cwd, options?.edit),
		createWriteToolDefinition(cwd, options?.write),
	];
}

export function createReadOnlyToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [
		createReadToolDefinition(cwd, options?.read),
		createRipgrepToolDefinition(cwd, options?.ripgrep),
		createAstGrepToolDefinition(cwd),
		createFindToolDefinition(cwd, options?.find),
		createLsToolDefinition(cwd, options?.ls),
	];
}

export function createAllToolDefinitions(cwd: string, options?: ToolsOptions): Record<ToolName, ToolDef> {
	return {
		read: createReadToolDefinition(cwd, options?.read),
		bash: createBashToolDefinition(cwd, options?.bash),
		edit: createEditToolDefinition(cwd, options?.edit),
		write: createWriteToolDefinition(cwd, options?.write),
		ripgrep: createRipgrepToolDefinition(cwd, options?.ripgrep),
		ast_grep: createAstGrepToolDefinition(cwd),
		ast_edit: createAstEditToolDefinition(cwd, options?.ast_edit),
		find: createFindToolDefinition(cwd, options?.find),
		ls: createLsToolDefinition(cwd, options?.ls),
		todo: createTodoToolDefinition(),
		web_search: createWebSearchToolDefinition(),
	};
}

export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.read),
		createBashTool(cwd, options?.bash),
		createEditTool(cwd, options?.edit),
		createWriteTool(cwd, options?.write),
	];
}

export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.read),
		createRipgrepTool(cwd, options?.ripgrep),
		createAstGrepTool(cwd),
		createFindTool(cwd, options?.find),
		createLsTool(cwd, options?.ls),
	];
}

export function createAllTools(cwd: string, options?: ToolsOptions): Record<ToolName, Tool> {
	return {
		read: createReadTool(cwd, options?.read),
		bash: createBashTool(cwd, options?.bash),
		edit: createEditTool(cwd, options?.edit),
		write: createWriteTool(cwd, options?.write),
		ripgrep: createRipgrepTool(cwd, options?.ripgrep),
		ast_grep: createAstGrepTool(cwd),
		ast_edit: createAstEditTool(cwd, options?.ast_edit),
		find: createFindTool(cwd, options?.find),
		ls: createLsTool(cwd, options?.ls),
		todo: createTodoTool(),
		web_search: createWebSearchTool(),
	};
}
