import { describe, expect, it } from "bun:test";
import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { askSingleQuestionWithInlineNote } from "../src/ask-inline-ui";
import { askQuestionsWithTabs, formatSelectionForSubmitReview } from "../src/ask-tabs-ui";

function createFakeTheme() {
	return {
		fg: (_color: string, text: string) => text,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		italic: (text: string) => text,
		underline: (text: string) => text,
		strikethrough: (text: string) => text,
	};
}

const RICH_MARKDOWN = `# Heading

A [link](https://example.com) and \`inline\` code with **bold** and *italic* and ~~strike~~ and <u>underline</u>.

---

> quoted line

- bullet item

\`\`\`text
code block
\`\`\`
`;

describe("askSingleQuestionWithInlineNote interactive branches", () => {
	it("requires note for Other before allowing submit", async () => {
		const ui = {
			custom: async (factory: any) => {
				const tui = { requestRender() {} };
				const theme = createFakeTheme();
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, theme, {}, done);
				component.render(26);
				component.handleInput("\u001b[B");
				component.handleInput("\r");
				component.render(26);
				component.handleInput("\r");
				const stillEditing = component.render(26).join("\n");
				expect(stillEditing).toContain("Typing note inline");
				for (const ch of "custom-flow") {
					component.handleInput(ch);
				}
				component.handleInput("\r");
				return result;
			},
		} as unknown as ExtensionUIContext;

		const result = await askSingleQuestionWithInlineNote(ui, {
			question: "Choose one very long answer so wrapped rendering is exercised in tests.",
			description: RICH_MARKDOWN,
			options: [{ label: "Default strategy with extra-long option label" }],
		});

		expect(result).toEqual({ selectedOptions: [], customInput: "custom-flow" });
	});

	it("cancels single-question flow on Ctrl-C, including from note editor", async () => {
		const ui = {
			custom: async (factory: any) => {
				const tui = { requestRender() {} };
				const theme = createFakeTheme();
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, theme, {}, done);
				component.render(40);
				component.handleInput("	");
				component.handleInput("draft");
				component.handleInput("");
				return result;
			},
		} as unknown as ExtensionUIContext;

		const result = await askSingleQuestionWithInlineNote(ui, {
			question: "Choose one",
			options: [{ label: "A" }, { label: "B" }],
		});

		expect(result).toEqual({ selectedOptions: [] });
	});

	it("handles navigation, inline edit exit, invalidate, and cancel", async () => {
		const ui = {
			custom: async (factory: any) => {
				const tui = { requestRender() {} };
				const theme = createFakeTheme();
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, theme, {}, done);
				component.render(80);
				component.handleInput("\t");
				component.handleInput("x");
				component.handleInput("\t");
				const withSavedNote = component.render(80).join("\n");
				expect(withSavedNote).toContain("Tab edit note");
				component.handleInput("\u001b[A");
				component.handleInput("\u001b[B");
				component.invalidate();
				component.render(80);
				component.handleInput("\u001b");
				return result;
			},
		} as unknown as ExtensionUIContext;

		const result = await askSingleQuestionWithInlineNote(ui, {
			question: "Pick one",
			options: [{ label: "A" }, { label: "B" }],
		});

		expect(result).toEqual({ selectedOptions: [] });
	});

	it("submits selected predefined option with Enter", async () => {
		const ui = {
			custom: async (factory: any) => {
				const tui = { requestRender() {} };
				const theme = createFakeTheme();
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, theme, {}, done);
				component.render(40);
				component.handleInput("\r");
				return result;
			},
		} as unknown as ExtensionUIContext;

		const result = await askSingleQuestionWithInlineNote(ui, {
			question: "Choose default",
			options: [{ label: "Fast path" }, { label: "Safe path" }],
		});

		expect(result).toEqual({ selectedOptions: ["Fast path"] });
	});
});

