import { describe, expect, it } from "bun:test";
import {
	DEFAULT_RESERVED_ROWS,
	MIN_VIEWPORT_HEIGHT,
	buildScrollIndicator,
	clampScrollOffset,
	maxScrollOffset,
	resolveScrollOffsetForAnchor,
	resolveScrollOffsetForPriority,
	resolveViewportHeight,
	sliceViewport,
} from "../src/ask-viewport";

function buildLines(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `line ${index}`);
}

describe("resolveViewportHeight", () => {
	it("returns undefined when terminal height is unknown or unusable", () => {
		expect(resolveViewportHeight(undefined, 3)).toBeUndefined();
		expect(resolveViewportHeight(Number.NaN, 3)).toBeUndefined();
		expect(resolveViewportHeight(0, 3)).toBeUndefined();
		expect(resolveViewportHeight(-10, 3)).toBeUndefined();
	});

	it("subtracts only the component chrome and the reserve", () => {
		expect(resolveViewportHeight(40, 3)).toBe(40 - 3 - DEFAULT_RESERVED_ROWS);
		expect(resolveViewportHeight(40, 6)).toBe(40 - 6 - DEFAULT_RESERVED_ROWS);
	});

	it("honours an explicit reserve", () => {
		expect(resolveViewportHeight(40, 3, 30)).toBe(40 - 3 - 30);
	});

	it("grows the budget with the terminal instead of capping at a share of it", () => {
		// Regression: a 0.6 fraction cap withheld rows that were genuinely
		// free, windowing content that had room to render. On a 54-row
		// terminal it allowed 29 body lines while 43 were actually available,
		// hiding 16 lines of a 45-line prompt.
		const cappedAtSixtyPercent = Math.floor(54 * 0.6) - 3;
		expect(resolveViewportHeight(54, 3)).toBeGreaterThan(cappedAtSixtyPercent);

		// Every extra terminal row must become an extra body row.
		for (const rows of [24, 40, 54, 80]) {
			expect(resolveViewportHeight(rows, 3)).toBe(rows - 3 - DEFAULT_RESERVED_ROWS);
		}
	});

	it("leaves room for pi's dock below the component", () => {
		// Regression for the layout bug: a 40-row terminal must leave enough
		// space for a multi-row status/widget/footer dock beneath the ask UI.
		const chromeRows = 3;
		const bodyHeight = resolveViewportHeight(40, chromeRows) as number;
		expect(bodyHeight + chromeRows).toBeLessThanOrEqual(40 - 6);
	});

	it("never drops below the minimum viewport height on tiny terminals", () => {
		expect(resolveViewportHeight(4, 6)).toBe(MIN_VIEWPORT_HEIGHT);
		expect(resolveViewportHeight(1, 6)).toBe(MIN_VIEWPORT_HEIGHT);
	});

	it("floors negative chrome rows at zero and falls back to the default reserve", () => {
		// A non-finite reservedRows falls back to DEFAULT_RESERVED_ROWS rather
		// than zero, so an unreadable value cannot silently claim the whole screen.
		expect(resolveViewportHeight(20, Number.NaN, Number.NaN)).toBe(20 - DEFAULT_RESERVED_ROWS);
		expect(resolveViewportHeight(20, -5, -5)).toBe(20);
	});
});

describe("maxScrollOffset and clampScrollOffset", () => {
	it("computes the largest offset that still fills the viewport", () => {
		expect(maxScrollOffset(50, 10)).toBe(40);
		expect(maxScrollOffset(5, 10)).toBe(0);
	});

	it("clamps offsets into the valid range", () => {
		expect(clampScrollOffset(-5, 50, 10)).toBe(0);
		expect(clampScrollOffset(999, 50, 10)).toBe(40);
		expect(clampScrollOffset(12, 50, 10)).toBe(12);
		expect(clampScrollOffset(Number.NaN, 50, 10)).toBe(0);
	});
});

describe("resolveScrollOffsetForAnchor", () => {
	it("keeps the offset unchanged when the anchor is already visible", () => {
		expect(resolveScrollOffsetForAnchor({ start: 12, end: 13 }, 10, 50, 10)).toBe(10);
	});

	it("scrolls down so an anchor below the viewport becomes visible", () => {
		expect(resolveScrollOffsetForAnchor({ start: 30, end: 30 }, 0, 50, 10)).toBe(21);
	});

	it("scrolls up so an anchor above the viewport becomes visible", () => {
		expect(resolveScrollOffsetForAnchor({ start: 4, end: 4 }, 20, 50, 10)).toBe(4);
	});

	it("prefers the anchor start when the anchor is taller than the viewport", () => {
		expect(resolveScrollOffsetForAnchor({ start: 10, end: 40 }, 0, 60, 5)).toBe(10);
	});

	it("returns a clamped offset when there is no anchor", () => {
		expect(resolveScrollOffsetForAnchor(undefined, 999, 50, 10)).toBe(40);
	});
});

