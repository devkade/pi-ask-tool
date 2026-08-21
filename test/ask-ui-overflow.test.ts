import { describe, expect, it } from "bun:test";
import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { askSingleQuestionWithInlineNote } from "../src/ask-inline-ui";
import { askQuestionsWithTabs } from "../src/ask-tabs-ui";

/**
 * Overflow regression tests for issue #5.
 *
 * A rendered ask UI taller than the terminal forces pi-tui's main-screen
 * renderer into a full redraw that clears the screen and the scrollback on
 * every keystroke. These tests assert the invariant that prevents it: the ask
 * UI never emits more lines than the terminal has rows, and the active target
 * stays inside what it does emit.
 */

const OVERFLOW_TERMINAL_HEIGHTS = [12, 16, 20] as const;

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

/** A TUI stub that reports a fixed terminal size, like a small window. */
function createFakeTui(rows: number) {
	return {
		requestRender() {},
		terminal: { rows, columns: 80 },
	};
}

/** Description long enough to overflow every height under test on its own. */
function buildLongDescription(lineCount: number): string {
	return Array.from({ length: lineCount }, (_, index) => `context line ${index} with some trailing text`).join("\n");
}

function buildManyOptions(count: number): { label: string }[] {
	return Array.from({ length: count }, (_, index) => ({
		label: `Option ${index} with a reasonably long label that may wrap on narrow terminals`,
	}));
}

/** Index of the line holding the option cursor marker, or -1. */
function findCursorLineIndex(lines: string[]): number {
	return lines.findIndex((line) => line.includes("→"));
}

interface HarnessResult {
	lines: string[];
	component: any;
	result: any;
}

/** Mount the single-question UI at a fixed height and drive it with keys. */
async function renderSingleQuestion(
	rows: number,
	questionInput: Parameters<typeof askSingleQuestionWithInlineNote>[1],
	keys: string[] = [],
	width = 80,
): Promise<HarnessResult> {
	let captured: HarnessResult = { lines: [], component: undefined, result: undefined };

	const ui = {
		custom: async (factory: any) => {
			const tui = createFakeTui(rows);
			let result: any;
			const done = (value: any) => {
				result = value;
			};

			const component = await factory(tui, createFakeTheme(), {}, done);
			component.render(width);
			for (const key of keys) {
				component.handleInput(key);
			}
			const lines = component.render(width);
			captured = { lines, component, result };

			if (result === undefined) done({ cancelled: true });
			return result ?? { cancelled: true };
		},
	} as unknown as ExtensionUIContext;

	await askSingleQuestionWithInlineNote(ui, questionInput);
	return captured;
}

/** Mount the tabbed UI at a fixed height and drive it with keys. */
async function renderTabs(
	rows: number,
	questions: Parameters<typeof askQuestionsWithTabs>[1],
	keys: string[] = [],
	width = 80,
): Promise<HarnessResult> {
	let captured: HarnessResult = { lines: [], component: undefined, result: undefined };

	const ui = {
		custom: async (factory: any) => {
			const tui = createFakeTui(rows);
			let result: any;
			const done = (value: any) => {
				result = value;
			};

			const component = await factory(tui, createFakeTheme(), {}, done);
			component.render(width);
			for (const key of keys) {
				component.handleInput(key);
			}
			const lines = component.render(width);
			captured = { lines, component, result };

			if (result === undefined) done({ cancelled: true, selectedOptionIndexesByQuestion: [], noteByQuestionByOption: [] });
			return result ?? { cancelled: true, selectedOptionIndexesByQuestion: [], noteByQuestionByOption: [] };
		},
	} as unknown as ExtensionUIContext;

	await askQuestionsWithTabs(ui, questions as any);
	return captured;
}

const KEY_DOWN = "\x1b[B";
const KEY_UP = "\x1b[A";
const KEY_RIGHT = "\x1b[C";
const KEY_LEFT = "\x1b[D";
const KEY_PAGE_UP = "\x1b[5~";
const KEY_PAGE_DOWN = "\x1b[6~";
/** xterm-style modified arrows: modifier 2 is Shift. */
const KEY_SHIFT_UP = "\x1b[1;2A";
const KEY_SHIFT_DOWN = "\x1b[1;2B";
/** rxvt-style shifted arrows, which pi-tui also recognises. */
const KEY_SHIFT_UP_RXVT = "\x1b[a";
const KEY_SHIFT_DOWN_RXVT = "\x1b[b";
const KEY_TAB = "\t";
const KEY_ESCAPE = "\x1b";

