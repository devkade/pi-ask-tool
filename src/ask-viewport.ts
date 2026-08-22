/**
 * Vertical viewport model for the ask UI.
 *
 * The ask UI renders question text, description, options and inline notes as a
 * flat list of lines. When that list grows taller than the terminal, pi-tui's
 * main-screen renderer can no longer update it differentially: the first
 * changed line sits above the previous viewport top, so the renderer falls back
 * to a full redraw that clears the screen *and* the scrollback
 * (`\x1b[2J\x1b[H\x1b[3J`) on every keystroke. That is what makes a tall ask
 * prompt flicker and what prevents scrolling back through history.
 *
 * The fix is to never emit more lines than the terminal can show. This module
 * owns the arithmetic for that, kept separate from line generation so the
 * single-question UI and the tabbed UI share one implementation.
 */

/**
 * Rows left to the pi chrome that renders *below* the ask UI.
 *
 * The component is mounted in pi's editor container, and the widget and footer
 * containers render beneath it. It cannot measure them: `render(width)`
 * receives no height and main-screen mode gives it no layout callback.
 *
 * This reserve is the whole constraint. Differential rendering survives as long
 * as the ask UI plus that trailing chrome fits on screen, and the chrome is a
 * roughly fixed few lines that does not grow with the terminal. So the budget
 * scales with terminal height and windowing only starts when the content
 * genuinely does not fit.
 *
 * The value is a worst-case guess at that trailing chrome: a footer of a few
 * lines plus whatever widgets extensions add below the editor. It is a
 * constant rather than a share of the screen, because the chrome is a constant
 * — making it proportional would withhold ever more rows the taller the
 * terminal got, windowing content that had room to render.
 *
 * Chosen from the layout suite in test/ask-ui-render-layout.test.ts, which
 * drives the real renderer with 0 to 8 rows of chrome beneath the component:
 * 7 is the smallest value that never erases the scrollback, so 8 leaves one
 * row of margin. A deeper dock than this reserve reintroduces the redraw.
 */
export const DEFAULT_RESERVED_ROWS = 8;

/** Smallest body viewport we will ever ask for, so tiny terminals stay usable. */
export const MIN_VIEWPORT_HEIGHT = 3;

/** A half-open range of body line indexes that must stay visible. */
export interface ViewportAnchor {
	/** First line index that must remain visible. */
	start: number;
	/** Last line index that must remain visible (inclusive). */
	end: number;
}

export interface ViewportSliceOptions {
	/** Full body content, before slicing. */
	lines: string[];
	/** Maximum body lines that may be emitted, or undefined for unbounded. */
	viewportHeight: number | undefined;
	/** Lines that must stay visible (typically the active option and its caret). */
	anchor?: ViewportAnchor;
	/**
	 * Region to reveal as fully as possible, ahead of anything preceding it.
	 *
	 * The options are what the reader has to act on, so when the body does not
	 * fit they win the viewport and the question and description above them
	 * become the part that scrolls.
	 */
	priority?: ViewportAnchor;
	/** Offset requested by explicit user scrolling. */
	scrollOffset?: number;
	/** When true, honour scrollOffset even if it pushes the anchor off-screen. */
	preferScrollOffset?: boolean;
}

export interface ViewportSlice {
	/** Body lines to render, never longer than viewportHeight. */
	lines: string[];
	/** Offset actually used, after clamping and anchor adjustment. */
	scrollOffset: number;
	/** Total body lines before slicing. */
	totalLines: number;
	/** Body lines hidden above the slice. */
	hiddenAbove: number;
	/** Body lines hidden below the slice. */
	hiddenBelow: number;
	/** True when the body did not fit and was sliced. */
	isOverflowing: boolean;
}

function toSafeInteger(value: number | undefined, fallback: number): number {
	if (value == null || !Number.isFinite(value)) return fallback;
	return Math.floor(value);
}

/**
 * Resolve how many body lines may be rendered for a terminal of `terminalRows`.
 *
 * Returns undefined when the terminal height is unknown, which means "do not
 * bound" — the caller then behaves exactly as it did before this module
 * existed. `chromeRows` covers lines the component always draws around the
 * body, such as rules, the tab bar and the key hints. The budget is the
 * terminal height minus that chrome and the reserve for the chrome pi renders
 * below the component, so it grows with the terminal rather than capping at a
 * share of it.
 */
export function resolveViewportHeight(
	terminalRows: number | undefined,
	chromeRows: number,
	reservedRows: number = DEFAULT_RESERVED_ROWS,
): number | undefined {
	if (terminalRows == null || !Number.isFinite(terminalRows)) return undefined;

	const rows = Math.floor(terminalRows);
	if (rows <= 0) return undefined;

	const safeChromeRows = Math.max(0, toSafeInteger(chromeRows, 0));
	const safeReservedRows = Math.max(0, toSafeInteger(reservedRows, DEFAULT_RESERVED_ROWS));

	// Windowing is a last resort, so claim every row the terminal can spare:
	// only the chrome this component draws and the chrome pi draws beneath it
	// are withheld. Content that fits is never sliced.
	const available = rows - safeChromeRows - safeReservedRows;

	return Math.max(MIN_VIEWPORT_HEIGHT, available);
}

/** Largest valid scroll offset for the given content and viewport. */
export function maxScrollOffset(totalLines: number, viewportHeight: number): number {
	return Math.max(0, toSafeInteger(totalLines, 0) - Math.max(0, toSafeInteger(viewportHeight, 0)));
}

