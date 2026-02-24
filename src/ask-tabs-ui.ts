import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import {
	OTHER_OPTION,
	appendRecommendedTagToOptionLabels,
	buildMultiSelectionResult,
	buildSingleSelectionResult,
	type AskQuestion,
	type AskSelection,
} from "./ask-logic";
import { INLINE_NOTE_WRAP_PADDING, buildWrappedOptionLabelWithInlineNote } from "./ask-inline-note";

interface PreparedQuestion {
	id: string;
	question: string;
	options: string[];
	tabLabel: string;
	multi: boolean;
	otherOptionIndex: number;
}

interface TabsUIState {
	cancelled: boolean;
	selectedOptionIndexesByQuestion: number[][];
	noteByQuestionByOption: string[][];
}

export function formatSelectionForSubmitReview(selection: AskSelection, isMulti: boolean): string {
	const hasSelectedOptions = selection.selectedOptions.length > 0;
	const hasCustomInput = Boolean(selection.customInput);

	if (hasSelectedOptions && hasCustomInput) {
		const selectedPart = isMulti
			? `[${selection.selectedOptions.join(", ")}]`
			: selection.selectedOptions[0];
		return `${selectedPart} + Other: ${selection.customInput}`;
	}

	if (hasCustomInput) {
		return `Other: ${selection.customInput}`;
	}

	if (hasSelectedOptions) {
		return isMulti ? `[${selection.selectedOptions.join(", ")}]` : selection.selectedOptions[0];
	}

	return "(not answered)";
}

function clampIndex(index: number | undefined, maxExclusive: number): number {
	if (index == null || Number.isNaN(index) || maxExclusive <= 0) return 0;
	if (index < 0) return 0;
	if (index >= maxExclusive) return maxExclusive - 1;
	return index;
}

function normalizeTabLabel(id: string, fallback: string): string {
	const normalized = id.trim().replace(/[_-]+/g, " ");
	return normalized.length > 0 ? normalized : fallback;
}

function buildSelectionForQuestion(
	question: PreparedQuestion,
	selectedOptionIndexes: number[],
	noteByOptionIndex: string[],
): AskSelection {
	if (selectedOptionIndexes.length === 0) {
		return { selectedOptions: [] };
	}

	if (question.multi) {
		return buildMultiSelectionResult(question.options, selectedOptionIndexes, noteByOptionIndex, question.otherOptionIndex);
	}

	const selectedOptionIndex = selectedOptionIndexes[0];
	const selectedOptionLabel = question.options[selectedOptionIndex] ?? OTHER_OPTION;
	const note = noteByOptionIndex[selectedOptionIndex] ?? "";
	return buildSingleSelectionResult(selectedOptionLabel, note);
}

function isQuestionSelectionValid(
	question: PreparedQuestion,
	selectedOptionIndexes: number[],
	noteByOptionIndex: string[],
): boolean {
	if (selectedOptionIndexes.length === 0) return false;
	if (!selectedOptionIndexes.includes(question.otherOptionIndex)) return true;
	const otherNote = noteByOptionIndex[question.otherOptionIndex]?.trim() ?? "";
	return otherNote.length > 0;
}

function createTabsUiStateSnapshot(
	cancelled: boolean,
	selectedOptionIndexesByQuestion: number[][],
	noteByQuestionByOption: string[][],
): TabsUIState {
	return {
		cancelled,
		selectedOptionIndexesByQuestion: selectedOptionIndexesByQuestion.map((indexes) => [...indexes]),
		noteByQuestionByOption: noteByQuestionByOption.map((notes) => [...notes]),
	};
}

function addIndexToSelection(selectedOptionIndexes: number[], optionIndex: number): number[] {
	if (selectedOptionIndexes.includes(optionIndex)) return selectedOptionIndexes;
	return [...selectedOptionIndexes, optionIndex].sort((a, b) => a - b);
}

