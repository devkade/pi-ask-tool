import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import {
	OTHER_OPTION,
	addRecommendedSuffix,
	buildSingleSelection,
	type AskOption,
	type AskSelection,
} from "./ask-logic";

interface SingleQuestionInput {
	question: string;
	options: AskOption[];
	recommended?: number;
}

interface InlineSelectionResult {
	cancelled: boolean;
	selectedOption?: string;
	note?: string;
}

function getInitialIndex(recommended: number | undefined, optionCount: number): number {
	if (recommended == null) return 0;
	if (recommended < 0 || recommended >= optionCount) return 0;
	return recommended;
}

export async function askSingleQuestionWithInlineNote(
	ui: ExtensionUIContext,
	q: SingleQuestionInput,
): Promise<AskSelection> {
	const baseOptions = q.options.map((option) => option.label);
	const optionLabels = addRecommendedSuffix(baseOptions, q.recommended);
	const allOptions = [...optionLabels, OTHER_OPTION];
	const initialIndex = getInitialIndex(q.recommended, optionLabels.length);

	const result = await ui.custom<InlineSelectionResult>((tui, theme, _keybindings, done) => {
		let selectedIndex = initialIndex;
		let editMode = false;
		let cachedLines: string[] | undefined;
		const notes = new Map<number, string>();

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

		const getNote = (index: number): string => notes.get(index) ?? "";
		const getTrimmedNote = (index: number): string => getNote(index).trim();

		const loadEditorText = () => {
			editor.setText(getNote(selectedIndex));
		};

		const saveEditorText = (value: string) => {
			notes.set(selectedIndex, value);
		};

		const submitSelection = (optionLabel: string, note: string) => {
			done({
				cancelled: false,
				selectedOption: optionLabel,
				note,
			});
		};

		editor.onChange = (value) => {
			saveEditorText(value);
			refresh();
		};

		editor.onSubmit = (value) => {
			saveEditorText(value);
			const selectedOption = allOptions[selectedIndex];
			const note = value.trim();

			if (selectedOption === OTHER_OPTION && !note) {
				refresh();
				return;
			}

			submitSelection(selectedOption, note);
		};

		const render = (width: number): string[] => {
			if (cachedLines) return cachedLines;

			const lines: string[] = [];
			const add = (line: string) => lines.push(truncateToWidth(line, width));

			add(theme.fg("accent", "─".repeat(width)));
			add(theme.fg("text", ` ${q.question}`));
			lines.push("");

			for (let i = 0; i < allOptions.length; i++) {
				const optionLabel = allOptions[i];
				const selected = i === selectedIndex;
				const prefix = selected ? theme.fg("accent", "→ ") : "  ";
				const bullet = selected ? "●" : "○";
				const color = selected ? "accent" : "text";
				add(`${prefix}${theme.fg(color, `${bullet} ${optionLabel}`)}`);
			}

			const currentNote = getTrimmedNote(selectedIndex);
			lines.push("");

			if (editMode) {
				add(theme.fg("muted", " Note (Tab/Esc to return to options):"));
				for (const line of editor.render(width - 2)) {
					add(` ${line}`);
				}
				lines.push("");
				add(theme.fg("dim", " Enter submit • Tab/Esc back"));
			} else if (currentNote) {
				add(theme.fg("muted", ` Note: ${currentNote}`));
				lines.push("");
				add(theme.fg("dim", " ↑↓ move • Enter submit • Tab edit note • Esc cancel"));
			} else {
				add(theme.fg("dim", " ↑↓ move • Enter submit • Tab add note • Esc cancel"));
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
				selectedIndex = Math.max(0, selectedIndex - 1);
				refresh();
				return;
			}
			if (matchesKey(data, Key.down)) {
				selectedIndex = Math.min(allOptions.length - 1, selectedIndex + 1);
				refresh();
				return;
			}

			if (matchesKey(data, Key.tab)) {
				editMode = true;
				loadEditorText();
				refresh();
				return;
			}

			if (matchesKey(data, Key.enter)) {
				const selectedOption = allOptions[selectedIndex];
				const note = getTrimmedNote(selectedIndex);

				if (selectedOption === OTHER_OPTION && !note) {
					editMode = true;
					loadEditorText();
					refresh();
					return;
				}

				submitSelection(selectedOption, note);
				return;
			}

			if (matchesKey(data, Key.escape)) {
				done({ cancelled: true });
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

	if (result.cancelled || !result.selectedOption) {
		return { selectedOptions: [] };
	}

	return buildSingleSelection(result.selectedOption, result.note);
}
