import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import {
	OTHER_OPTION,
	addRecommendedSuffix,
	buildSingleSelection,
	type AskQuestion,
	type AskSelection,
} from "./ask-logic";

interface PreparedQuestion {
	id: string;
	question: string;
	options: string[];
	tabLabel: string;
}

interface TabsUIState {
	cancelled: boolean;
	selectedIndexes: number[];
	notes: string[];
	answered: boolean[];
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

function snapshotState(
	cancelled: boolean,
	selectedIndexes: number[],
	notes: string[],
	answered: boolean[],
): TabsUIState {
	return {
		cancelled,
		selectedIndexes: [...selectedIndexes],
		notes: [...notes],
		answered: [...answered],
	};
}

export async function askQuestionsWithTabs(
	ui: ExtensionUIContext,
	questions: AskQuestion[],
): Promise<{ cancelled: boolean; selections: AskSelection[] }> {
	const prepared: PreparedQuestion[] = questions.map((q, index) => {
		const optionLabels = q.options.map((option) => option.label);
		const options = [...addRecommendedSuffix(optionLabels, q.recommended), OTHER_OPTION];
		return {
			id: q.id,
			question: q.question,
			options,
			tabLabel: normalizeTabLabel(q.id, `Q${index + 1}`),
		};
	});

	const initialIndexes = prepared.map((q, index) => clampIndex(questions[index].recommended, q.options.length));

	const result = await ui.custom<TabsUIState>((tui, theme, _keybindings, done) => {
		let currentTab = 0;
		let editMode = false;
		let cachedLines: string[] | undefined;
		const selectedIndexes = [...initialIndexes];
		const notes = Array(prepared.length).fill("") as string[];
		const answered = Array(prepared.length).fill(false) as boolean[];

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

		const getSelectedOption = (questionIndex: number): string => {
			const q = prepared[questionIndex];
			return q.options[selectedIndexes[questionIndex]] ?? OTHER_OPTION;
		};

		const getNote = (questionIndex: number): string => notes[questionIndex]?.trim() ?? "";

		const isAnswerValid = (questionIndex: number): boolean => {
			if (!answered[questionIndex]) return false;
			const selectedOption = getSelectedOption(questionIndex);
			if (selectedOption === OTHER_OPTION) {
				return getNote(questionIndex).length > 0;
			}
			return true;
		};

		const allAnswered = (): boolean => prepared.every((_, index) => isAnswerValid(index));

		const gotoSubmitIfLast = () => {
			if (currentTab >= prepared.length - 1) {
				currentTab = prepared.length;
			} else {
				currentTab += 1;
			}
		};

		const openNoteEditor = () => {
			if (currentTab >= prepared.length) return;
			editMode = true;
			editor.setText(notes[currentTab] ?? "");
			refresh();
		};

		editor.onChange = (value) => {
			if (currentTab < prepared.length) {
				notes[currentTab] = value;
				refresh();
			}
		};

		editor.onSubmit = (value) => {
			if (currentTab >= prepared.length) return;

			notes[currentTab] = value;
			const selectedOption = getSelectedOption(currentTab);
			if (selectedOption === OTHER_OPTION && getNote(currentTab).length === 0) {
				refresh();
				return;
			}

			answered[currentTab] = true;
			editMode = false;
			gotoSubmitIfLast();
			refresh();
		};

		const renderTabs = (): string => {
			const parts: string[] = ["← "];
			for (let i = 0; i < prepared.length; i++) {
				const active = i === currentTab;
				const complete = isAnswerValid(i);
				const icon = complete ? "■" : "□";
				const label = ` ${icon} ${prepared[i].tabLabel} `;
				const styled = active
					? theme.bg("selectedBg", theme.fg("text", label))
					: theme.fg(complete ? "success" : "muted", label);
				parts.push(`${styled} `);
			}

			const submitActive = currentTab === prepared.length;
			const submitReady = allAnswered();
			const submitLabel = " ✓ Submit ";
			const submitStyled = submitActive
				? theme.bg("selectedBg", theme.fg("text", submitLabel))
				: theme.fg(submitReady ? "success" : "dim", submitLabel);
			parts.push(`${submitStyled} →`);
			return parts.join("");
		};

		const render = (width: number): string[] => {
			if (cachedLines) return cachedLines;

			const lines: string[] = [];
			const add = (line: string) => lines.push(truncateToWidth(line, width));

			add(theme.fg("accent", "─".repeat(width)));
			add(` ${renderTabs()}`);
			lines.push("");

			if (currentTab === prepared.length) {
				add(theme.fg("accent", theme.bold(" Review answers")));
				lines.push("");
				for (let i = 0; i < prepared.length; i++) {
					const optionLabel = getSelectedOption(i);
					const note = getNote(i);
					const combined = buildSingleSelection(optionLabel, note);
					const value = combined.customInput ?? combined.selectedOptions[0] ?? "(not answered)";
					const status = isAnswerValid(i) ? theme.fg("success", "●") : theme.fg("warning", "○");
					add(` ${status} ${theme.fg("muted", `${prepared[i].tabLabel}:`)} ${theme.fg("text", value)}`);
				}

				lines.push("");
				if (allAnswered()) {
					add(theme.fg("success", " Press Enter to submit"));
				} else {
					const missing = prepared
						.filter((_, index) => !isAnswerValid(index))
						.map((q) => q.tabLabel)
						.join(", ");
					add(theme.fg("warning", ` Complete required answers: ${missing}`));
				}
				add(theme.fg("dim", " ←/→ switch tabs • Esc cancel"));
				add(theme.fg("accent", "─".repeat(width)));
				cachedLines = lines;
				return lines;
			}

			const activeQuestion = prepared[currentTab];
			add(theme.fg("text", ` ${activeQuestion.question}`));
			lines.push("");

			for (let i = 0; i < activeQuestion.options.length; i++) {
				const optionLabel = activeQuestion.options[i];
				const selected = i === selectedIndexes[currentTab];
				const pointer = selected ? theme.fg("accent", "→ ") : "  ";
				const bullet = selected ? "●" : "○";
				const color = selected ? "accent" : "text";
				add(`${pointer}${theme.fg(color, `${bullet} ${optionLabel}`)}`);
			}

			const note = getNote(currentTab);
			lines.push("");
			if (editMode) {
				add(theme.fg("muted", " Note (Tab/Esc to return to options):"));
				for (const line of editor.render(Math.max(10, width - 2))) {
					add(` ${line}`);
				}
				lines.push("");
				add(theme.fg("dim", " Enter save • Tab/Esc back"));
			} else if (note) {
				add(theme.fg("muted", ` Note: ${note}`));
				lines.push("");
				add(theme.fg("dim", " ↑↓ move • Enter select • Tab edit note • ←/→ switch tabs • Esc cancel"));
			} else {
				add(theme.fg("dim", " ↑↓ move • Enter select • Tab add note • ←/→ switch tabs • Esc cancel"));
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

			if (matchesKey(data, Key.left)) {
				currentTab = (currentTab - 1 + prepared.length + 1) % (prepared.length + 1);
				refresh();
				return;
			}

			if (matchesKey(data, Key.right)) {
				currentTab = (currentTab + 1) % (prepared.length + 1);
				refresh();
				return;
			}

			if (currentTab === prepared.length) {
				if (matchesKey(data, Key.enter) && allAnswered()) {
					done(snapshotState(false, selectedIndexes, notes, answered));
					return;
				}
				if (matchesKey(data, Key.escape)) {
					done(snapshotState(true, selectedIndexes, notes, answered));
				}
				return;
			}

			const activeQuestion = prepared[currentTab];
			if (matchesKey(data, Key.up)) {
				selectedIndexes[currentTab] = Math.max(0, selectedIndexes[currentTab] - 1);
				refresh();
				return;
			}
			if (matchesKey(data, Key.down)) {
				selectedIndexes[currentTab] = Math.min(activeQuestion.options.length - 1, selectedIndexes[currentTab] + 1);
				refresh();
				return;
			}

			if (matchesKey(data, Key.tab)) {
				openNoteEditor();
				return;
			}

			if (matchesKey(data, Key.enter)) {
				answered[currentTab] = true;
				const selectedOption = getSelectedOption(currentTab);
				if (selectedOption === OTHER_OPTION && getNote(currentTab).length === 0) {
					openNoteEditor();
					return;
				}
				gotoSubmitIfLast();
				refresh();
				return;
			}

			if (matchesKey(data, Key.escape)) {
				done(snapshotState(true, selectedIndexes, notes, answered));
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

	const selections = prepared.map((q, index) => {
		if (!result.answered[index]) {
			return { selectedOptions: [] } satisfies AskSelection;
		}
		const selectedOption = q.options[result.selectedIndexes[index]];
		const note = result.notes[index];
		return buildSingleSelection(selectedOption, note);
	});

	return { cancelled: result.cancelled, selections };
}
