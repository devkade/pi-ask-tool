import { describe, expect, it } from "bun:test";
import type { ExtensionAPI, ExtensionUIContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { OTHER_OPTION } from "../src/ask-logic";
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

function getTextContent(result: any): string {
	return result.content[0]?.type === "text" ? result.content[0].text : "";
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
		expect(getTextContent(result)).toContain("requires interactive mode");
	});

	it("returns error when questions is empty", async () => {
		const tool = createAskTool();
		const result = await tool.execute("call-2", { questions: [] }, undefined, undefined, {
			hasUI: true,
			ui: uiWithCustomQueue([]),
		} as any);

		expect(getTextContent(result)).toContain("questions must not be empty");
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

		const text = getTextContent(result);
		expect(text).toContain("User answers:\nauth: Session - split");
		expect(text).toContain("Question 1 (auth)");
		expect(text).toContain("Prompt: Which auth?");
		expect(text).toContain("1. JWT");
		expect(text).toContain("2. Session");
		expect(text).toContain("Selected: Session - split");
		expect(result.details).toEqual({
			id: "auth",
			question: "Which auth?",
			options: ["JWT", "Session"],
			multi: false,
			selectedOptions: ["Session - split"],
			customInput: undefined,
			results: [
				{
					id: "auth",
					question: "Which auth?",
					options: ["JWT", "Session"],
					multi: false,
					selectedOptions: ["Session - split"],
					customInput: undefined,
				},
			],
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

		const text = getTextContent(result);
		expect(text).toContain('User answers:\nauth: [JWT] + Other: "org-sso"');
		expect(text).toContain("Question 1 (auth)");
		expect(text).toContain("Prompt: Which auth methods?");
		expect(text).toContain("Selected: [JWT]");
		expect(text).toContain("Custom input: org-sso");
		expect(result.details).toEqual({
			id: "auth",
			question: "Which auth methods?",
			options: ["JWT", "Session"],
			multi: true,
			selectedOptions: ["JWT"],
			customInput: "org-sso",
			results: [
				{
					id: "auth",
					question: "Which auth methods?",
					options: ["JWT", "Session"],
					multi: true,
					selectedOptions: ["JWT"],
					customInput: "org-sso",
				},
			],
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

		const text = getTextContent(result);
		expect(text).toContain("User answers:\nauth: (cancelled)");
		expect(text).toContain("Question 1 (auth)");
		expect(text).toContain("Selected: (cancelled)");
		expect(result.details).toEqual({
			id: "auth",
			question: "Which auth methods?",
			options: ["JWT", "Session"],
			multi: true,
			selectedOptions: [],
			customInput: undefined,
			results: [
				{
					id: "auth",
					question: "Which auth methods?",
					options: ["JWT", "Session"],
					multi: true,
					selectedOptions: [],
					customInput: undefined,
				},
			],
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

		const text = getTextContent(result);
		expect(text).toContain("User answers:\nauth: JWT\ncache: None");
		expect(text).toContain("Question 1 (auth)");
		expect(text).toContain("Prompt: Which auth?");
		expect(text).toContain("Question 2 (cache)");
		expect(text).toContain("Prompt: Which cache?");
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

		const text = getTextContent(result);
		expect(text).toContain("User answers:\nauth: [Session]\ncache: Redis - local");
		expect(text).toContain("Question 1 (auth)");
		expect(text).toContain("Selected: [Session]");
		expect(text).toContain("Question 2 (cache)");
		expect(text).toContain("Selected: Redis - local");
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

		const text = getTextContent(result);
		expect(text).toContain("User answers:\nauth: (cancelled)\ncache: (cancelled)");
		expect(text).toContain("Question 1 (auth)");
		expect(text).toContain("Question 2 (cache)");
		expect(text).toContain("Selected: (cancelled)");
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

	it("records custom-only answers with explicit Other context", async () => {
		const tool = createAskTool();
		const result = await tool.execute(
			"call-7",
			{
				questions: [
					{
						id: "auth",
						question: "Which auth approach?",
						options: [{ label: "JWT" }, { label: "Session" }],
					},
				],
			},
			undefined,
			undefined,
			{
				hasUI: true,
				ui: uiWithCustomQueue([{ cancelled: false, selectedOption: OTHER_OPTION, note: "enterprise\nsso" }]),
			} as any,
		);

		const text = getTextContent(result);
		expect(text).toContain('User answers:\nauth: "enterprise sso"');
		expect(text).toContain(`Selected: ${OTHER_OPTION}`);
		expect(text).toContain("Custom input: enterprise sso");
		expect(result.details?.customInput).toBe("enterprise\nsso");
		expect(result.details?.results?.[0]?.customInput).toBe("enterprise\nsso");
	});

	it("sanitizes prompt/options/answer text in session output while preserving raw details", async () => {
		const tool = createAskTool();
		const result = await tool.execute(
			"call-8",
			{
				questions: [
					{
						id: "auth\nmode",
						question: "Which\tauth?\nNow",
						options: [{ label: "JWT\tFast" }, { label: "Sess\nion\u0007" }],
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
						selectedOption: "Sess\nion\u0007",
						note: "line1\nline2\t\u0007",
					},
				]),
			} as any,
		);

		const text = getTextContent(result);
		expect(text).toContain("User answers:\nauth mode: Sess ion - line1 line2");
		expect(text).toContain("Question 1 (auth mode)");
		expect(text).toContain("Prompt: Which auth? Now");
		expect(text).toContain("1. JWT Fast");
		expect(text).toContain("2. Sess ion");
		expect(text).toContain("Selected: Sess ion - line1 line2");

		expect(result.details?.id).toBe("auth\nmode");
		expect(result.details?.question).toBe("Which\tauth?\nNow");
		expect(result.details?.options).toEqual(["JWT\tFast", "Sess\nion\u0007"]);
		expect(result.details?.selectedOptions).toEqual(["Sess\nion\u0007 - line1\nline2\t\u0007"]);
	});

	it("keeps question numbering and block order deterministic", async () => {
		const tool = createAskTool();
		const result = await tool.execute(
			"call-9",
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
					{
						id: "priority",
						question: "What should we optimize first?",
						options: [{ label: "Latency" }, { label: "Cost" }],
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
						selectedOptionIndexesByQuestion: [[1], [0], [0]],
						noteByQuestionByOption: [["", ""], ["", ""], ["", ""]],
					},
				]),
			} as any,
		);

		const text = getTextContent(result);
		const q1Index = text.indexOf("Question 1 (auth)");
		const q2Index = text.indexOf("Question 2 (cache)");
		const q3Index = text.indexOf("Question 3 (priority)");
		expect(q1Index).toBeGreaterThan(-1);
		expect(q2Index).toBeGreaterThan(q1Index);
		expect(q3Index).toBeGreaterThan(q2Index);
	});
});
