import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import {
	OTHER_OPTION,
	addRecommendedSuffix,
	buildMultiSelection,
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

function getInitialIndex(recommended: number | undefined, optionCount: number): number {
	if (recommended == null || Number.isNaN(recommended)) return 0;
	if (recommended < 0 || recommended >= optionCount) return 0;
	return recommended;
}

function snapshot(cancelled: boolean, selected: Set<number>, notes: string[]): MultiSelectionState {
	return {
		cancelled,
		selectedIndexes: Array.from(selected).sort((a, b) => a - b),
		notes: [...notes],
	};
}

export async function askMultiQuestionWithInlineNote(
	ui: ExtensionUIContext,
	q: MultiQuestionInput,
): Promise<AskSelection> {
	const optionLabels = addRecommendedSuffix(q.options.map((option) => option.label), q.recommended);
	const allOptions = [...optionLabels, OTHER_OPTION];
	const otherIndex = allOptions.length - 1;
	const doneIndex = allOptions.length;

	const result = await ui.custom<MultiSelectionState>((tui, theme, _keybindings, done) => {
		let cursorIndex = getInitialIndex(q.recommended, allOptions.length);
		let editMode = false;
		let cachedLines: string[] | undefined;
		const selected = new Set<number>();
		const notes = Array(allOptions.length).fill("") as string[];

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
		const editor = new Editor(tui, editorTheme);

		const refresh = () => {
			cachedLines = undefined;
			tui.requestRender();
		};

		const getNote = (index: number): string => notes[index]?.trim() ?? "";

		const canSubmit = (): boolean => {
			if (selected.size === 0) return false;
			if (selected.has(otherIndex) && getNote(otherIndex).length === 0) return false;
			return true;
		};

		const openEditor = () => {
			if (cursorIndex === doneIndex) return;
			editMode = true;
			editor.setText(notes[cursorIndex] ?? "");
			refresh();
		};

		editor.onChange = (value) => {
			if (cursorIndex < allOptions.length) {
				notes[cursorIndex] = value;
				refresh();
			}
		};

		editor.onSubmit = (value) => {
			if (cursorIndex >= allOptions.length) return;
			notes[cursorIndex] = value;
			const trimmed = value.trim();

			if (trimmed.length > 0) {
				selected.add(cursorIndex);
			}

			if (cursorIndex === otherIndex && trimmed.length === 0) {
				refresh();
				return;
			}

			editMode = false;
			refresh();
		};

		const render = (width: number): string[] => {
			if (cachedLines) return cachedLines;

			const lines: string[] = [];
			const add = (line: string) => lines.push(truncateToWidth(line, width));

			add(theme.fg("accent", "─".repeat(width)));
			add(theme.fg("text", ` ${q.question}`));
			add(theme.fg("dim", ` ${selected.size} selected`));
			lines.push("");

			for (let i = 0; i < allOptions.length; i++) {
				const label = allOptions[i];
				const isSelected = selected.has(i);
				const isCursor = i === cursorIndex;
				const pointer = isCursor ? theme.fg("accent", "→ ") : "  ";
				const todo = isSelected ? "[x]" : "[ ]";
				const color = isCursor ? "accent" : isSelected ? "success" : "text";
				add(`${pointer}${theme.fg(color, `${todo} ${label}`)}`);

				const note = getNote(i);
				if (note) {
					add(`   ${theme.fg("muted", `• Note: ${note}`)}`);
				}
			}

			const donePointer = cursorIndex === doneIndex ? theme.fg("accent", "→ ") : "  ";
			const doneLabel = canSubmit()
				? "[submit] Done selecting"
				: "[submit] Done selecting (select options first)";
			add(`${donePointer}${theme.fg(canSubmit() ? "success" : "warning", doneLabel)}`);

			if (selected.has(otherIndex) && getNote(otherIndex).length === 0 && !editMode) {
				add(theme.fg("warning", " Other is selected. Add a note with Tab before submit."));
			}

			lines.push("");
			if (editMode) {
				add(theme.fg("muted", " Note (Tab/Esc to return to options):"));
				for (const line of editor.render(Math.max(10, width - 2))) {
					add(` ${line}`);
				}
				lines.push("");
				add(theme.fg("dim", " Enter save note • Tab/Esc back"));
			} else {
				add(theme.fg("dim", " ↑↓ move • Enter toggle/select • Tab add note • Esc cancel"));
			}

			add(theme.fg("accent", "─".repeat(width)));
			cachedLines = lines;
			return lines;
		};

		const handleInput = (data: string) => {
			if (editMode) {
				if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) {
					editMode = false;
					refresh();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}

			if (matchesKey(data, Key.up)) {
				cursorIndex = Math.max(0, cursorIndex - 1);
				refresh();
				return;
			}

			if (matchesKey(data, Key.down)) {
				cursorIndex = Math.min(doneIndex, cursorIndex + 1);
				refresh();
				return;
			}

			if (matchesKey(data, Key.tab)) {
				openEditor();
				return;
			}

			if (matchesKey(data, Key.enter)) {
				if (cursorIndex === doneIndex) {
					if (canSubmit()) {
						done(snapshot(false, selected, notes));
					}
					return;
				}

				if (selected.has(cursorIndex)) {
					selected.delete(cursorIndex);
					refresh();
					return;
				}

				selected.add(cursorIndex);
				if (cursorIndex === otherIndex && getNote(cursorIndex).length === 0) {
					openEditor();
					return;
				}
				refresh();
				return;
			}

			if (matchesKey(data, Key.escape)) {
				done(snapshot(true, selected, notes));
			}
		};

		return {
			render,
			invalidate: () => {
				cachedLines = undefined;
			},
			handleInput,
		};
	});

	if (result.cancelled) {
		return { selectedOptions: [] };
	}

	return buildMultiSelection(allOptions, result.selectedIndexes, result.notes, otherIndex);
}
