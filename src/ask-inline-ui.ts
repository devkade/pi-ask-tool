import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import {
	Editor,
	Markdown,
	type EditorTheme,
	type MarkdownTheme,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";
import {
	OTHER_OPTION,
	appendRecommendedTagToOptionLabels,
	buildSingleSelectionResult,
	type AskOption,
	type AskSelection,
} from "./ask-logic";
import { getLinearCursorIndexFromEditor } from "./ask-inline-editor-cursor";
import { INLINE_NOTE_WRAP_PADDING, buildWrappedOptionLabelWithInlineNote } from "./ask-inline-note";
import { appendWrappedTextLines } from "./ask-text-wrap";
import {
	buildScrollIndicator,
	clampScrollOffset,
	MIN_VIEWPORT_HEIGHT,
	maxScrollOffset,
	resolveViewportHeight,
	sliceViewport,
	type ViewportAnchor,
} from "./ask-viewport";

interface SingleQuestionInput {
	question: string;
	description?: string;
	options: AskOption[];
	recommended?: number;
}

interface InlineSelectionResult {
	cancelled: boolean;
	selectedOption?: string;
	note?: string;
}

function resolveInitialCursorIndexFromRecommendedOption(
	recommendedOptionIndex: number | undefined,
	optionCount: number,
): number {
	if (recommendedOptionIndex == null) return 0;
	if (recommendedOptionIndex < 0 || recommendedOptionIndex >= optionCount) return 0;
	return recommendedOptionIndex;
}

export async function askSingleQuestionWithInlineNote(
	ui: ExtensionUIContext,
	questionInput: SingleQuestionInput,
): Promise<AskSelection> {
	const baseOptionLabels = questionInput.options.map((option) => option.label);
	const optionLabelsWithRecommendedTag = appendRecommendedTagToOptionLabels(
		baseOptionLabels,
		questionInput.recommended,
	);
	const selectableOptionLabels = [...optionLabelsWithRecommendedTag, OTHER_OPTION];
	const initialCursorIndex = resolveInitialCursorIndexFromRecommendedOption(
		questionInput.recommended,
		optionLabelsWithRecommendedTag.length,
	);

	const result = await ui.custom<InlineSelectionResult>((tui, theme, _keybindings, done) => {
		let cursorOptionIndex = initialCursorIndex;
		let isNoteEditorOpen = false;
		let cachedRenderedLines: string[] | undefined;
		let cachedRenderedWidth: number | undefined;
		let cachedRenderedHeight: number | undefined;
		let scrollOffset = 0;
		let hasUserScrolled = false;
		let lastViewportHeight: number | undefined;
		let lastTotalBodyLines = 0;
		const noteByOptionIndex = new Map<number, string>();

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
		const markdownTheme: MarkdownTheme = {
			heading: (text) => theme.fg("mdHeading", text),
			link: (text) => theme.fg("mdLink", text),
			linkUrl: (text) => theme.fg("mdLinkUrl", text),
			code: (text) => theme.fg("mdCode", text),
			codeBlock: (text) => theme.fg("mdCodeBlock", text),
			codeBlockBorder: (text) => theme.fg("mdCodeBlockBorder", text),
			quote: (text) => theme.fg("mdQuote", text),
			quoteBorder: (text) => theme.fg("mdQuoteBorder", text),
			hr: (text) => theme.fg("mdHr", text),
			listBullet: (text) => theme.fg("mdListBullet", text),
			bold: (text) => theme.bold(text),
			italic: (text) => theme.italic(text),
			strikethrough: (text) => theme.strikethrough(text),
			underline: (text) => theme.underline(text),
		};
		const questionDescriptionMarkdown =
			questionInput.description && questionInput.description.trim().length > 0
				? new Markdown(questionInput.description, 0, 0, markdownTheme, {
						color: (text) => theme.fg("muted", text),
					})
				: undefined;

		const requestUiRerender = () => {
			cachedRenderedLines = undefined;
			cachedRenderedWidth = undefined;
			cachedRenderedHeight = undefined;
			tui.requestRender();
		};

		/** Follow the cursor again after any selection-changing key. */
		const resetScrollFollow = () => {
			hasUserScrolled = false;
		};

		/** One screenful, minus a line of overlap so context is not lost. */
		const scrollStep = (): number => Math.max(1, (lastViewportHeight ?? MIN_VIEWPORT_HEIGHT) - 1);

		/** Scroll the viewport by whole lines without moving the option cursor. */
		const scrollViewportBy = (lineDelta: number): boolean => {
			if (lastViewportHeight == null || lastTotalBodyLines <= lastViewportHeight) return false;

			const maxOffset = maxScrollOffset(lastTotalBodyLines, lastViewportHeight);
			const nextOffset = clampScrollOffset(scrollOffset + lineDelta, lastTotalBodyLines, lastViewportHeight);
			if (nextOffset === scrollOffset) return false;

			scrollOffset = nextOffset;
			hasUserScrolled = nextOffset < maxOffset || lineDelta < 0;
			requestUiRerender();
			return true;
		};

		const getRawNoteForOption = (optionIndex: number): string => noteByOptionIndex.get(optionIndex) ?? "";
		const getTrimmedNoteForOption = (optionIndex: number): string => getRawNoteForOption(optionIndex).trim();

		const loadCurrentNoteIntoEditor = () => {
			noteEditor.setText(getRawNoteForOption(cursorOptionIndex));
		};

		const openNoteEditorForCurrentOption = () => {
			if (isNoteEditorOpen) return;
			isNoteEditorOpen = true;
			resetScrollFollow();
			loadCurrentNoteIntoEditor();
		};

		const saveCurrentNoteFromEditor = (value: string) => {
			noteByOptionIndex.set(cursorOptionIndex, value);
		};

		const submitCurrentSelection = (selectedOptionLabel: string, note: string) => {
			done({
				cancelled: false,
				selectedOption: selectedOptionLabel,
				note,
			});
		};

		noteEditor.onChange = (value) => {
			saveCurrentNoteFromEditor(value);
			resetScrollFollow();
			requestUiRerender();
		};

		noteEditor.onSubmit = (value) => {
			saveCurrentNoteFromEditor(value);
			const selectedOptionLabel = selectableOptionLabels[cursorOptionIndex];
			const trimmedNote = value.trim();

			if (selectedOptionLabel === OTHER_OPTION && !trimmedNote) {
				requestUiRerender();
				return;
			}

			submitCurrentSelection(selectedOptionLabel, trimmedNote);
		};

		/**
		 * Build the scrollable body: question, description and options.
		 * Kept free of viewport arithmetic so slicing stays deterministic.
		 */
		const buildBodyLines = (
			width: number,
		): { lines: string[]; anchor: ViewportAnchor; priority: ViewportAnchor } => {
			const bodyLines: string[] = [];
			const addBodyLine = (line: string) => bodyLines.push(truncateToWidth(line, width));

			appendWrappedTextLines(bodyLines, questionInput.question, width, {
				indent: 1,
				formatLine: (line) => theme.fg("text", line),
			});
			if (questionDescriptionMarkdown) {
				bodyLines.push("");
				const descriptionLines = questionDescriptionMarkdown.render(Math.max(1, width - 1));
				for (const descriptionLine of descriptionLines) {
					addBodyLine(` ${descriptionLine}`);
				}
			}
			bodyLines.push("");

			const activeEditingCursorIndex = isNoteEditorOpen
				? getLinearCursorIndexFromEditor(noteEditor)
				: undefined;
			let anchorStart = 0;
			let anchorEnd = 0;
			// The options block is what the reader has to choose from, so it
			// takes precedence over the question and description above it.
			const optionsStart = bodyLines.length;
			for (let optionIndex = 0; optionIndex < selectableOptionLabels.length; optionIndex++) {
				const optionLabel = selectableOptionLabels[optionIndex];
				const isCursorOption = optionIndex === cursorOptionIndex;
				const isEditingThisOption = isNoteEditorOpen && isCursorOption;
				const cursorPrefixText = isCursorOption ? "→ " : "  ";
				const cursorPrefix = isCursorOption ? theme.fg("accent", cursorPrefixText) : cursorPrefixText;
				const bullet = isCursorOption ? "●" : "○";
				const markerText = `${bullet} `;
				const optionColor = isCursorOption ? "accent" : "text";
				const prefixWidth = visibleWidth(cursorPrefixText) + visibleWidth(markerText);
				const wrappedInlineLabelLines = buildWrappedOptionLabelWithInlineNote(
					optionLabel,
					getRawNoteForOption(optionIndex),
					isEditingThisOption,
					Math.max(1, width - prefixWidth),
					INLINE_NOTE_WRAP_PADDING,
					isEditingThisOption ? activeEditingCursorIndex : undefined,
					isEditingThisOption,
				);
				const continuationPrefix = " ".repeat(prefixWidth);
				if (isCursorOption) {
					anchorStart = bodyLines.length;
				}
				addBodyLine(`${cursorPrefix}${theme.fg(optionColor, `${markerText}${wrappedInlineLabelLines[0] ?? ""}`)}`);
				for (const wrappedLine of wrappedInlineLabelLines.slice(1)) {
					addBodyLine(`${continuationPrefix}${theme.fg(optionColor, wrappedLine)}`);
				}
				if (isCursorOption) {
					anchorEnd = bodyLines.length - 1;
				}
			}
			const optionsEnd = Math.max(optionsStart, bodyLines.length - 1);

			bodyLines.push("");

			return {
				lines: bodyLines,
				anchor: { start: anchorStart, end: anchorEnd },
				priority: { start: optionsStart, end: optionsEnd },
			};
		};

		const render = (width: number): string[] => {
			const terminalRows = tui.terminal?.rows;
			if (cachedRenderedLines && cachedRenderedWidth === width && cachedRenderedHeight === terminalRows) {
				return cachedRenderedLines;
			}

			const renderedLines: string[] = [];
			const addLine = (line: string) => renderedLines.push(truncateToWidth(line, width));

			const { lines: bodyLines, anchor, priority } = buildBodyLines(width);

			// Chrome is the top rule, the hint line and the bottom rule. An
			// overflowing body adds one more line for the scroll indicator.
			const baseChromeRows = 3;
			const fitsWithoutIndicator = resolveViewportHeight(terminalRows, baseChromeRows);
			const viewportHeight =
				fitsWithoutIndicator != null && bodyLines.length > fitsWithoutIndicator
					? resolveViewportHeight(terminalRows, baseChromeRows + 1)
					: fitsWithoutIndicator;

			const slice = sliceViewport({
				lines: bodyLines,
				viewportHeight,
				anchor,
				priority,
				scrollOffset,
				preferScrollOffset: hasUserScrolled,
			});
			scrollOffset = slice.scrollOffset;
			lastViewportHeight = viewportHeight;
			lastTotalBodyLines = slice.totalLines;

			addLine(theme.fg("accent", "─".repeat(width)));
			for (const bodyLine of slice.lines) {
				renderedLines.push(bodyLine);
			}

			const scrollIndicator = buildScrollIndicator(slice);
			if (scrollIndicator) {
				addLine(theme.fg("dim", ` ${scrollIndicator} • Shift+↑/↓ scroll`));
			}

			if (isNoteEditorOpen) {
				addLine(theme.fg("dim", " Typing note inline • Enter submit • Tab/Esc stop editing"));
			} else if (getTrimmedNoteForOption(cursorOptionIndex).length > 0) {
				addLine(theme.fg("dim", " ↑↓ move • Enter submit • Tab edit note • Esc cancel"));
			} else {
				addLine(theme.fg("dim", " ↑↓ move • Enter submit • Tab add note • Esc cancel"));
			}

			addLine(theme.fg("accent", "─".repeat(width)));
			cachedRenderedLines = renderedLines;
			cachedRenderedWidth = width;
			cachedRenderedHeight = terminalRows;
			return renderedLines;
		};

		const handleInput = (data: string) => {
			if (matchesKey(data, Key.ctrl("c"))) {
				done({ cancelled: true });
				return;
			}

			// Scrolling never changes the selection, so it stays available
			// while the inline note editor is open.
			//
			// Shift+arrow is the primary binding: terminal multiplexers and
			// terminal emulators commonly bind PgUp/PgDn to their own
			// scrollback and never forward them. PgUp/PgDn stays as a
			// secondary binding for setups that do forward it.
			if (matchesKey(data, Key.shift("up")) || matchesKey(data, Key.pageUp)) {
				scrollViewportBy(-scrollStep());
				return;
			}
			if (matchesKey(data, Key.shift("down")) || matchesKey(data, Key.pageDown)) {
				scrollViewportBy(scrollStep());
				return;
			}

			if (isNoteEditorOpen) {
				if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) {
					isNoteEditorOpen = false;
					requestUiRerender();
					return;
				}

				if (
					(matchesKey(data, Key.up) || matchesKey(data, Key.down)) &&
					getTrimmedNoteForOption(cursorOptionIndex).length === 0
				) {
					isNoteEditorOpen = false;
				} else {
					noteEditor.handleInput(data);
					requestUiRerender();
					return;
				}
			}

			if (matchesKey(data, Key.up)) {
				cursorOptionIndex = Math.max(0, cursorOptionIndex - 1);
				resetScrollFollow();
				if (selectableOptionLabels[cursorOptionIndex] === OTHER_OPTION) {
					openNoteEditorForCurrentOption();
				}
				requestUiRerender();
				return;
			}
			if (matchesKey(data, Key.down)) {
				cursorOptionIndex = Math.min(selectableOptionLabels.length - 1, cursorOptionIndex + 1);
				resetScrollFollow();
				if (selectableOptionLabels[cursorOptionIndex] === OTHER_OPTION) {
					openNoteEditorForCurrentOption();
				}
				requestUiRerender();
				return;
			}

			if (matchesKey(data, Key.tab)) {
				openNoteEditorForCurrentOption();
				requestUiRerender();
				return;
			}

			if (matchesKey(data, Key.enter)) {
				const selectedOptionLabel = selectableOptionLabels[cursorOptionIndex];
				const trimmedNote = getTrimmedNoteForOption(cursorOptionIndex);

				if (selectedOptionLabel === OTHER_OPTION && !trimmedNote) {
					isNoteEditorOpen = true;
					loadCurrentNoteIntoEditor();
					requestUiRerender();
					return;
				}

				submitCurrentSelection(selectedOptionLabel, trimmedNote);
				return;
			}

			if (matchesKey(data, Key.escape)) {
				done({ cancelled: true });
				return;
			}

			if (selectableOptionLabels[cursorOptionIndex] === OTHER_OPTION) {
				openNoteEditorForCurrentOption();
				noteEditor.handleInput(data);
				requestUiRerender();
				return;
			}
		};

		return {
			focused: true,
			render,
			invalidate: () => {
				cachedRenderedLines = undefined;
				cachedRenderedWidth = undefined;
				cachedRenderedHeight = undefined;
			},
			handleInput,
		};
	});

	if (result.cancelled || !result.selectedOption) {
		return { selectedOptions: [] };
	}

	return buildSingleSelectionResult(result.selectedOption, result.note);
}
