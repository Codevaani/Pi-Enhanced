import type { AgentTool } from "@codevaani7838/pie-agent-core";
import { StringEnum } from "@codevaani7838/pie-ai";
import { Box, Spacer, Text } from "@codevaani7838/pie-tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { AgentToolResult, ToolDefinition } from "../extensions/types.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

// =========================================================================
// Schema
// =========================================================================

const todoSchema = Type.Object({
	action: StringEnum(["init", "set", "done", "undo", "clear", "list"] as const),
	phases: Type.Optional(
		Type.Array(
			Type.Object({
				name: Type.String({ description: "Phase name" }),
				tasks: Type.Array(Type.String({ description: "Task content" })),
			}),
			{ description: "Phases with tasks (for init/set)" },
		),
	),
	phase: Type.Optional(Type.String({ description: "Phase name (for done/undo)" })),
	task: Type.Optional(Type.String({ description: "Task content (for done/undo)" })),
});

export type TodoInput = Static<typeof todoSchema>;

// =========================================================================
// Data Model
// =========================================================================

export type TodoStatus = "pending" | "in_progress" | "completed" | "abandoned";

export interface TodoTask {
	content: string;
	status: TodoStatus;
}

export interface TodoPhase {
	name: string;
	tasks: TodoTask[];
}

export interface TodoDetails {
	phases: TodoPhase[];
	completedTasks: Array<{ phase: string; content: string }>;
}

// =========================================================================
// In-memory store
// =========================================================================

let globalPhases: TodoPhase[] = [];

export function getTodoPhases(): TodoPhase[] {
	return globalPhases;
}

export function setTodoPhases(phases: TodoPhase[]): void {
	globalPhases = phases;
}

// =========================================================================
// Widget visibility state
// =========================================================================

let todoWidgetEnabled = true;

export function isTodoWidgetEnabled(): boolean {
	return todoWidgetEnabled;
}

export function setTodoWidgetEnabled(enabled: boolean): void {
	todoWidgetEnabled = enabled;
}

export function resetState(): void {
	globalPhases = [];
}

// =========================================================================
// Roman numerals
// =========================================================================

function romanNumeral(index: number): string {
	const pairs: Array<[number, string]> = [
		[1000, "M"],
		[900, "CM"],
		[500, "D"],
		[400, "CD"],
		[100, "C"],
		[90, "XC"],
		[50, "L"],
		[40, "XL"],
		[10, "X"],
		[9, "IX"],
		[5, "V"],
		[4, "IV"],
		[1, "I"],
	];
	let out = "";
	let rem = index;
	for (const [value, sym] of pairs) {
		while (rem >= value) {
			out += sym;
			rem -= value;
		}
	}
	return out;
}

function formatPhaseName(name: string, oneBasedIndex: number): string {
	return `${romanNumeral(oneBasedIndex)}. ${name}`;
}

// =========================================================================
// Task line formatting
// =========================================================================

function formatTaskLine(task: TodoTask, theme: Theme): string {
	switch (task.status) {
		case "completed":
			return theme.fg("success", `✓ ${theme.strikethrough(task.content)}`);
		case "in_progress":
			return theme.fg("accent", `□ ${task.content}`);
		case "abandoned":
			return theme.fg("error", `□ ${theme.strikethrough(task.content)}`);
		default:
			return theme.fg("dim", `□ ${task.content}`);
	}
}

// =========================================================================
// Tree list rendering
// =========================================================================

function renderTreeList(
	tasks: TodoTask[],
	theme: Theme,
	options?: { expanded?: boolean; maxCollapsed?: number },
): string[] {
	const { expanded = true, maxCollapsed = 8 } = options ?? {};
	const maxItems = expanded ? tasks.length : Math.min(tasks.length, maxCollapsed);
	const lines: string[] = [];

	for (let i = 0; i < maxItems; i++) {
		const task = tasks[i]!;
		const isLast = i === maxItems - 1;
		const branch = isLast ? "└─ " : "├─ ";
		lines.push(`${branch}${formatTaskLine(task, theme)}`);
	}

	if (!expanded && tasks.length > maxCollapsed) {
		lines.push(`   ${theme.fg("muted", `+${tasks.length - maxCollapsed} more`)}`);
	}

	return lines;
}

// =========================================================================
// Phase summary (collapsed)
// =========================================================================