describe("Scenario 1 — single question with a long description", () => {
	for (const rows of OVERFLOW_TERMINAL_HEIGHTS) {
		it(`never renders taller than a ${rows}-row terminal`, async () => {
			const { lines } = await renderSingleQuestion(rows, {
				question: "Which execution path should we prioritise?",
				description: buildLongDescription(40),
				options: buildManyOptions(8),
			});

			expect(lines.length).toBeLessThanOrEqual(rows);
		});
	}

	it("keeps the cursor visible while moving down through a long screen", async () => {
		const keys = Array.from({ length: 6 }, () => KEY_DOWN);
		const { lines } = await renderSingleQuestion(
			16,
			{
				question: "Which execution path should we prioritise?",
				description: buildLongDescription(40),
				options: buildManyOptions(8),
			},
			keys,
		);

		expect(lines.length).toBeLessThanOrEqual(16);
		expect(findCursorLineIndex(lines)).toBeGreaterThanOrEqual(0);
	});

	it("keeps the cursor visible after moving back up to re-read context", async () => {
		const keys = [...Array.from({ length: 6 }, () => KEY_DOWN), ...Array.from({ length: 4 }, () => KEY_UP)];
		const { lines } = await renderSingleQuestion(
			16,
			{
				question: "Which execution path should we prioritise?",
				description: buildLongDescription(40),
				options: buildManyOptions(8),
			},
			keys,
		);

		expect(lines.length).toBeLessThanOrEqual(16);
		expect(findCursorLineIndex(lines)).toBeGreaterThanOrEqual(0);
	});

	it("exposes earlier context via PgUp without breaking the height bound", async () => {
		const question = {
			question: "Which execution path should we prioritise?",
			description: buildLongDescription(40),
			options: buildManyOptions(8),
		};

		const bottom = await renderSingleQuestion(16, question, [KEY_DOWN, KEY_DOWN, KEY_DOWN]);
		const scrolledUp = await renderSingleQuestion(16, question, [KEY_DOWN, KEY_DOWN, KEY_DOWN, KEY_PAGE_UP]);

		expect(scrolledUp.lines.length).toBeLessThanOrEqual(16);
		expect(scrolledUp.lines.join("\n")).not.toBe(bottom.lines.join("\n"));
	});

	it("returns to the cursor after PgUp once the selection moves again", async () => {
		const question = {
			question: "Which execution path should we prioritise?",
			description: buildLongDescription(40),
			options: buildManyOptions(8),
		};

		const { lines } = await renderSingleQuestion(16, question, [
			KEY_DOWN,
			KEY_DOWN,
			KEY_DOWN,
			KEY_PAGE_UP,
			KEY_PAGE_UP,
			KEY_DOWN,
		]);

		expect(lines.length).toBeLessThanOrEqual(16);
		expect(findCursorLineIndex(lines)).toBeGreaterThanOrEqual(0);
	});
});

describe("Scenario 2 — long wrapped inline notes stay usable", () => {
	it("keeps the edited option visible while typing a long note", async () => {
		const typedNote = "this is a fairly long note that will wrap across several rendered lines in a narrow terminal";
		const keys = [KEY_TAB, ...typedNote.split("")];

		const { lines } = await renderSingleQuestion(
			16,
			{
				question: "Which execution path should we prioritise?",
				description: buildLongDescription(30),
				options: buildManyOptions(6),
			},
			keys,
		);

		expect(lines.length).toBeLessThanOrEqual(16);
		expect(findCursorLineIndex(lines)).toBeGreaterThanOrEqual(0);
	});

	it("still bounds height when many options carry notes", async () => {
		const { lines } = await renderSingleQuestion(
			12,
			{
				question: "Pick one",
				description: buildLongDescription(24),
				options: buildManyOptions(10),
			},
			[KEY_TAB, ..."note text".split("")],
		);

		expect(lines.length).toBeLessThanOrEqual(12);
	});
});