function removeIndexFromSelection(selectedOptionIndexes: number[], optionIndex: number): number[] {
	return selectedOptionIndexes.filter((index) => index !== optionIndex);
}

export async function askQuestionsWithTabs(
	ui: ExtensionUIContext,
	questions: AskQuestion[],
): Promise<{ cancelled: boolean; selections: AskSelection[] }> {
	const preparedQuestions: PreparedQuestion[] = questions.map((question, questionIndex) => {
		const baseOptionLabels = question.options.map((option) => option.label);
		const optionLabels = [...appendRecommendedTagToOptionLabels(baseOptionLabels, question.recommended), OTHER_OPTION];
		return {
			id: question.id,
			question: question.question,
			options: optionLabels,
			tabLabel: normalizeTabLabel(question.id, `Q${questionIndex + 1}`),
			multi: question.multi === true,
			otherOptionIndex: optionLabels.length - 1,
		};
	});

	const initialCursorOptionIndexByQuestion = preparedQuestions.map((preparedQuestion, questionIndex) =>
		clampIndex(questions[questionIndex].recommended, preparedQuestion.options.length),
	);

	const result = await ui.custom<TabsUIState>((tui, theme, _keybindings, done) => {
		let activeTabIndex = 0;
		let isNoteEditorOpen = false;
		let cachedRenderedLines: string[] | undefined;
		const cursorOptionIndexByQuestion = [...initialCursorOptionIndexByQuestion];
		const selectedOptionIndexesByQuestion = preparedQuestions.map(() => [] as number[]);
		const noteByQuestionByOption = preparedQuestions.map((preparedQuestion) =>
			Array(preparedQuestion.options.length).fill("") as string[],
		);

		const editorTheme: EditorTheme = {
			borderColor: (text) => theme.fg("accent", text),
			selectList: {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			},
		};
		const noteEditor = new Editor(tui, editorTheme);

		const submitTabIndex = preparedQuestions.length;

		const requestUiRerender = () => {
			cachedRenderedLines = undefined;
			tui.requestRender();
		};

		const getActiveQuestionIndex = (): number | null => {
			if (activeTabIndex >= preparedQuestions.length) return null;
			return activeTabIndex;
		};

		const getQuestionNote = (questionIndex: number, optionIndex: number): string =>
			noteByQuestionByOption[questionIndex]?.[optionIndex] ?? "";

		const getTrimmedQuestionNote = (questionIndex: number, optionIndex: number): string =>
			getQuestionNote(questionIndex, optionIndex).trim();

		const isAllQuestionSelectionsValid = (): boolean =>
			preparedQuestions.every((preparedQuestion, questionIndex) =>
				isQuestionSelectionValid(
					preparedQuestion,
					selectedOptionIndexesByQuestion[questionIndex],
					noteByQuestionByOption[questionIndex],
				),
			);

		const openNoteEditorForActiveOption = () => {
			const questionIndex = getActiveQuestionIndex();
			if (questionIndex == null) return;

			isNoteEditorOpen = true;
			const optionIndex = cursorOptionIndexByQuestion[questionIndex];
			noteEditor.setText(getQuestionNote(questionIndex, optionIndex));
			requestUiRerender();
		};

		const advanceToNextTabOrSubmit = () => {
			activeTabIndex = Math.min(submitTabIndex, activeTabIndex + 1);
		};

		noteEditor.onChange = (value) => {
			const questionIndex = getActiveQuestionIndex();
			if (questionIndex == null) return;
			const optionIndex = cursorOptionIndexByQuestion[questionIndex];
			noteByQuestionByOption[questionIndex][optionIndex] = value;
			requestUiRerender();
		};

		noteEditor.onSubmit = (value) => {
			const questionIndex = getActiveQuestionIndex();
			if (questionIndex == null) return;

			const preparedQuestion = preparedQuestions[questionIndex];
			const optionIndex = cursorOptionIndexByQuestion[questionIndex];
			noteByQuestionByOption[questionIndex][optionIndex] = value;
			const trimmedNote = value.trim();

			if (preparedQuestion.multi) {
				if (trimmedNote.length > 0) {
					selectedOptionIndexesByQuestion[questionIndex] = addIndexToSelection(
						selectedOptionIndexesByQuestion[questionIndex],
						optionIndex,
					);
				}
				if (optionIndex === preparedQuestion.otherOptionIndex && trimmedNote.length === 0) {
					requestUiRerender();
					return;
				}
				isNoteEditorOpen = false;
				requestUiRerender();
				return;
			}

			selectedOptionIndexesByQuestion[questionIndex] = [optionIndex];
			if (optionIndex === preparedQuestion.otherOptionIndex && trimmedNote.length === 0) {
				requestUiRerender();
				return;
			}

			isNoteEditorOpen = false;
			advanceToNextTabOrSubmit();
			requestUiRerender();
		};

		const renderTabs = (): string => {
			const tabParts: string[] = ["← "];
			for (let questionIndex = 0; questionIndex < preparedQuestions.length; questionIndex++) {
				const preparedQuestion = preparedQuestions[questionIndex];
				const isActiveTab = questionIndex === activeTabIndex;
				const isQuestionValid = isQuestionSelectionValid(
					preparedQuestion,
					selectedOptionIndexesByQuestion[questionIndex],
					noteByQuestionByOption[questionIndex],
				);
				const statusIcon = isQuestionValid ? "■" : "□";
				const tabLabel = ` ${statusIcon} ${preparedQuestion.tabLabel} `;
				const styledTabLabel = isActiveTab
					? theme.bg("selectedBg", theme.fg("text", tabLabel))
					: theme.fg(isQuestionValid ? "success" : "muted", tabLabel);
				tabParts.push(`${styledTabLabel} `);
			}

			const isSubmitTabActive = activeTabIndex === submitTabIndex;
			const canSubmit = isAllQuestionSelectionsValid();
			const submitLabel = " ✓ Submit ";
			const styledSubmitLabel = isSubmitTabActive
				? theme.bg("selectedBg", theme.fg("text", submitLabel))
				: theme.fg(canSubmit ? "success" : "dim", submitLabel);
			tabParts.push(`${styledSubmitLabel} →`);
			return tabParts.join("");
		};

		const renderSubmitTab = (width: number, renderedLines: string[]): void => {
			const addLine = (line: string) => renderedLines.push(truncateToWidth(line, width));

			addLine(theme.fg("accent", theme.bold(" Review answers")));
			renderedLines.push("");

			for (let questionIndex = 0; questionIndex < preparedQuestions.length; questionIndex++) {
				const preparedQuestion = preparedQuestions[questionIndex];
				const selection = buildSelectionForQuestion(
					preparedQuestion,
					selectedOptionIndexesByQuestion[questionIndex],
					noteByQuestionByOption[questionIndex],
				);
				const value = formatSelectionForSubmitReview(selection, preparedQuestion.multi);
				const isValid = isQuestionSelectionValid(
					preparedQuestion,
					selectedOptionIndexesByQuestion[questionIndex],
					noteByQuestionByOption[questionIndex],
				);
				const statusIcon = isValid ? theme.fg("success", "●") : theme.fg("warning", "○");
				addLine(` ${statusIcon} ${theme.fg("muted", `${preparedQuestion.tabLabel}:`)} ${theme.fg("text", value)}`);
			}

			renderedLines.push("");
			if (isAllQuestionSelectionsValid()) {
				addLine(theme.fg("success", " Press Enter to submit"));
			} else {
				const missingQuestions = preparedQuestions
					.filter((preparedQuestion, questionIndex) =>
						!isQuestionSelectionValid(
							preparedQuestion,
							selectedOptionIndexesByQuestion[questionIndex],
							noteByQuestionByOption[questionIndex],
						),
					)
					.map((preparedQuestion) => preparedQuestion.tabLabel)
					.join(", ");
				addLine(theme.fg("warning", ` Complete required answers: ${missingQuestions}`));
			}
			addLine(theme.fg("dim", " ←/→ switch tabs • Esc cancel"));
		};

		const renderQuestionTab = (width: number, renderedLines: string[], questionIndex: number): void => {
			const addLine = (line: string) => renderedLines.push(truncateToWidth(line, width));
			const preparedQuestion = preparedQuestions[questionIndex];
			const cursorOptionIndex = cursorOptionIndexByQuestion[questionIndex];
			const selectedOptionIndexes = selectedOptionIndexesByQuestion[questionIndex];

			addLine(theme.fg("text", ` ${preparedQuestion.question}`));
			renderedLines.push("");

			for (let optionIndex = 0; optionIndex < preparedQuestion.options.length; optionIndex++) {
				const optionLabel = preparedQuestion.options[optionIndex];
				const isCursorOption = optionIndex === cursorOptionIndex;
				const isOptionSelected = selectedOptionIndexes.includes(optionIndex);
				const isEditingThisOption = isNoteEditorOpen && isCursorOption;
				const cursorPrefixText = isCursorOption ? "→ " : "  ";
				const cursorPrefix = isCursorOption ? theme.fg("accent", cursorPrefixText) : cursorPrefixText;
				const markerText = preparedQuestion.multi
					? `${isOptionSelected ? "[x]" : "[ ]"} `
					: `${isOptionSelected ? "●" : "○"} `;
				const optionColor = isCursorOption ? "accent" : isOptionSelected ? "success" : "text";
				const prefixWidth = visibleWidth(cursorPrefixText) + visibleWidth(markerText);
				const wrappedInlineLabelLines = buildWrappedOptionLabelWithInlineNote(
					optionLabel,
					getQuestionNote(questionIndex, optionIndex),
					isEditingThisOption,
					Math.max(1, width - prefixWidth),
					INLINE_NOTE_WRAP_PADDING,
				);
				const continuationPrefix = " ".repeat(prefixWidth);
				addLine(`${cursorPrefix}${theme.fg(optionColor, `${markerText}${wrappedInlineLabelLines[0] ?? ""}`)}`);
				for (const wrappedLine of wrappedInlineLabelLines.slice(1)) {
					addLine(`${continuationPrefix}${theme.fg(optionColor, wrappedLine)}`);
				}
			}

			renderedLines.push("");
			if (isNoteEditorOpen) {
				addLine(theme.fg("dim", " Typing note inline • Enter save note • Tab/Esc stop editing"));
			} else {
				if (preparedQuestion.multi) {
					addLine(
						theme.fg(
							"dim",
							" ↑↓ move • Enter toggle/select • Tab add note • ←/→ switch tabs • Esc cancel",
						),
					);
				} else {
					addLine(
						theme.fg("dim", " ↑↓ move • Enter select • Tab add note • ←/→ switch tabs • Esc cancel"),
					);
				}
			}
		};

		const render = (width: number): string[] => {
			if (cachedRenderedLines) return cachedRenderedLines;

			const renderedLines: string[] = [];
			const addLine = (line: string) => renderedLines.push(truncateToWidth(line, width));

			addLine(theme.fg("accent", "─".repeat(width)));
			addLine(` ${renderTabs()}`);
			renderedLines.push("");

			if (activeTabIndex === submitTabIndex) {
				renderSubmitTab(width, renderedLines);
			} else {
				renderQuestionTab(width, renderedLines, activeTabIndex);
			}

			addLine(theme.fg("accent", "─".repeat(width)));
			cachedRenderedLines = renderedLines;
			return renderedLines;
		};

		const handleInput = (data: string) => {
			if (isNoteEditorOpen) {
				if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) {
					isNoteEditorOpen = false;
					requestUiRerender();
					return;
				}
				noteEditor.handleInput(data);
				requestUiRerender();
				return;
			}

			if (matchesKey(data, Key.left)) {
				activeTabIndex = (activeTabIndex - 1 + preparedQuestions.length + 1) % (preparedQuestions.length + 1);
				requestUiRerender();
				return;
			}

			if (matchesKey(data, Key.right)) {
				activeTabIndex = (activeTabIndex + 1) % (preparedQuestions.length + 1);
				requestUiRerender();
				return;
			}

			if (activeTabIndex === submitTabIndex) {
				if (matchesKey(data, Key.enter) && isAllQuestionSelectionsValid()) {
					done(createTabsUiStateSnapshot(false, selectedOptionIndexesByQuestion, noteByQuestionByOption));
					return;
				}
				if (matchesKey(data, Key.escape)) {
					done(createTabsUiStateSnapshot(true, selectedOptionIndexesByQuestion, noteByQuestionByOption));
				}
				return;
			}

			const questionIndex = activeTabIndex;
			const preparedQuestion = preparedQuestions[questionIndex];

			if (matchesKey(data, Key.up)) {
				cursorOptionIndexByQuestion[questionIndex] = Math.max(0, cursorOptionIndexByQuestion[questionIndex] - 1);
				requestUiRerender();
				return;
			}

			if (matchesKey(data, Key.down)) {
				cursorOptionIndexByQuestion[questionIndex] = Math.min(
					preparedQuestion.options.length - 1,
					cursorOptionIndexByQuestion[questionIndex] + 1,
				);
				requestUiRerender();
				return;
			}

			if (matchesKey(data, Key.tab)) {
				openNoteEditorForActiveOption();
				return;
			}

			if (matchesKey(data, Key.enter)) {
				const cursorOptionIndex = cursorOptionIndexByQuestion[questionIndex];

				if (preparedQuestion.multi) {
					const currentlySelected = selectedOptionIndexesByQuestion[questionIndex];
					if (currentlySelected.includes(cursorOptionIndex)) {
						selectedOptionIndexesByQuestion[questionIndex] = removeIndexFromSelection(currentlySelected, cursorOptionIndex);
					} else {
						selectedOptionIndexesByQuestion[questionIndex] = addIndexToSelection(currentlySelected, cursorOptionIndex);
					}

					if (
						cursorOptionIndex === preparedQuestion.otherOptionIndex &&
						selectedOptionIndexesByQuestion[questionIndex].includes(cursorOptionIndex) &&
						getTrimmedQuestionNote(questionIndex, cursorOptionIndex).length === 0
					) {
						openNoteEditorForActiveOption();
						return;
					}

					requestUiRerender();
					return;
				}

				selectedOptionIndexesByQuestion[questionIndex] = [cursorOptionIndex];
				if (
					cursorOptionIndex === preparedQuestion.otherOptionIndex &&
					getTrimmedQuestionNote(questionIndex, cursorOptionIndex).length === 0
				) {
					openNoteEditorForActiveOption();
					return;
				}

				advanceToNextTabOrSubmit();
				requestUiRerender();
				return;
			}

			if (matchesKey(data, Key.escape)) {
				done(createTabsUiStateSnapshot(true, selectedOptionIndexesByQuestion, noteByQuestionByOption));
			}
		};

		return {
			render,
			invalidate: () => {
				cachedRenderedLines = undefined;
			},
			handleInput,
		};
	});

	if (result.cancelled) {
		return {
			cancelled: true,
			selections: preparedQuestions.map(() => ({ selectedOptions: [] } satisfies AskSelection)),
		};
	}

	const selections = preparedQuestions.map((preparedQuestion, questionIndex) =>
		buildSelectionForQuestion(
			preparedQuestion,
			result.selectedOptionIndexesByQuestion[questionIndex] ?? [],
			result.noteByQuestionByOption[questionIndex] ?? Array(preparedQuestion.options.length).fill(""),
		),
	);

	return { cancelled: result.cancelled, selections };
}