function formatPhaseSummary(phase: TodoPhase, oneBasedIndex: number, theme: Theme): string {
	const total = phase.tasks.length;
	const done = phase.tasks.filter((t) => t.status === "completed").length;
	return `${theme.fg("dim", theme.bold(formatPhaseName(phase.name, oneBasedIndex)))}${theme.fg("dim", `  ${done}/${total}`)}`;
}

// =========================================================================
// Compute touched phases
// =========================================================================

function computeTouchedPhases(completedTasks: Array<{ phase: string; content: string }>): Set<string> | null {
	const touched = new Set<string>();
	for (const ct of completedTasks) {
		touched.add(ct.phase);
	}
	return touched.size > 0 ? touched : null;
}

// =========================================================================
// Text output for model
// =========================================================================

function formatTextOutput(phases: TodoPhase[]): string {
	if (phases.length === 0) return "No todos";

	const lines: string[] = [];
	for (let i = 0; i < phases.length; i++) {
		const phase = phases[i]!;
		const total = phase.tasks.length;
		const done = phase.tasks.filter((t) => t.status === "completed").length;
		lines.push(`${romanNumeral(i + 1)}. ${phase.name} (${done}/${total})`);
		for (const task of phase.tasks) {
			const sym =
				task.status === "completed"
					? "✓"
					: task.status === "in_progress"
						? "→"
						: task.status === "abandoned"
							? "✗"
							: "○";
			lines.push(`  ${sym} ${task.content} [${task.status}]`);
		}
	}
	return lines.join("\n");
}

// =========================================================================
// Framed block rendering
// =========================================================================

function renderFramedBlock(
	phases: TodoPhase[],
	completedTasks: Array<{ phase: string; content: string }>,
	theme: Theme,
	options?: { expanded?: boolean },
): string {
	const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
	const touched = computeTouchedPhases(completedTasks);

	const headerLine = `${theme.fg("success", "✓")} ${theme.fg("accent", "Todo")} ${theme.fg("dim", `${totalTasks} tasks`)}`;

	const bodyLines: string[] = [];
	for (let p = 0; p < phases.length; p++) {
		const phase = phases[p]!;

		if (touched && !touched.has(phase.name)) {
			bodyLines.push(formatPhaseSummary(phase, p + 1, theme));
			continue;
		}

		bodyLines.push(theme.fg("accent", theme.bold(formatPhaseName(phase.name, p + 1))));

		const treeLines = renderTreeList(phase.tasks, theme, options);
		for (const line of treeLines) {
			bodyLines.push(`  ${line}`);
		}
	}

	const allLines = [headerLine, "", ...bodyLines];
	return allLines.join("\n");
}

// =========================================================================
// Framed block component
// =========================================================================

function createFramedBlock(
	phases: TodoPhase[],
	completedTasks: Array<{ phase: string; content: string }>,
	theme: Theme,
	options?: { expanded?: boolean },
): Box {
	const box = new Box(1, 1, (text: string) => text);

	const header = renderFramedBlock(phases, completedTasks, theme, options);
	const lines = header.split("\n");

	box.addChild(new Text(lines[0]!, 0, 0));
	box.addChild(new Spacer(0));
	for (let i = 1; i < lines.length; i++) {
		box.addChild(new Text(lines[i]!, 0, 0));
	}
	box.addChild(new Spacer(0));

	return box;
}

// =========================================================================
// Streaming call rendering
// =========================================================================

function formatCallText(args: TodoInput, theme: Theme): string {
	let line = `${theme.fg("muted", "⟳")} ${theme.fg("accent", "Todo")}`;
	const parts: string[] = [];

	if (args.phase) parts.push(args.phase);
	if (args.task) parts.push(args.task);
	if (args.action) parts.push(args.action);

	if (parts.length > 0) {
		line += ` ${theme.fg("muted", parts.join(" "))}`;
	}

	return line;
}

// =========================================================================
// Apply operations
// =========================================================================

function findTask(phaseName: string, taskContent: string): { phase: TodoPhase; task: TodoTask } | null {
	for (const phase of globalPhases) {
		if (phase.name !== phaseName) continue;
		for (const task of phase.tasks) {
			if (task.content === taskContent) {
				return { phase, task };
			}
		}
	}
	return null;
}

// =========================================================================
// Tool Definition
// =========================================================================

