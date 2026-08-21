import { describe, expect, it } from "bun:test";
import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { TUI } from "@mariozechner/pi-tui";
import { askSingleQuestionWithInlineNote } from "../src/ask-inline-ui";
import { askQuestionsWithTabs } from "../src/ask-tabs-ui";

/**
 * End-to-end regression tests for issue #5, against the real renderer.
 *
 * The unit tests in ask-ui-overflow.test.ts render the ask component on its
 * own. That is not how pi mounts it: the component lives in the editor
 * container, with the chat transcript above it and the status, widget and
 * footer containers below. An earlier fix passed the isolated tests and still
 * flickered in practice, because the component sized itself against the whole
 * terminal and the dock underneath pushed the total past the viewport.
 *
 * These tests drive the actual TuiMainScreen with siblings on both sides and
 * assert the thing that matters to the user: the renderer never erases the
 * scrollback.
 */

/** Erase-scrollback. Emitting this destroys the user's terminal history. */
const ERASE_SCROLLBACK = "\x1b[3J";

const KEY_DOWN = "\x1b[B";
const KEY_UP = "\x1b[A";

/** Minimal Terminal that records everything written to it. */
class RecordingTerminal {
	columns: number;
	rows: number;
	written: string[] = [];

	constructor(columns: number, rows: number) {
		this.columns = columns;
		this.rows = rows;
	}

	start(): void {}
	stop(): void {}
	async drainInput(): Promise<void> {}
	write(data: string): void {
		this.written.push(data);
	}
	get kittyProtocolActive(): boolean {
		return false;
	}
	moveBy(): void {}
	hideCursor(): void {}
	showCursor(): void {}
	clearLine(): void {}
	clearFromCursor(): void {}
	clearScreen(): void {}
	setTitle(): void {}
	setProgress(): void {}

	get output(): string {
		return this.written.join("");
	}
}

/** Stand-in for the chat transcript above, or the pi dock below. */
class FixedLines {
	constructor(
		private readonly lineCount: number,
		private readonly prefix: string,
	) {}
	invalidate(): void {}
	render(): string[] {
		return Array.from({ length: this.lineCount }, (_, index) => `${this.prefix} ${index}`);
	}
}

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

function buildLongDescription(lineCount: number): string {
	return Array.from({ length: lineCount }, (_, index) => `context line ${index}`).join("\n");
}

function buildManyOptions(count: number): { label: string }[] {
	return Array.from({ length: count }, (_, index) => ({ label: `Option ${index}` }));
}

interface LayoutRunOptions {
	rows: number;
	/** Lines of chat transcript rendered above the ask component. */
	historyLines: number;
	/** Lines of pi dock (status, widgets, footer) rendered below it. */
	dockLines: number;
	keys: string[];
}

interface LayoutRunResult {
	scrollbackWipes: number;
	fullRedraws: number;
	askLineCount: number;
	rows: number;
}

/**
 * Mount a factory-produced component between two sibling components inside a
 * real TuiMainScreen, drive it with keys, and report what the renderer did.
 */
async function runInRealLayout(
	mount: (ui: ExtensionUIContext) => Promise<unknown>,
	options: LayoutRunOptions,
): Promise<LayoutRunResult> {
	const terminal = new RecordingTerminal(80, options.rows);
	const tui = new TUI(terminal as never, false);
	let captured: LayoutRunResult | undefined;

	// doRender() is the synchronous render entry point. Calling it directly
	// keeps each keystroke's output deterministic, without the nextTick
	// scheduling that requestRender() introduces.
	const renderSynchronously = () => (tui as unknown as { doRender(): void }).doRender();

	tui.addChild(new FixedLines(options.historyLines, "history") as never);

	const ui = {
		custom: async (factory: any) => {
			const component = await factory(tui, createFakeTheme(), {}, () => {});
			tui.addChild(component);
			if (options.dockLines > 0) {
				tui.addChild(new FixedLines(options.dockLines, "footer") as never);
			}

			// Initial paint, then measure only the keystroke-driven renders.
			renderSynchronously();
			const redrawsBefore = tui.fullRedraws;
			terminal.written.length = 0;

			for (const key of options.keys) {
				component.handleInput(key);
				renderSynchronously();
			}

			captured = {
				scrollbackWipes: terminal.output.split(ERASE_SCROLLBACK).length - 1,
				fullRedraws: tui.fullRedraws - redrawsBefore,
				askLineCount: component.render(80).length,
				rows: options.rows,
			};

			return { cancelled: true, selectedOptionIndexesByQuestion: [], noteByQuestionByOption: [] };
		},
	} as unknown as ExtensionUIContext;

	await mount(ui);

	if (!captured) throw new Error("component was never mounted");
	return captured;
}

