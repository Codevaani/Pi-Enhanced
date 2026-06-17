import { beforeEach, describe, expect, it } from "vitest";
import { createTodoTool, getTodos, resetState } from "../src/core/tools/todo.ts";

const todoTool = createTodoTool();

describe("todo tool", () => {
	beforeEach(() => {
		resetState();
	});

	it("should add a todo", async () => {
		const result = await todoTool.execute("call-1", { action: "add", text: "Fix login bug" });
		const text = result.content[0] as any;
		expect(text.text).toBe("Added todo #1: Fix login bug");

		// Global state updated
		expect(getTodos()).toHaveLength(1);
		expect(getTodos()[0].text).toBe("Fix login bug");
		expect(getTodos()[0].done).toBe(false);
	});

	it("should list todos", async () => {
		await todoTool.execute("call-1", { action: "add", text: "Task A" });
		await todoTool.execute("call-2", { action: "add", text: "Task B" });

		const result = await todoTool.execute("call-3", { action: "list" });
		const text = result.content[0] as any;
		expect(text.text).toContain("Task A");
		expect(text.text).toContain("Task B");
	});

	it("should toggle a todo", async () => {
		await todoTool.execute("call-1", { action: "add", text: "Task A" });
		const result = await todoTool.execute("call-2", { action: "toggle", id: 1 });
		const text = result.content[0] as any;
		expect(text.text).toBe("Todo #1 completed");
		expect(getTodos()[0].done).toBe(true);

		// Toggle again to uncomplete
		await todoTool.execute("call-3", { action: "toggle", id: 1 });
		expect(getTodos()[0].done).toBe(false);
	});

	it("should clear all todos", async () => {
		await todoTool.execute("call-1", { action: "add", text: "Task A" });
		await todoTool.execute("call-2", { action: "add", text: "Task B" });
		expect(getTodos()).toHaveLength(2);

		await todoTool.execute("call-3", { action: "clear" });
		expect(getTodos()).toHaveLength(0);
	});

	it("should return error for toggle with invalid id", async () => {
		const result = await todoTool.execute("call-1", { action: "toggle", id: 999 });
		const text = result.content[0] as any;
		expect(text.text).toBe("Todo #999 not found");
	});

	it("should return error for add without text", async () => {
		const result = await todoTool.execute("call-1", { action: "add" } as any);
		const text = result.content[0] as any;
		expect(text.text).toBe("Error: text required for add");
	});
});