describe("Scenario 3 — multi-question tabs with uneven heights", () => {
	for (const rows of OVERFLOW_TERMINAL_HEIGHTS) {
		it(`bounds every tab to a ${rows}-row terminal`, async () => {
			const questions = [
				{ id: "short", question: "Short one?", options: [{ label: "Yes" }, { label: "No" }] },
				{
					id: "long_desc",
					question: "Long description?",
					description: buildLongDescription(40),
					options: buildManyOptions(4),
				},
				{ id: "many_options", question: "Many options?", options: buildManyOptions(12) },
			];

			const first = await renderTabs(rows, questions);
			const second = await renderTabs(rows, questions, [KEY_RIGHT]);
			const third = await renderTabs(rows, questions, [KEY_RIGHT, KEY_RIGHT]);

			expect(first.lines.length).toBeLessThanOrEqual(rows);
			expect(second.lines.length).toBeLessThanOrEqual(rows);
			expect(third.lines.length).toBeLessThanOrEqual(rows);
		});
	}

	it("keeps the active option visible after switching tabs", async () => {
		const questions = [
			{ id: "short", question: "Short one?", options: [{ label: "Yes" }, { label: "No" }] },
			{
				id: "long_desc",
				question: "Long description?",
				description: buildLongDescription(40),
				options: buildManyOptions(6),
			},
		];

		const { lines } = await renderTabs(16, questions, [KEY_RIGHT, KEY_DOWN, KEY_DOWN, KEY_LEFT, KEY_RIGHT]);

		expect(lines.length).toBeLessThanOrEqual(16);
		expect(findCursorLineIndex(lines)).toBeGreaterThanOrEqual(0);
	});
});

describe("Scenario 4 — submit review tab overflow", () => {
	it("bounds the review tab and keeps the blocking status visible", async () => {
		const questions = Array.from({ length: 14 }, (_, index) => ({
			id: `q${index}`,
			question: `Question ${index}?`,
			options: [{ label: "Yes" }, { label: "No" }],
		}));

		// Walk right past every question tab to land on the submit tab.
		const keys = Array.from({ length: questions.length }, () => KEY_RIGHT);
		const { lines } = await renderTabs(16, questions, keys);

		expect(lines.length).toBeLessThanOrEqual(16);
		expect(lines.join("\n")).toContain("Complete required answers");
	});

	it("bounds the review tab at the smallest supported height", async () => {
		const questions = Array.from({ length: 20 }, (_, index) => ({
			id: `q${index}`,
			question: `Question ${index}?`,
			options: [{ label: "Yes" }, { label: "No" }],
		}));

		const keys = Array.from({ length: questions.length }, () => KEY_RIGHT);
		const { lines } = await renderTabs(12, questions, keys);

		expect(lines.length).toBeLessThanOrEqual(12);
	});
});

describe("Scenario 5 — Other option with a required note under overflow", () => {
	it("opens the note editor and stays bounded", async () => {
		const options = buildManyOptions(8);
		// Move down onto the trailing Other option.
		const keys = Array.from({ length: options.length }, () => KEY_DOWN);

		const { lines } = await renderSingleQuestion(
			16,
			{
				question: "Pick one",
				description: buildLongDescription(30),
				options,
			},
			keys,
		);

		expect(lines.length).toBeLessThanOrEqual(16);
		expect(lines.join("\n")).toContain("Typing note inline");
	});
});

describe("Scenario 6 — recommended option far from the top", () => {
	it("keeps a deep recommended option visible in a short terminal", async () => {
		const { lines } = await renderSingleQuestion(12, {
			question: "Pick one",
			description: buildLongDescription(20),
			options: buildManyOptions(12),
			recommended: 10,
		});

		expect(lines.length).toBeLessThanOrEqual(12);
		expect(findCursorLineIndex(lines)).toBeGreaterThanOrEqual(0);
	});
});