/** Walk the cursor to the bottom of the option list and back to the top. */
function walkDownAndBackUp(steps: number): string[] {
	return [...Array.from({ length: steps }, () => KEY_DOWN), ...Array.from({ length: steps }, () => KEY_UP)];
}

const DOCK_SIZES = [0, 2, 4, 6, 8] as const;
const TERMINAL_ROWS = [12, 16, 20, 24, 40] as const;

describe("single-question UI inside pi's real layout", () => {
	for (const dockLines of DOCK_SIZES) {
		it(`never erases scrollback with a ${dockLines}-line dock below it`, async () => {
			const result = await runInRealLayout(
				(ui) =>
					askSingleQuestionWithInlineNote(ui, {
						question: "Which execution path should we prioritise?",
						description: buildLongDescription(30),
						options: buildManyOptions(12),
					}),
				{ rows: 40, historyLines: 30, dockLines, keys: walkDownAndBackUp(12) },
			);

			expect(result.scrollbackWipes).toBe(0);
			expect(result.fullRedraws).toBe(0);
		});
	}

	for (const rows of TERMINAL_ROWS) {
		it(`never erases scrollback in a ${rows}-row terminal with a dock`, async () => {
			const result = await runInRealLayout(
				(ui) =>
					askSingleQuestionWithInlineNote(ui, {
						question: "Which execution path should we prioritise?",
						description: buildLongDescription(40),
						options: buildManyOptions(14),
					}),
				{ rows, historyLines: 50, dockLines: 6, keys: walkDownAndBackUp(14) },
			);

			expect(result.scrollbackWipes).toBe(0);
		});
	}

	it("leaves room for the dock rather than filling the terminal", async () => {
		const dockLines = 6;
		const result = await runInRealLayout(
			(ui) =>
				askSingleQuestionWithInlineNote(ui, {
					question: "Which execution path should we prioritise?",
					description: buildLongDescription(60),
					options: buildManyOptions(20),
				}),
			{ rows: 40, historyLines: 30, dockLines, keys: [] },
		);

		// The component plus the dock must still fit on screen, otherwise the
		// renderer is forced back into a full redraw.
		expect(result.askLineCount + dockLines).toBeLessThanOrEqual(result.rows);
	});
});

describe("tabbed UI inside pi's real layout", () => {
	for (const dockLines of DOCK_SIZES) {
		it(`never erases scrollback with a ${dockLines}-line dock below it`, async () => {
			const questions = [
				{
					id: "long",
					question: "Long description?",
					description: buildLongDescription(30),
					options: buildManyOptions(10),
				},
				{ id: "short", question: "Short?", options: buildManyOptions(3) },
			];

			const result = await runInRealLayout((ui) => askQuestionsWithTabs(ui, questions as never), {
				rows: 40,
				historyLines: 30,
				dockLines,
				keys: walkDownAndBackUp(10),
			});

			expect(result.scrollbackWipes).toBe(0);
			expect(result.fullRedraws).toBe(0);
		});
	}

	it("leaves room for the dock on the tabbed UI too", async () => {
		const dockLines = 6;
		const questions = [
			{
				id: "long",
				question: "Long description?",
				description: buildLongDescription(60),
				options: buildManyOptions(20),
			},
		];

		const result = await runInRealLayout((ui) => askQuestionsWithTabs(ui, questions as never), {
			rows: 40,
			historyLines: 30,
			dockLines,
			keys: [],
		});

		expect(result.askLineCount + dockLines).toBeLessThanOrEqual(result.rows);
	});
});
