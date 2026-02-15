import { describe, expect, it } from "bun:test";
import type { ExtensionAPI, ExtensionUIContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import askExtension from "../src/index";

type AskTool = ToolDefinition<any, any>;

function createAskTool(): AskTool {
	let registered: AskTool | undefined;
	const pi = {
		registerTool(tool: AskTool) {
			registered = tool;
		},
	} as unknown as ExtensionAPI;

	askExtension(pi);

	if (!registered) throw new Error("ask tool was not registered");
	return registered;
}

function uiWithCustomQueue(queue: any[]): ExtensionUIContext {
	return {
		custom: async () => {
			if (queue.length === 0) throw new Error("custom() called more times than expected");
			return queue.shift();
		},
	} as unknown as ExtensionUIContext;
}

describe("ask extension tool", () => {
	it("registers ask tool", () => {
		const tool = createAskTool();
		expect(tool.name).toBe("ask");
		expect(tool.label).toBe("Ask");
	});

	it("returns error when UI is unavailable", async () => {
		const tool = createAskTool();
		const result = await tool.execute(
			"call-1",
			{ questions: [{ id: "auth", question: "Which auth?", options: [{ label: "JWT" }] }] },
			undefined,
			undefined,
			{ hasUI: false } as any,
		);

		expect(result.content[0].type).toBe("text");
		expect((result.content[0] as any).text).toContain("requires interactive mode");
	});

	it("returns error when questions is empty", async () => {
		const tool = createAskTool();
		const result = await tool.execute("call-2", { questions: [] }, undefined, undefined, {
			hasUI: true,
			ui: uiWithCustomQueue([]),
		} as any);

		expect((result.content[0] as any).text).toContain("questions must not be empty");
	});

	it("handles single non-multi question via inline note UI", async () => {
		const tool = createAskTool();
		const result = await tool.execute(
			"call-3",
			{
				questions: [
					{
						id: "auth",
						question: "Which auth?",
						options: [{ label: "JWT" }, { label: "Session" }],
					},
				],
			},
			undefined,
			undefined,
			{
				hasUI: true,
				ui: uiWithCustomQueue([{ cancelled: false, selectedOption: "Session", note: "split" }]),
			} as any,
		);

		expect((result.content[0] as any).text).toBe("User selected: Session - split");
		expect(result.details).toEqual({
			question: "Which auth?",
			options: ["JWT", "Session"],
			multi: false,
			selectedOptions: ["Session - split"],
			customInput: undefined,
		});
	});

	it("handles single multi question via tab submit flow", async () => {
		const tool = createAskTool();
		const result = await tool.execute(
			"call-4",
			{
				questions: [
					{
						id: "auth",
						question: "Which auth methods?",
						options: [{ label: "JWT" }, { label: "Session" }],
						multi: true,
					},
				],
			},
			undefined,
			undefined,
			{
				hasUI: true,
				ui: uiWithCustomQueue([
					{
						cancelled: false,
						selectedOptionIndexesByQuestion: [[0, 2]],
						noteByQuestionByOption: [["", "", "org-sso"]],
					},
				]),
			} as any,
		);

		expect((result.content[0] as any).text).toBe("User provided custom input: org-sso");
		expect(result.details).toEqual({
			question: "Which auth methods?",
			options: ["JWT", "Session"],
			multi: true,
			selectedOptions: ["JWT"],
			customInput: "org-sso",
		});
	});

	it("returns cancelled for single multi question when tab flow is cancelled", async () => {
		const tool = createAskTool();
		const result = await tool.execute(
			"call-4b",
			{
				questions: [
					{
						id: "auth",
						question: "Which auth methods?",
						options: [{ label: "JWT" }, { label: "Session" }],
						multi: true,
					},
				],
			},
			undefined,
			undefined,
			{
				hasUI: true,
				ui: uiWithCustomQueue([
					{
						cancelled: true,
						selectedOptionIndexesByQuestion: [[0, 2]],
						noteByQuestionByOption: [["", "", "org-sso"]],
					},
				]),
			} as any,
		);

		expect((result.content[0] as any).text).toBe("User cancelled the selection");
		expect(result.details).toEqual({
			question: "Which auth methods?",
			options: ["JWT", "Session"],
			multi: true,
			selectedOptions: [],
			customInput: undefined,
		});
	});

	it("uses tabbed flow for multiple single-select questions", async () => {
		const tool = createAskTool();
		const result = await tool.execute(
			"call-5",
			{
				questions: [
					{
						id: "auth",
						question: "Which auth?",
						options: [{ label: "JWT" }, { label: "Session" }],
					},
					{
						id: "cache",
						question: "Which cache?",
						options: [{ label: "Redis" }, { label: "None" }],
					},
				],
			},
			undefined,
			undefined,
			{
				hasUI: true,
				ui: uiWithCustomQueue([
					{
						cancelled: false,
						selectedOptionIndexesByQuestion: [[0], [1]],
						noteByQuestionByOption: [["", ""], ["", ""]],
					},
				]),
			} as any,
		);

		expect((result.content[0] as any).text).toBe("User answers:\nauth: JWT\ncache: None");
		expect(result.details?.results).toEqual([
			{
				id: "auth",
				question: "Which auth?",
				options: ["JWT", "Session"],
				multi: false,
				selectedOptions: ["JWT"],
				customInput: undefined,
			},
			{
				id: "cache",
				question: "Which cache?",
				options: ["Redis", "None"],
				multi: false,
				selectedOptions: ["None"],
				customInput: undefined,
			},
		]);
	});

	it("uses tab flow when any question is multi-select", async () => {
		const tool = createAskTool();
		const result = await tool.execute(
			"call-6",
			{
				questions: [
					{
						id: "auth",
						question: "Which auth methods?",
						options: [{ label: "JWT" }, { label: "Session" }],
						multi: true,
					},
					{
						id: "cache",
						question: "Which cache?",
						options: [{ label: "Redis" }, { label: "None" }],
					},
				],
			},
			undefined,
			undefined,
			{
				hasUI: true,
				ui: uiWithCustomQueue([
					{
						cancelled: false,
						selectedOptionIndexesByQuestion: [[1], [0]],
						noteByQuestionByOption: [["", ""], ["local", ""]],
					},
				]),
			} as any,
		);

		expect((result.content[0] as any).text).toBe("User answers:\nauth: [Session]\ncache: Redis - local");
		expect(result.details?.results).toEqual([
			{
				id: "auth",
				question: "Which auth methods?",
				options: ["JWT", "Session"],
				multi: true,
				selectedOptions: ["Session"],
				customInput: undefined,
			},
			{
				id: "cache",
				question: "Which cache?",
				options: ["Redis", "None"],
				multi: false,
				selectedOptions: ["Redis - local"],
				customInput: undefined,
			},
		]);
	});

	it("returns cancelled markers for all questions when tab flow is cancelled", async () => {
		const tool = createAskTool();
		const result = await tool.execute(
			"call-6b",
			{
				questions: [
					{
						id: "auth",
						question: "Which auth methods?",
						options: [{ label: "JWT" }, { label: "Session" }],
						multi: true,
					},
					{
						id: "cache",
						question: "Which cache?",
						options: [{ label: "Redis" }, { label: "None" }],
					},
				],
			},
			undefined,
			undefined,
			{
				hasUI: true,
				ui: uiWithCustomQueue([
					{
						cancelled: true,
						selectedOptionIndexesByQuestion: [[1], [0]],
						noteByQuestionByOption: [["", ""], ["local", ""]],
					},
				]),
			} as any,
		);

		expect((result.content[0] as any).text).toBe("User answers:\nauth: (cancelled)\ncache: (cancelled)");
		expect(result.details?.results).toEqual([
			{
				id: "auth",
				question: "Which auth methods?",
				options: ["JWT", "Session"],
				multi: true,
				selectedOptions: [],
				customInput: undefined,
			},
			{
				id: "cache",
				question: "Which cache?",
				options: ["Redis", "None"],
				multi: false,
				selectedOptions: [],
				customInput: undefined,
			},
		]);
	});
});