describe("sliceViewport", () => {
	it("returns content untouched when the viewport height is unknown", () => {
		const lines = buildLines(120);
		const slice = sliceViewport({ lines, viewportHeight: undefined });

		expect(slice.lines).toBe(lines);
		expect(slice.isOverflowing).toBeFalse();
		expect(slice.hiddenAbove).toBe(0);
		expect(slice.hiddenBelow).toBe(0);
	});

	it("returns content untouched when it already fits", () => {
		const lines = buildLines(8);
		const slice = sliceViewport({ lines, viewportHeight: 10 });

		expect(slice.lines).toEqual(lines);
		expect(slice.isOverflowing).toBeFalse();
	});

	it("never emits more lines than the viewport height", () => {
		const slice = sliceViewport({ lines: buildLines(500), viewportHeight: 10 });

		expect(slice.lines).toHaveLength(10);
		expect(slice.isOverflowing).toBeTrue();
	});

	it("keeps the anchor visible and reports hidden counts", () => {
		const slice = sliceViewport({
			lines: buildLines(100),
			viewportHeight: 10,
			anchor: { start: 60, end: 61 },
		});

		expect(slice.lines).toContain("line 60");
		expect(slice.lines).toContain("line 61");
		expect(slice.hiddenAbove).toBe(slice.scrollOffset);
		expect(slice.hiddenBelow).toBe(100 - slice.scrollOffset - 10);
	});

	it("honours an explicit scroll offset over the anchor when asked", () => {
		const slice = sliceViewport({
			lines: buildLines(100),
			viewportHeight: 10,
			anchor: { start: 90, end: 90 },
			scrollOffset: 0,
			preferScrollOffset: true,
		});

		expect(slice.scrollOffset).toBe(0);
		expect(slice.lines[0]).toBe("line 0");
	});
});

describe("buildScrollIndicator", () => {
	it("returns undefined when nothing is hidden", () => {
		expect(buildScrollIndicator({ hiddenAbove: 0, hiddenBelow: 0 })).toBeUndefined();
	});

	it("describes content hidden above, below, or both", () => {
		expect(buildScrollIndicator({ hiddenAbove: 4, hiddenBelow: 0 })).toBe("↑ 4 more");
		expect(buildScrollIndicator({ hiddenAbove: 0, hiddenBelow: 7 })).toBe("↓ 7 more");
		expect(buildScrollIndicator({ hiddenAbove: 4, hiddenBelow: 7 })).toBe("↑ 4 more · ↓ 7 more");
	});
});

describe("resolveScrollOffsetForPriority", () => {
	it("falls back to plain anchor behaviour when there is no priority region", () => {
		expect(resolveScrollOffsetForPriority(undefined, { start: 30, end: 30 }, 0, 50, 10)).toBe(
			resolveScrollOffsetForAnchor({ start: 30, end: 30 }, 0, 50, 10),
		);
	});

	it("reveals the whole priority region when it fits", () => {
		// Options occupy lines 40-46 of a 50-line body in a 10-line viewport.
		// Every one of them must be on screen, not just the active one.
		const offset = resolveScrollOffsetForPriority({ start: 40, end: 46 }, { start: 40, end: 40 }, 0, 50, 10);

		expect(offset).toBeLessThanOrEqual(40);
		expect(offset + 10 - 1).toBeGreaterThanOrEqual(46);
	});

	it("fills the space above the region with the context just before it", () => {
		// Sitting the region at the bottom keeps the nearest context visible
		// rather than leaving blank space under the options.
		const offset = resolveScrollOffsetForPriority({ start: 40, end: 46 }, { start: 40, end: 40 }, 0, 50, 10);

		expect(offset).toBe(46 - 10 + 1);
	});

	it("gives the viewport entirely to a region taller than it", () => {
		// 30 options cannot fit in 10 lines, so no description line earns space.
		const offset = resolveScrollOffsetForPriority({ start: 10, end: 39 }, { start: 10, end: 10 }, 0, 50, 10);

		expect(offset).toBeGreaterThanOrEqual(10);
	});

	it("keeps the active option visible inside an oversized region", () => {
		const offset = resolveScrollOffsetForPriority({ start: 10, end: 39 }, { start: 35, end: 35 }, 0, 50, 10);

		expect(offset).toBeLessThanOrEqual(35);
		expect(offset + 10 - 1).toBeGreaterThanOrEqual(35);
	});
});