describe("askQuestionsWithTabs interactive branches", () => {
	it("covers multi-select toggling, Other note flow, and submit", async () => {
		const ui = {
			custom: async (factory: any) => {
				const tui = { requestRender() {} };
				const theme = createFakeTheme();
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, theme, {}, done);
				component.render(26);
				component.handleInput("\r");
				component.handleInput("\r");
				component.handleInput("\u001b[B");
				component.handleInput("\u001b[B");
				component.handleInput("\r");
				component.handleInput("\r");
				const emptyOtherStillEditing = component.render(26).join("\n");
				expect(emptyOtherStillEditing).toContain("Typing note inline");
				component.handleInput("\t");
				component.handleInput("\t");
				for (const ch of "org-sso") {
					component.handleInput(ch);
				}
				component.handleInput("\r");
				component.handleInput("\u001b[C");
				const submitScreen = component.render(26).join("\n");
				expect(submitScreen).toContain("Review answers");
				component.handleInput("\r");
				return result;
			},
		} as unknown as ExtensionUIContext;

		const result = await askQuestionsWithTabs(ui, [
			{
				id: "auth_methods",
				question: "Select all methods",
				description: RICH_MARKDOWN,
				options: [{ label: "JWT with very long explanatory label" }, { label: "Session" }],
				multi: true,
			},
		]);

		expect(result).toEqual({
			cancelled: false,
			selections: [{ selectedOptions: [], customInput: "org-sso" }],
		});
	});

	it("covers single-select Other note path and submit tab enter", async () => {
		const ui = {
			custom: async (factory: any) => {
				const tui = { requestRender() {} };
				const theme = createFakeTheme();
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, theme, {}, done);
				component.render(28);
				component.handleInput("\u001b[B");
				component.handleInput("\u001b[B");
				component.handleInput("\r");
				component.handleInput("\r");
				const emptyOtherStillEditing = component.render(28).join("\n");
				expect(emptyOtherStillEditing).toContain("Typing note inline");
				for (const ch of "edge-case") {
					component.handleInput(ch);
				}
				component.handleInput("\r");
				component.render(28);
				component.handleInput("\r");
				return result;
			},
		} as unknown as ExtensionUIContext;

		const result = await askQuestionsWithTabs(ui, [
			{
				id: "primary_choice",
				question: "Pick one option",
				options: [{ label: "Option A" }, { label: "Option B" }],
			},
		]);

		expect(result).toEqual({
			cancelled: false,
			selections: [{ selectedOptions: [], customInput: "edge-case" }],
		});
	});

	it("covers left/up navigation and non-Other single-select submit path", async () => {
		const ui = {
			custom: async (factory: any) => {
				const tui = { requestRender() {} };
				const theme = createFakeTheme();
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, theme, {}, done);
				component.render(40);
				component.handleInput("\u001b[A");
				component.handleInput("\u001b[D");
				component.handleInput("\u001b[C");
				component.handleInput("\r");
				component.render(40);
				component.handleInput("\r");
				return result;
			},
		} as unknown as ExtensionUIContext;

		const result = await askQuestionsWithTabs(ui, [
			{ id: "single_nav", question: "Single question", options: [{ label: "A" }, { label: "B" }] },
		]);

		expect(result).toEqual({
			cancelled: false,
			selections: [{ selectedOptions: ["A"] }],
		});
	});

	it("cancels tab flow on Ctrl-C from note editor", async () => {
		const ui = {
			custom: async (factory: any) => {
				const tui = { requestRender() {} };
				const theme = createFakeTheme();
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, theme, {}, done);
				component.render(40);
				component.handleInput("	");
				component.handleInput("memo");
				component.handleInput("");
				return result;
			},
		} as unknown as ExtensionUIContext;

		const result = await askQuestionsWithTabs(ui, [
			{ id: "q1", question: "Question 1", options: [{ label: "A" }, { label: "B" }] },
			{ id: "q2", question: "Question 2", options: [{ label: "C" }, { label: "D" }] },
		]);

		expect(result).toEqual({
			cancelled: true,
			selections: [{ selectedOptions: [] }, { selectedOptions: [] }],
		});
	});

	it("cancels tab flow on Ctrl-C from submit tab", async () => {
		const ui = {
			custom: async (factory: any) => {
				const tui = { requestRender() {} };
				const theme = createFakeTheme();
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, theme, {}, done);
				component.handleInput("\r");
				component.handleInput("\u001b[C");
				component.handleInput("\u0003");
				return result;
			},
		} as unknown as ExtensionUIContext;

		const result = await askQuestionsWithTabs(ui, [
			{ id: "q1", question: "Question 1", options: [{ label: "A" }] },
		]);

		expect(result).toEqual({
			cancelled: true,
			selections: [{ selectedOptions: [] }],
		});
	});

	it("covers submit-tab validation warning and cancel via Esc", async () => {
		const ui = {
			custom: async (factory: any) => {
				const tui = { requestRender() {} };
				const theme = createFakeTheme();
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, theme, {}, done);
				component.handleInput("\u001b[C");
				component.handleInput("\u001b[C");
				const submitWarning = component.render(32).join("\n");
				expect(submitWarning).toContain("Complete required answers");
				component.handleInput("\r");
				component.handleInput("\u001b");
				return result;
			},
		} as unknown as ExtensionUIContext;

		const result = await askQuestionsWithTabs(ui, [
			{ id: "q1", question: "Question 1", options: [{ label: "A" }] },
			{ id: "q2", question: "Question 2", options: [{ label: "B" }] },
		]);

		expect(result).toEqual({
			cancelled: true,
			selections: [{ selectedOptions: [] }, { selectedOptions: [] }],
		});
	});

	it("covers cancel via Esc on question tab and invalidate", async () => {
		const ui = {
			custom: async (factory: any) => {
				const tui = { requestRender() {} };
				const theme = createFakeTheme();
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, theme, {}, done);
				component.render(32);
				component.invalidate();
				component.render(32);
				component.handleInput("\u001b");
				return result;
			},
		} as unknown as ExtensionUIContext;

		const result = await askQuestionsWithTabs(ui, [
			{ id: "simple", question: "Simple", options: [{ label: "A" }, { label: "B" }] },
		]);

		expect(result).toEqual({
			cancelled: true,
			selections: [{ selectedOptions: [] }],
		});
	});

	it("clamps recommended indexes for negative, overflow, and valid values", async () => {
		const ui = {
			custom: async () => ({
				cancelled: false,
				selectedOptionIndexesByQuestion: [[0], [0], [0]],
				noteByQuestionByOption: [
					["", "", ""],
					["", "", ""],
					["", "", ""],
				],
			}),
		} as unknown as ExtensionUIContext;

		const result = await askQuestionsWithTabs(ui, [
			{ id: "neg", question: "Negative recommended", options: [{ label: "A" }, { label: "B" }], recommended: -1 },
			{ id: "over", question: "Overflow recommended", options: [{ label: "C" }, { label: "D" }], recommended: 99 },
			{ id: "ok", question: "Valid recommended", options: [{ label: "E" }, { label: "F" }], recommended: 1 },
		]);

		expect(result).toEqual({
			cancelled: false,
			selections: [{ selectedOptions: ["A"] }, { selectedOptions: ["C"] }, { selectedOptions: ["E"] }],
		});
	});
});

describe("formatSelectionForSubmitReview branch coverage", () => {
	it("returns selected-only value for single and multi modes", () => {
		expect(formatSelectionForSubmitReview({ selectedOptions: ["A"] }, false)).toBe("A");
		expect(formatSelectionForSubmitReview({ selectedOptions: ["A", "B"] }, true)).toBe("[A, B]");
	});

	it("returns not answered when nothing is selected", () => {
		expect(formatSelectionForSubmitReview({ selectedOptions: [] }, false)).toBe("(not answered)");
	});
});