describe("Scenario 7 — cancel behaviour under deep overflow", () => {
	it("still cancels with Esc after scrolling deep into a long screen", async () => {
		let capturedResult: any;

		const ui = {
			custom: async (factory: any) => {
				const tui = createFakeTui(16);
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, createFakeTheme(), {}, done);
				component.render(80);
				component.handleInput(KEY_DOWN);
				component.handleInput(KEY_DOWN);
				component.handleInput(KEY_PAGE_DOWN);
				component.handleInput(KEY_ESCAPE);
				capturedResult = result;
				return result ?? { cancelled: true };
			},
		} as unknown as ExtensionUIContext;

		const selection = await askSingleQuestionWithInlineNote(ui, {
			question: "Pick one",
			description: buildLongDescription(40),
			options: buildManyOptions(6),
		});

		expect(capturedResult?.cancelled).toBeTrue();
		expect(selection.selectedOptions).toEqual([]);
	});

	it("still cancels the tabbed flow with Esc under overflow", async () => {
		const questions = [
			{
				id: "long",
				question: "Long one?",
				description: buildLongDescription(40),
				options: buildManyOptions(8),
			},
		];

		const { result } = await renderTabs(16, questions, [KEY_DOWN, KEY_PAGE_DOWN, KEY_ESCAPE]);

		expect(result?.cancelled).toBeTrue();
	});
});

describe("unbounded rendering is preserved when terminal height is unknown", () => {
	it("renders every line when the TUI reports no terminal", async () => {
		let lines: string[] = [];

		const ui = {
			custom: async (factory: any) => {
				// No `terminal` key at all, matching older host behaviour.
				const tui = { requestRender() {} };
				let result: any;
				const done = (value: any) => {
					result = value;
				};

				const component = await factory(tui, createFakeTheme(), {}, done);
				lines = component.render(80);
				done({ cancelled: true });
				return result;
			},
		} as unknown as ExtensionUIContext;

		await askSingleQuestionWithInlineNote(ui, {
			question: "Pick one",
			description: buildLongDescription(40),
			options: buildManyOptions(8),
		});

		expect(lines.length).toBeGreaterThan(40);
	});
});

describe("scroll key bindings", () => {
	const tallQuestion = {
		question: "Which execution path should we prioritise?",
		description: buildLongDescription(40),
		options: buildManyOptions(8),
	};

	/**
	 * Shift+arrow is the primary scroll binding because terminal multiplexers
	 * routinely capture PgUp/PgDn for their own scrollback and never forward
	 * them to the application. Both bindings must keep working.
	 */
	const scrollUpKeys: [string, string][] = [
		["Shift+Up (xterm)", KEY_SHIFT_UP],
		["Shift+Up (rxvt)", KEY_SHIFT_UP_RXVT],
		["PgUp", KEY_PAGE_UP],
	];

	for (const [label, key] of scrollUpKeys) {
		it(`scrolls up with ${label}`, async () => {
			const atCursor = await renderSingleQuestion(16, tallQuestion, [KEY_DOWN, KEY_DOWN, KEY_DOWN]);
			const scrolled = await renderSingleQuestion(16, tallQuestion, [KEY_DOWN, KEY_DOWN, KEY_DOWN, key]);

			expect(scrolled.lines.join("\n")).not.toBe(atCursor.lines.join("\n"));
			expect(scrolled.lines.length).toBeLessThanOrEqual(16);
		});
	}

	const scrollDownKeys: [string, string][] = [
		["Shift+Down (xterm)", KEY_SHIFT_DOWN],
		["Shift+Down (rxvt)", KEY_SHIFT_DOWN_RXVT],
		["PgDn", KEY_PAGE_DOWN],
	];

	for (const [label, key] of scrollDownKeys) {
		it(`scrolls back down with ${label}`, async () => {
			const scrolledUp = await renderSingleQuestion(16, tallQuestion, [KEY_SHIFT_UP, KEY_SHIFT_UP]);
			const scrolledBack = await renderSingleQuestion(16, tallQuestion, [KEY_SHIFT_UP, KEY_SHIFT_UP, key]);

			expect(scrolledBack.lines.join("\n")).not.toBe(scrolledUp.lines.join("\n"));
			expect(scrolledBack.lines.length).toBeLessThanOrEqual(16);
		});
	}

	it("moves the window, not the selection, when scrolling", async () => {
		// Scrolling is explicitly allowed to move the active option out of
		// view -- that is the point of reading back through long context.
		// What must not happen is the selection itself changing.
		const moved = await renderSingleQuestion(16, tallQuestion, [KEY_DOWN, KEY_DOWN]);
		const movedThenScrolled = await renderSingleQuestion(16, tallQuestion, [
			KEY_DOWN,
			KEY_DOWN,
			KEY_SHIFT_UP,
			KEY_SHIFT_UP,
		]);

		// The view changed...
		expect(movedThenScrolled.lines.join("\n")).not.toBe(moved.lines.join("\n"));

		// ...but pressing Enter still submits the option that was selected
		// before scrolling, proving the selection did not follow the window.
		const submitted = await renderSingleQuestion(16, tallQuestion, [
			KEY_DOWN,
			KEY_DOWN,
			KEY_SHIFT_UP,
			KEY_SHIFT_UP,
			"\r",
		]);

		expect(submitted.result?.selectedOption).toBe(tallQuestion.options[2].label);
	});

	it("returns to the selected option when the selection next moves", async () => {
		// After scrolling away, the next arrow key re-follows the cursor.
		const scrolledThenMoved = await renderSingleQuestion(16, tallQuestion, [
			KEY_DOWN,
			KEY_SHIFT_UP,
			KEY_SHIFT_UP,
			KEY_SHIFT_UP,
			KEY_DOWN,
		]);

		expect(findCursorLineIndex(scrolledThenMoved.lines)).toBeGreaterThanOrEqual(0);
	});

	it("scrolls the tabbed UI with Shift+Up too", async () => {
		const questions = [
			{
				id: "long",
				question: "Long one?",
				description: buildLongDescription(40),
				options: buildManyOptions(8),
			},
		];

		const atCursor = await renderTabs(16, questions, [KEY_DOWN]);
		const scrolled = await renderTabs(16, questions, [KEY_DOWN, KEY_SHIFT_UP]);

		expect(scrolled.lines.join("\n")).not.toBe(atCursor.lines.join("\n"));
		expect(scrolled.lines.length).toBeLessThanOrEqual(16);
	});

	it("still scrolls while the inline note editor is open", async () => {
		const opened = await renderSingleQuestion(16, tallQuestion, [KEY_TAB, ..."note".split("")]);
		const scrolled = await renderSingleQuestion(16, tallQuestion, [
			KEY_TAB,
			..."note".split(""),
			KEY_SHIFT_UP,
			KEY_SHIFT_UP,
		]);

		expect(scrolled.lines.join("\n")).not.toBe(opened.lines.join("\n"));
		expect(scrolled.lines.length).toBeLessThanOrEqual(16);
	});
});

