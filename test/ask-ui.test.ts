import { describe, expect, it } from "bun:test";
import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { OTHER_OPTION, type AskQuestion } from "../src/ask-logic";
import { askSingleQuestionWithInlineNote } from "../src/ask-inline-ui";
import { askQuestionsWithTabs, formatSelectionForSubmitReview } from "../src/ask-tabs-ui";

function uiWithCustomResult<T>(result: T): ExtensionUIContext {
	return {
		custom: async () => result,
	} as unknown as ExtensionUIContext;
}

describe("askSingleQuestionWithInlineNote", () => {
	it("combines selected option with note", async () => {
		const ui = uiWithCustomResult({
			cancelled: false,
			selectedOption: "Session auth (Recommended)",
			note: "split-session",
		});

		const result = await askSingleQuestionWithInlineNote(ui, {
			question: "Which auth?",
			options: [{ label: "JWT" }, { label: "Session auth" }],
			recommended: 1,
		});

		expect(result).toEqual({ selectedOptions: ["Session auth - split-session"] });
	});

	it("maps Other + note to customInput", async () => {
		const ui = uiWithCustomResult({
			cancelled: false,
			selectedOption: OTHER_OPTION,
			note: "custom-auth-flow",
		});

		const result = await askSingleQuestionWithInlineNote(ui, {
			question: "Which auth?",
			options: [{ label: "JWT" }],
		});

		expect(result).toEqual({ selectedOptions: [], customInput: "custom-auth-flow" });
	});

	it("returns empty selection when cancelled", async () => {
		const ui = uiWithCustomResult({ cancelled: true });

		const result = await askSingleQuestionWithInlineNote(ui, {
			question: "Which auth?",
			options: [{ label: "JWT" }],
		});

		expect(result).toEqual({ selectedOptions: [] });
	});
});

describe("formatSelectionForSubmitReview", () => {
	it("shows both selected options and custom input for multi selection", () => {
		const text = formatSelectionForSubmitReview(
			{ selectedOptions: ["JWT", "Session"], customInput: "org-sso" },
			true,
		);

		expect(text).toBe("[JWT, Session] + Other: org-sso");
	});

	it("shows custom input only when no selected options exist", () => {
		const text = formatSelectionForSubmitReview({ selectedOptions: [], customInput: "custom-only" }, true);
		expect(text).toBe("Other: custom-only");
	});
});

describe("askQuestionsWithTabs", () => {
	it("maps single-select questions from tab state", async () => {
		const questions: AskQuestion[] = [
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
		];

		const ui = uiWithCustomResult({
			cancelled: false,
			selectedOptionIndexesByQuestion: [[1], [0]],
			noteByQuestionByOption: [["", "split"], ["", ""]],
		});

		const result = await askQuestionsWithTabs(ui, questions);

		expect(result).toEqual({
			cancelled: false,
			selections: [{ selectedOptions: ["Session - split"] }, { selectedOptions: ["Redis"] }],
		});
	});

	it("maps mixed single+multi questions from tab state", async () => {
		const questions: AskQuestion[] = [
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
		];

		const ui = uiWithCustomResult({
			cancelled: false,
			selectedOptionIndexesByQuestion: [[0, 2], [1]],
			noteByQuestionByOption: [["", "", "org-sso"], ["", "local"]],
		});

		const result = await askQuestionsWithTabs(ui, questions);

		expect(result).toEqual({
			cancelled: false,
			selections: [
				{ selectedOptions: ["JWT"], customInput: "org-sso" },
				{ selectedOptions: ["None - local"] },
			],
		});
	});

	it("maps single multi-select question with submit tab state", async () => {
		const questions: AskQuestion[] = [
			{
				id: "auth",
				question: "Which auth methods?",
				options: [{ label: "JWT" }, { label: "Session" }],
				multi: true,
			},
		];

		const ui = uiWithCustomResult({
			cancelled: false,
			selectedOptionIndexesByQuestion: [[1]],
			noteByQuestionByOption: [["", "stateful"]],
		});

		const result = await askQuestionsWithTabs(ui, questions);

		expect(result).toEqual({
			cancelled: false,
			selections: [{ selectedOptions: ["Session - stateful"] }],
		});
	});

	it("returns empty selections when tab flow is cancelled", async () => {
		const questions: AskQuestion[] = [
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
		];

		const ui = uiWithCustomResult({
			cancelled: true,
			selectedOptionIndexesByQuestion: [[0, 2], [1]],
			noteByQuestionByOption: [["", "", "org-sso"], ["", "local"]],
		});

		const result = await askQuestionsWithTabs(ui, questions);

		expect(result).toEqual({
			cancelled: true,
			selections: [{ selectedOptions: [] }, { selectedOptions: [] }],
		});
	});
});
