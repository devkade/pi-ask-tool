import { describe, expect, it } from "bun:test";
import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { OTHER_OPTION, type AskQuestion } from "../src/ask-logic";
import { askSingleQuestionWithInlineNote } from "../src/ask-inline-ui";
import { askMultiQuestionWithInlineNote } from "../src/ask-multi-ui";
import { askQuestionsWithTabs } from "../src/ask-tabs-ui";

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

describe("askMultiQuestionWithInlineNote", () => {
	it("builds selected options and customInput from UI state", async () => {
		const ui = uiWithCustomResult({
			cancelled: false,
			selectedIndexes: [0, 1, 2],
			notes: ["", "stateful", "organization-sso"],
		});

		const result = await askMultiQuestionWithInlineNote(ui, {
			question: "Choose auth features",
			options: [{ label: "JWT" }, { label: "Session" }],
			recommended: 1,
		});

		expect(result).toEqual({
			selectedOptions: ["JWT", "Session - stateful"],
			customInput: "organization-sso",
		});
	});

	it("returns empty selection when cancelled", async () => {
		const ui = uiWithCustomResult({ cancelled: true, selectedIndexes: [0], notes: [""] });

		const result = await askMultiQuestionWithInlineNote(ui, {
			question: "Choose auth features",
			options: [{ label: "JWT" }, { label: "Session" }],
		});

		expect(result).toEqual({ selectedOptions: [] });
	});
});

describe("askQuestionsWithTabs", () => {
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

	it("returns mapped selections for each tab", async () => {
		const ui = uiWithCustomResult({
			cancelled: false,
			selectedIndexes: [1, 0],
			notes: ["split", ""],
			answered: [true, true],
		});

		const result = await askQuestionsWithTabs(ui, questions);

		expect(result).toEqual({
			cancelled: false,
			selections: [{ selectedOptions: ["Session - split"] }, { selectedOptions: ["Redis"] }],
		});
	});

	it("maps Other to customInput in tabs flow", async () => {
		const ui = uiWithCustomResult({
			cancelled: false,
			selectedIndexes: [0, 2],
			notes: ["", "custom-cache"],
			answered: [true, true],
		});

		const result = await askQuestionsWithTabs(ui, questions);

		expect(result).toEqual({
			cancelled: false,
			selections: [{ selectedOptions: ["JWT"] }, { selectedOptions: [], customInput: "custom-cache" }],
		});
	});

	it("returns empty selection for unanswered questions", async () => {
		const ui = uiWithCustomResult({
			cancelled: true,
			selectedIndexes: [0, 0],
			notes: ["", ""],
			answered: [true, false],
		});

		const result = await askQuestionsWithTabs(ui, questions);

		expect(result).toEqual({
			cancelled: true,
			selections: [{ selectedOptions: ["JWT"] }, { selectedOptions: [] }],
		});
	});
});