describe("options survive a long description", () => {
	/** Count rendered option rows by their bullet or checkbox markers. */
	function countVisibleOptions(lines: string[]): number {
		return lines.filter((line) => /[●○]/.test(line)).length;
	}

	it("shows every option when they fit, however long the description", async () => {
		// Reported symptom: a long description pushed the options to the
		// bottom edge and left only the active one on screen.
		const options = buildManyOptions(6);
		const { lines } = await renderSingleQuestion(24, {
			question: "Which execution path should we prioritise?",
			description: buildLongDescription(60),
			options,
		});

		// Six options plus the appended Other.
		expect(countVisibleOptions(lines)).toBe(options.length + 1);
	});

	it("keeps showing every option as the description grows", async () => {
		const options = buildManyOptions(5);
		for (const descriptionLines of [20, 40, 80, 160]) {
			const { lines } = await renderSingleQuestion(24, {
				question: "Pick one",
				description: buildLongDescription(descriptionLines),
				options,
			});

			expect(countVisibleOptions(lines)).toBe(options.length + 1);
		}
	});

	it("fills the viewport with options when they cannot all fit", async () => {
		const { lines } = await renderSingleQuestion(20, {
			question: "Pick one",
			description: buildLongDescription(40),
			options: buildManyOptions(40),
		});

		// Not all 41 fit in a 20-row terminal, but the space must go to
		// options rather than to description the reader can scroll back for.
		expect(countVisibleOptions(lines)).toBeGreaterThan(5);
	});

	it("shows every option in the tabbed UI too", async () => {
		const questions = [
			{
				id: "long",
				question: "Long description?",
				description: buildLongDescription(60),
				options: buildManyOptions(5),
			},
		];

		const { lines } = await renderTabs(24, questions);

		expect(countVisibleOptions(lines)).toBe(6);
	});
});
