import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import {
	OTHER_OPTION,
	appendRecommendedTagToOptionLabels,
	buildMultiSelectionResult,
	type AskOption,
	type AskSelection,
} from "./ask-logic";

interface MultiQuestionInput {
	question: string;
	options: AskOption[];
	recommended?: number;
}

interface MultiSelectionState {
	cancelled: boolean;
	selectedIndexes: number[];
	notes: string[];
}

function resolveInitialCursorIndexFromRecommendedOption(
	recommendedOptionIndex: number | undefined,
	optionCount: number,
): number {
	if (recommendedOptionIndex == null || Number.isNaN(recommendedOptionIndex)) return 0;
	if (recommendedOptionIndex < 0 || recommendedOptionIndex >= optionCount) return 0;
	return recommendedOptionIndex;
}

function createMultiSelectionSnapshot(
	cancelled: boolean,
	selectedOptionIndexSet: Set<number>,
	noteByOptionIndex: string[],
): MultiSelectionState {
	return {
		cancelled,
		selectedIndexes: Array.from(selectedOptionIndexSet).sort((a, b) => a - b),
		notes: [...noteByOptionIndex],
	};
}

export async function askMultiQuestionWithInlineNote(
	ui: ExtensionUIContext,
	questionInput: MultiQuestionInput,
): Promise<AskSelection> {
	const optionLabelsWithRecommendedTag = appendRecommendedTagToOptionLabels(
		questionInput.options.map((option) => option.label),
		questionInput.recommended,
	);
	const selectableOptionLabels = [...optionLabelsWithRecommendedTag, OTHER_OPTION];
	const otherOptionIndex = selectableOptionLabels.length - 1;
	const submitRowIndex = selectableOptionLabels.length;

	const result = await ui.custom<MultiSelectionState>((tui, theme, _keybindings, done) => {
		let cursorRowIndex = resolveInitialCursorIndexFromRecommendedOption(
			questionInput.recommended,
			selectableOptionLabels.length,
		);
		let isNoteEditorOpen = false;
		let cachedRenderedLines: string[] | undefined;
		const selectedOptionIndexSet = new Set<number>();
		const noteByOptionIndex = Array(selectableOptionLabels.length).fill("") as string[];

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

		const requestUiRerender = () => {
			cachedRenderedLines = undefined;
			tui.requestRender();
		};

		const getTrimmedNoteForOption = (optionIndex: number): string => noteByOptionIndex[optionIndex]?.trim() ?? "";

		const canSubmitSelections = (): boolean => {
			if (selectedOptionIndexSet.size === 0) return false;
			if (selectedOptionIndexSet.has(otherOptionIndex) && getTrimmedNoteForOption(otherOptionIndex).length === 0) {
				return false;
			}
			return true;
		};

		const openNoteEditorForCurrentOption = () => {
			if (cursorRowIndex === submitRowIndex) return;
			isNoteEditorOpen = true;
			noteEditor.setText(noteByOptionIndex[cursorRowIndex] ?? "");
			requestUiRerender();
		};

		noteEditor.onChange = (value) => {
			if (cursorRowIndex < selectableOptionLabels.length) {
				noteByOptionIndex[cursorRowIndex] = value;
				requestUiRerender();
			}
		};

		noteEditor.onSubmit = (value) => {
			if (cursorRowIndex >= selectableOptionLabels.length) return;
			noteByOptionIndex[cursorRowIndex] = value;
			const trimmedNote = value.trim();

			if (trimmedNote.length > 0) {
				selectedOptionIndexSet.add(cursorRowIndex);
			}

			if (cursorRowIndex === otherOptionIndex && trimmedNote.length === 0) {
				requestUiRerender();
				return;
			}

			isNoteEditorOpen = false;
			requestUiRerender();
		};

		const render = (width: number): string[] => {
			if (cachedRenderedLines) return cachedRenderedLines;

			const renderedLines: string[] = [];
			const addLine = (line: string) => renderedLines.push(truncateToWidth(line, width));

			addLine(theme.fg("accent", "─".repeat(width)));
			addLine(theme.fg("text", ` ${questionInput.question}`));
			addLine(theme.fg("dim", ` ${selectedOptionIndexSet.size} selected`));
			renderedLines.push("");

			for (let optionIndex = 0; optionIndex < selectableOptionLabels.length; optionIndex++) {
				const optionLabel = selectableOptionLabels[optionIndex];
				const isOptionSelected = selectedOptionIndexSet.has(optionIndex);
				const isCursorRow = optionIndex === cursorRowIndex;
				const cursorPrefix = isCursorRow ? theme.fg("accent", "→ ") : "  ";
				const checkbox = isOptionSelected ? "[x]" : "[ ]";
				const optionColor = isCursorRow ? "accent" : isOptionSelected ? "success" : "text";
				addLine(`${cursorPrefix}${theme.fg(optionColor, `${checkbox} ${optionLabel}`)}`);

				const note = getTrimmedNoteForOption(optionIndex);
				if (note) {
					addLine(`   ${theme.fg("muted", `• Note: ${note}`)}`);
				}
			}

			const submitRowPrefix = cursorRowIndex === submitRowIndex ? theme.fg("accent", "→ ") : "  ";
			const submitLabel = canSubmitSelections()
				? "[submit] Done selecting"
				: "[submit] Done selecting (select options first)";
			addLine(`${submitRowPrefix}${theme.fg(canSubmitSelections() ? "success" : "warning", submitLabel)}`);

			if (selectedOptionIndexSet.has(otherOptionIndex) && getTrimmedNoteForOption(otherOptionIndex).length === 0 && !isNoteEditorOpen) {
				addLine(theme.fg("warning", " Other is selected. Add a note with Tab before submit."));
			}

			renderedLines.push("");
			if (isNoteEditorOpen) {
				addLine(theme.fg("muted", " Note (Tab/Esc to return to options):"));
				for (const line of noteEditor.render(Math.max(10, width - 2))) {
					addLine(` ${line}`);
				}
				renderedLines.push("");
				addLine(theme.fg("dim", " Enter save note • Tab/Esc back"));
			} else {
				addLine(theme.fg("dim", " ↑↓ move • Enter toggle/select • Tab add note • Esc cancel"));
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

			if (matchesKey(data, Key.up)) {
				cursorRowIndex = Math.max(0, cursorRowIndex - 1);
				requestUiRerender();
				return;
			}

			if (matchesKey(data, Key.down)) {
				cursorRowIndex = Math.min(submitRowIndex, cursorRowIndex + 1);
				requestUiRerender();
				return;
			}

			if (matchesKey(data, Key.tab)) {
				openNoteEditorForCurrentOption();
				return;
			}

			if (matchesKey(data, Key.enter)) {
				if (cursorRowIndex === submitRowIndex) {
					if (canSubmitSelections()) {
						done(createMultiSelectionSnapshot(false, selectedOptionIndexSet, noteByOptionIndex));
					}
					return;
				}

				if (selectedOptionIndexSet.has(cursorRowIndex)) {
					selectedOptionIndexSet.delete(cursorRowIndex);
					requestUiRerender();
					return;
				}

				selectedOptionIndexSet.add(cursorRowIndex);
				if (cursorRowIndex === otherOptionIndex && getTrimmedNoteForOption(cursorRowIndex).length === 0) {
					openNoteEditorForCurrentOption();
					return;
				}
				requestUiRerender();
				return;
			}

			if (matchesKey(data, Key.escape)) {
				done(createMultiSelectionSnapshot(true, selectedOptionIndexSet, noteByOptionIndex));
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
		return { selectedOptions: [] };
	}

	return buildMultiSelectionResult(
		selectableOptionLabels,
		result.selectedIndexes,
		result.notes,
		otherOptionIndex,
	);
}
