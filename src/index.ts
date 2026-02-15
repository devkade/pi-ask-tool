import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import { askQuestion, type AskQuestion } from "./ask-logic";
import { askSingleQuestionWithInlineNote } from "./ask-inline-ui";
import { askQuestionsWithTabs } from "./ask-tabs-ui";

const OptionItemSchema = Type.Object({
	label: Type.String({ description: "Display label" }),
});

const QuestionItemSchema = Type.Object({
	id: Type.String({ description: "Question id (e.g. auth, cache, priority)" }),
	question: Type.String({ description: "Question text" }),
	options: Type.Array(OptionItemSchema, {
		description: "Available options. Do not include 'Other'.",
		minItems: 1,
	}),
	multi: Type.Optional(Type.Boolean({ description: "Allow multi-select" })),
	recommended: Type.Optional(
		Type.Number({ description: "0-indexed recommended option. '(Recommended)' is shown automatically." }),
	),
});

const AskParamsSchema = Type.Object({
	questions: Type.Array(QuestionItemSchema, { description: "Questions to ask", minItems: 1 }),
});

type AskParams = Static<typeof AskParamsSchema>;

interface QuestionResult {
	id: string;
	question: string;
	options: string[];
	multi: boolean;
	selectedOptions: string[];
	customInput?: string;
}

interface AskToolDetails {
	question?: string;
	options?: string[];
	multi?: boolean;
	selectedOptions?: string[];
	customInput?: string;
	results?: QuestionResult[];
}

function formatQuestionResult(result: QuestionResult): string {
	if (result.customInput) {
		return `${result.id}: \"${result.customInput}\"`;
	}
	if (result.selectedOptions.length > 0) {
		return result.multi
			? `${result.id}: [${result.selectedOptions.join(", ")}]`
			: `${result.id}: ${result.selectedOptions[0]}`;
	}
	return `${result.id}: (cancelled)`;
}

const ASK_TOOL_DESCRIPTION = `
Ask the user for clarification when a choice materially affects the outcome.

- Use when multiple valid approaches have different trade-offs.
- Prefer 2-5 concise options.
- Use multi=true when multiple answers are valid.
- Use recommended=<index> (0-indexed) to mark the default option.
- You can ask multiple related questions in one call using questions[].
- Do NOT include an 'Other' option; UI adds it automatically.
`.trim();

export default function askExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask",
		label: "Ask",
		description: ASK_TOOL_DESCRIPTION,
		parameters: AskParamsSchema,

		async execute(_toolCallId, params: AskParams, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "Error: ask tool requires interactive mode" }],
					details: {},
				};
			}

			if (params.questions.length === 0) {
				return {
					content: [{ type: "text", text: "Error: questions must not be empty" }],
					details: {},
				};
			}

			if (params.questions.length === 1) {
				const [q] = params.questions;
				const selection = q.multi
					? await askQuestion(ctx.ui, q as AskQuestion)
					: await askSingleQuestionWithInlineNote(ctx.ui, q as AskQuestion);
				const optionLabels = q.options.map((option) => option.label);
				const details: AskToolDetails = {
					question: q.question,
					options: optionLabels,
					multi: q.multi ?? false,
					selectedOptions: selection.selectedOptions,
					customInput: selection.customInput,
				};

				if (selection.customInput) {
					return {
						content: [{ type: "text", text: `User provided custom input: ${selection.customInput}` }],
						details,
					};
				}

				if (selection.selectedOptions.length > 0) {
					return {
						content: [{ type: "text", text: `User selected: ${selection.selectedOptions.join(", ")}` }],
						details,
					};
				}

				return {
					content: [{ type: "text", text: "User cancelled the selection" }],
					details,
				};
			}

			const results: QuestionResult[] = [];
			const hasMultiSelectQuestion = params.questions.some((q) => q.multi === true);

			if (!hasMultiSelectQuestion) {
				const tabResult = await askQuestionsWithTabs(ctx.ui, params.questions as AskQuestion[]);
				for (let i = 0; i < params.questions.length; i++) {
					const q = params.questions[i];
					const selection = tabResult.selections[i] ?? { selectedOptions: [] };
					results.push({
						id: q.id,
						question: q.question,
						options: q.options.map((option) => option.label),
						multi: q.multi ?? false,
						selectedOptions: selection.selectedOptions,
						customInput: selection.customInput,
					});
				}
			} else {
				for (const q of params.questions) {
					const selection = q.multi
						? await askQuestion(ctx.ui, q as AskQuestion)
						: await askSingleQuestionWithInlineNote(ctx.ui, q as AskQuestion);
					results.push({
						id: q.id,
						question: q.question,
						options: q.options.map((option) => option.label),
						multi: q.multi ?? false,
						selectedOptions: selection.selectedOptions,
						customInput: selection.customInput,
					});
				}
			}

			return {
				content: [{ type: "text", text: `User answers:\n${results.map(formatQuestionResult).join("\n")}` }],
				details: { results } satisfies AskToolDetails,
			};
		},
	});
}