/** Clamp an arbitrary offset into the valid range for this content. */
export function clampScrollOffset(scrollOffset: number, totalLines: number, viewportHeight: number): number {
	const max = maxScrollOffset(totalLines, viewportHeight);
	const requested = toSafeInteger(scrollOffset, 0);
	if (requested < 0) return 0;
	if (requested > max) return max;
	return requested;
}

/**
 * Adjust an offset so the anchor range stays visible.
 *
 * When the anchor is taller than the viewport we keep its first line visible,
 * because that is where the option marker and the editing caret live.
 */
export function resolveScrollOffsetForAnchor(
	anchor: ViewportAnchor | undefined,
	scrollOffset: number,
	totalLines: number,
	viewportHeight: number,
): number {
	const clampedOffset = clampScrollOffset(scrollOffset, totalLines, viewportHeight);
	if (!anchor || viewportHeight <= 0) return clampedOffset;

	const maxLineIndex = Math.max(0, toSafeInteger(totalLines, 0) - 1);
	const anchorStart = Math.max(0, Math.min(toSafeInteger(anchor.start, 0), maxLineIndex));
	const anchorEnd = Math.max(anchorStart, Math.min(toSafeInteger(anchor.end, anchorStart), maxLineIndex));

	let nextOffset = clampedOffset;
	if (anchorEnd >= nextOffset + viewportHeight) {
		nextOffset = anchorEnd - viewportHeight + 1;
	}
	if (anchorStart < nextOffset) {
		nextOffset = anchorStart;
	}

	return clampScrollOffset(nextOffset, totalLines, viewportHeight);
}

/**
 * Adjust an offset so the priority region is revealed as fully as possible,
 * while the anchor stays visible.
 *
 * Without this, a long description pushes the options to the bottom edge of
 * the viewport and only the active one is left on screen: the reader sees the
 * tail of the context and a single choice. Giving the options the viewport
 * inverts that, so the choices are what survives and the context is what
 * scrolls.
 */
export function resolveScrollOffsetForPriority(
	priority: ViewportAnchor | undefined,
	anchor: ViewportAnchor | undefined,
	scrollOffset: number,
	totalLines: number,
	viewportHeight: number,
): number {
	if (!priority || viewportHeight <= 0) {
		return resolveScrollOffsetForAnchor(anchor, scrollOffset, totalLines, viewportHeight);
	}

	const maxLineIndex = Math.max(0, toSafeInteger(totalLines, 0) - 1);
	const priorityStart = Math.max(0, Math.min(toSafeInteger(priority.start, 0), maxLineIndex));
	const priorityEnd = Math.max(priorityStart, Math.min(toSafeInteger(priority.end, priorityStart), maxLineIndex));
	const priorityHeight = priorityEnd - priorityStart + 1;

	if (priorityHeight <= viewportHeight) {
		// The whole region fits. Sit it at the bottom of the viewport so every
		// line of it shows and the rest of the space goes to the context
		// immediately above it.
		const offsetShowingWholeRegion = Math.min(priorityStart, priorityEnd - viewportHeight + 1);
		return clampScrollOffset(offsetShowingWholeRegion, totalLines, viewportHeight);
	}

	// The region is taller than the viewport, so nothing before it earns space.
	// Start at its first line and scroll only as far as the anchor demands.
	const offsetWithinRegion = Math.max(toSafeInteger(scrollOffset, 0), priorityStart);
	return resolveScrollOffsetForAnchor(anchor, offsetWithinRegion, totalLines, viewportHeight);
}

/**
 * Slice body content down to the viewport, keeping the anchor visible.
 *
 * With no viewport height the content is returned untouched, so callers that
 * cannot determine the terminal size keep their previous behaviour.
 */
export function sliceViewport(options: ViewportSliceOptions): ViewportSlice {
	const lines = options.lines;
	const totalLines = lines.length;
	const viewportHeight = options.viewportHeight;

	if (viewportHeight == null || !Number.isFinite(viewportHeight) || viewportHeight <= 0 || totalLines <= viewportHeight) {
		return {
			lines,
			scrollOffset: 0,
			totalLines,
			hiddenAbove: 0,
			hiddenBelow: 0,
			isOverflowing: false,
		};
	}

	const height = Math.floor(viewportHeight);
	const requestedOffset = toSafeInteger(options.scrollOffset, 0);
	const scrollOffset = options.preferScrollOffset
		? clampScrollOffset(requestedOffset, totalLines, height)
		: resolveScrollOffsetForPriority(options.priority, options.anchor, requestedOffset, totalLines, height);

	return {
		lines: lines.slice(scrollOffset, scrollOffset + height),
		scrollOffset,
		totalLines,
		hiddenAbove: scrollOffset,
		hiddenBelow: Math.max(0, totalLines - scrollOffset - height),
		isOverflowing: true,
	};
}

/**
 * Human-readable indicator describing content hidden above and below.
 * Returns undefined when nothing is hidden, so callers can skip the line.
 */
export function buildScrollIndicator(slice: Pick<ViewportSlice, "hiddenAbove" | "hiddenBelow">): string | undefined {
	const above = Math.max(0, toSafeInteger(slice.hiddenAbove, 0));
	const below = Math.max(0, toSafeInteger(slice.hiddenBelow, 0));
	if (above === 0 && below === 0) return undefined;

	const parts: string[] = [];
	if (above > 0) parts.push(`↑ ${above} more`);
	if (below > 0) parts.push(`↓ ${below} more`);
	return parts.join(" · ");
}
