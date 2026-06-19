import type { AgentTool } from "@earendil-works/pie-agent-core";
import { StringEnum } from "@earendil-works/pie-ai";
import { Text } from "@earendil-works/pie-tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { AgentToolResult, ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

// =========================================================================
// Schema & Types
// =========================================================================

export interface TodoItem {
	id: number;
	text: string;
	done: boolean;
}

export interface TodoDetails {
	todos: TodoItem[];
	nextId: number;
}

const todoSchema = Type.Object({
	action: StringEnum(["list", "add", "toggle", "clear"] as const),
	text: Type.Optional(Type.String({ description: "Todo text (for add)" })),
	id: Type.Optional(Type.Number({ description: "Todo ID (for toggle)" })),
});

export type TodoInput = Static<typeof todoSchema>;

// =========================================================================
// In-memory store shared across tool instances
// =========================================================================

const globalTodos: TodoItem[] = [];
let globalNextId = 1;

// =========================================================================
// Widget visibility state (toggled by /todo slash command)
// =========================================================================

let todoWidgetEnabled = true;

export function isTodoWidgetEnabled(): boolean {
	return todoWidgetEnabled;
}

export function setTodoWidgetEnabled(enabled: boolean): void {
	todoWidgetEnabled = enabled;
}

export function getTodos(): TodoItem[] {
	return globalTodos;
}

export function resetState(): void {
	globalTodos.length = 0;
	globalNextId = 1;
}

// =========================================================================
// Rendering
// =========================================================================

function formatTodoCall(_args: TodoInput, _theme: Theme): string {
	return "";
}

function formatTodoResult(
	_result: { content: Array<{ type: string; text?: string }>; details?: TodoDetails },
	_options: ToolRenderResultOptions,
	_theme: Theme,
): string {
	return "";
}

// =========================================================================
// Tool Definition
// =========================================================================

export function createTodoToolDefinition(): ToolDefinition<typeof todoSchema, TodoDetails> {
	return {
		name: "todo",
		label: "todo",
		description: `Manage a todo list. Actions: list, add (with text), toggle (by id), clear. Use list to show current todos. The todo widget at the bottom of the screen updates automatically.`,
		promptSnippet: "Manage todos (add/list/toggle/clear)",
		promptGuidelines: [
			"Track multi-step progress with the todo tool instead of inline markdown checklists.",
			"After each significant step, toggle the todo as done so the user can track progress.",
		],
		parameters: todoSchema,
		execute(
			_toolCallId: string,
			params: TodoInput,
			_signal?: AbortSignal,
			_onUpdate?: any,
			_ctx?: any,
		): Promise<AgentToolResult<TodoDetails>> {
			switch (params.action) {
				case "list":
					return Promise.resolve({
						content: [{ type: "text", text: todosToText(globalTodos) }],
						details: { todos: [...globalTodos], nextId: globalNextId },
					});

				case "add": {
					if (!params.text) {
						return Promise.resolve({
							content: [{ type: "text", text: "Error: text required for add" }],
							details: { todos: [...globalTodos], nextId: globalNextId },
						});
					}
					const todo: TodoItem = { id: globalNextId++, text: params.text, done: false };
					globalTodos.push(todo);
					return Promise.resolve({
						content: [{ type: "text", text: `Added todo #${todo.id}: ${todo.text}` }],
						details: { todos: [...globalTodos], nextId: globalNextId },
					});
				}

				case "toggle": {
					if (params.id === undefined) {
						return Promise.resolve({
							content: [{ type: "text", text: "Error: id required for toggle" }],
							details: { todos: [...globalTodos], nextId: globalNextId },
						});
					}
					const todo = globalTodos.find((t) => t.id === params.id);
					if (!todo) {
						return Promise.resolve({
							content: [{ type: "text", text: `Todo #${params.id} not found` }],
							details: { todos: [...globalTodos], nextId: globalNextId },
						});
					}
					todo.done = !todo.done;
					return Promise.resolve({
						content: [{ type: "text", text: `Todo #${todo.id} ${todo.done ? "completed" : "reopened"}` }],
						details: { todos: [...globalTodos], nextId: globalNextId },
					});
				}

				case "clear": {
					const count = globalTodos.length;
					globalTodos.length = 0;
					globalNextId = 1;
					return Promise.resolve({
						content: [{ type: "text", text: `Cleared ${count} todos` }],
						details: { todos: [], nextId: 1 },
					});
				}

				default:
					return Promise.resolve({
						content: [{ type: "text", text: `Unknown action: ${params.action}` }],
						details: { todos: [...globalTodos], nextId: globalNextId },
					});
			}
		},
		renderCall(args, theme, _context) {
			return new Text(formatTodoCall(args as TodoInput, theme), 0, 0);
		},
		renderResult(result, options, theme, _context) {
			return new Text(formatTodoResult(result as any, options, theme), 0, 0);
		},
	};
}

function todosToText(todos: TodoItem[]): string {
	if (todos.length === 0) return "No todos";
	return todos.map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`).join("\n");
}

export function createTodoTool(): AgentTool<typeof todoSchema> {
	return wrapToolDefinition(createTodoToolDefinition());
}