export function createTodoToolDefinition(): ToolDefinition<typeof todoSchema, TodoDetails> {
	return {
		name: "todo",
		label: "todo",
		description: `Manage phased todo lists. Actions: init (set up phases+tasks), set (add/update a phase), done (mark task completed), undo (undo completion), clear, list. The todo widget at the bottom updates automatically.`,
		promptSnippet: "Manage phased todos (init/set/done/undo/clear/list)",
		promptGuidelines: [
			"Track multi-step progress with the todo tool using phases and tasks.",
			"Use init to set up phases with tasks at the start of a multi-step task.",
			"After each significant step, call done to mark it completed.",
			"Use undo if a completion needs to be reversed.",
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
				case "init": {
					if (!params.phases || params.phases.length === 0) {
						return Promise.resolve({
							content: [{ type: "text", text: "Error: phases required for init" }],
							details: { phases: globalPhases, completedTasks: [] },
						});
					}
					globalPhases = params.phases.map((p) => ({
						name: p.name,
						tasks: p.tasks.map((t) => ({ content: t, status: "pending" as TodoStatus })),
					}));
					return Promise.resolve({
						content: [{ type: "text", text: formatTextOutput(globalPhases) }],
						details: { phases: globalPhases, completedTasks: [] },
					});
				}

				case "set": {
					if (!params.phase) {
						return Promise.resolve({
							content: [{ type: "text", text: "Error: phase required for set" }],
							details: { phases: globalPhases, completedTasks: [] },
						});
					}
					const existing = globalPhases.find((p) => p.name === params.phase);
					const newTasks: TodoTask[] = (params.phases?.[0]?.tasks ?? []).map((t) => {
						const found = existing?.tasks.find((et) => et.content === t);
						return found ?? { content: t, status: "pending" as TodoStatus };
					});
					if (existing) {
						existing.tasks = newTasks;
					} else {
						globalPhases.push({ name: params.phase, tasks: newTasks });
					}
					return Promise.resolve({
						content: [{ type: "text", text: formatTextOutput(globalPhases) }],
						details: { phases: globalPhases, completedTasks: [] },
					});
				}

				case "done": {
					if (!params.phase || !params.task) {
						return Promise.resolve({
							content: [{ type: "text", text: "Error: phase and task required for done" }],
							details: { phases: globalPhases, completedTasks: [] },
						});
					}
					const found = findTask(params.phase, params.task);
					if (!found) {
						return Promise.resolve({
							content: [{ type: "text", text: `Task not found: ${params.task} in ${params.phase}` }],
							details: { phases: globalPhases, completedTasks: [] },
						});
					}
					found.task.status = "completed";
					const completedTasks = [{ phase: params.phase, content: params.task }];
					return Promise.resolve({
						content: [{ type: "text", text: formatTextOutput(globalPhases) }],
						details: { phases: globalPhases, completedTasks },
					});
				}

				case "undo": {
					if (!params.phase || !params.task) {
						return Promise.resolve({
							content: [{ type: "text", text: "Error: phase and task required for undo" }],
							details: { phases: globalPhases, completedTasks: [] },
						});
					}
					const undoFound = findTask(params.phase, params.task);
					if (!undoFound) {
						return Promise.resolve({
							content: [{ type: "text", text: `Task not found: ${params.task} in ${params.phase}` }],
							details: { phases: globalPhases, completedTasks: [] },
						});
					}
					undoFound.task.status = "pending";
					return Promise.resolve({
						content: [{ type: "text", text: formatTextOutput(globalPhases) }],
						details: { phases: globalPhases, completedTasks: [] },
					});
				}

				case "clear": {
					const count = globalPhases.reduce((sum, p) => sum + p.tasks.length, 0);
					globalPhases = [];
					return Promise.resolve({
						content: [{ type: "text", text: `Cleared ${count} todos` }],
						details: { phases: [], completedTasks: [] },
					});
				}

				default:
					return Promise.resolve({
						content: [{ type: "text", text: formatTextOutput(globalPhases) }],
						details: { phases: globalPhases, completedTasks: [] },
					});
			}
		},
		renderCall(args, theme, _context) {
			return new Text(formatCallText(args as TodoInput, theme), 0, 0);
		},
		renderResult(result, _options, theme, _context) {
			const details = (result as AgentToolResult<TodoDetails>).details;
			const phases = details?.phases ?? [];
			const completedTasks = details?.completedTasks ?? [];

			if (phases.length === 0) {
				return new Text(`${theme.fg("muted", "No todos")}`, 0, 0);
			}

			return createFramedBlock(phases, completedTasks, theme);
		},
	};
}

export function createTodoTool(): AgentTool<typeof todoSchema> {
	return wrapToolDefinition(createTodoToolDefinition());
}
