import { describe, expect, it } from "bun:test";
import {
	OTHER_OPTION,
	appendRecommendedTagToOptionLabels,
	buildMultiSelectionResult,
	buildSingleSelectionResult,
} from "../src/ask-logic";
import {
	INLINE_NOTE_WRAP_PADDING,
	buildOptionLabelWithInlineNote,
	buildWrappedOptionLabelWithInlineNote,
} from "../src/ask-inline-note";

describe("appendRecommendedTagToOptionLabels", () => {
	it("adds recommended tag only for a valid index", () => {
		expect(appendRecommendedTagToOptionLabels(["A", "B", "C"], 1)).toEqual([
			"A",
			"B (Recommended)",
			"C",
		]);
		expect(appendRecommendedTagToOptionLabels(["A", "B", "C"], -1)).toEqual(["A", "B", "C"]);
		expect(appendRecommendedTagToOptionLabels(["A", "B", "C"], 9)).toEqual(["A", "B", "C"]);
	});

	it("does not duplicate existing recommended tag", () => {
		expect(appendRecommendedTagToOptionLabels(["Fast", "Safe (Recommended)"], 1)).toEqual([
			"Fast",
			"Safe (Recommended)",
		]);
	});
});

describe("buildSingleSelectionResult", () => {
	it("returns selected option when no note is provided", () => {
		expect(buildSingleSelectionResult("Session auth", "")).toEqual({ selectedOptions: ["Session auth"] });
	});

	it("removes recommended tag from selected option", () => {
		expect(buildSingleSelectionResult("Session auth (Recommended)", "")).toEqual({
			selectedOptions: ["Session auth"],
		});
	});

	it("appends note for predefined option", () => {
		expect(buildSingleSelectionResult("Session auth", "split-session")).toEqual({
			selectedOptions: ["Session auth - split-session"],
		});
	});

	it("maps Other + note to customInput", () => {
		expect(buildSingleSelectionResult(OTHER_OPTION, "custom auth flow")).toEqual({
			selectedOptions: [],
			customInput: "custom auth flow",
		});
	});
});

describe("buildMultiSelectionResult", () => {
	it("builds selected options with per-option notes", () => {
		const result = buildMultiSelectionResult(
			["JWT", "Session (Recommended)", OTHER_OPTION],
			[0, 1],
			["", "stateful", ""],
			2,
		);

		expect(result).toEqual({ selectedOptions: ["JWT", "Session - stateful"] });
	});

	it("maps Other note into customInput while keeping selected options", () => {
		const result = buildMultiSelectionResult(
			["JWT", "Session", OTHER_OPTION],
			[0, 2],
			["", "", "organization-sso"],
			2,
		);

		expect(result).toEqual({
			selectedOptions: ["JWT"],
			customInput: "organization-sso",
		});
	});
});

describe("buildOptionLabelWithInlineNote", () => {
	it("returns base option when there is no note and not editing", () => {
		expect(buildOptionLabelWithInlineNote("JWT", "", false)).toBe("JWT");
	});

	it("shows saved note inline without changing layout", () => {
		expect(buildOptionLabelWithInlineNote("Session", "split-session", false)).toBe(
			"Session — note: split-session",
		);
	});

	it("sanitizes multiline/control note characters for inline display", () => {
		expect(buildOptionLabelWithInlineNote("Session", "line1\nline2\t\u0007", false)).toBe(
			"Session — note: line1 line2",
		);
	});

	it("keeps cursor visible when inline label is constrained", () => {
		const label = buildOptionLabelWithInlineNote("Session", "0123456789abcdef", true, 24);
		expect(label.endsWith("▍")).toBe(true);
		expect(label.length).toBeLessThanOrEqual(24);
		expect(label.includes("…")).toBe(true);
	});

	it("keeps cursor visible for long base label in narrow width", () => {
		const label = buildOptionLabelWithInlineNote("Other (type your own)", "", true, 22);
		expect(label.endsWith("▍")).toBe(true);
		expect(label.length).toBeLessThanOrEqual(22);
		expect(label.includes("…")).toBe(true);
	});

	it("shows editing cursor inline when editing note", () => {
		expect(buildOptionLabelWithInlineNote("Session", "split-session", true)).toBe(
			"Session — note: split-session▍",
		);
		expect(buildOptionLabelWithInlineNote("Other (type your own)", "", true)).toBe(
			"Other (type your own) — note: ▍",
		);
	});
});

describe("buildWrappedOptionLabelWithInlineNote", () => {
	it("wraps long inline notes instead of extending past width", () => {
		const wrapped = buildWrappedOptionLabelWithInlineNote(
			"Session",
			"0123456789abcdef0123456789abcdef",
			false,
			18,
			INLINE_NOTE_WRAP_PADDING,
		);

		expect(wrapped.length).toBeGreaterThan(1);
		expect(wrapped.every((line) => line.length <= 16)).toBe(true);
	});

	it("keeps editing cursor visible in wrapped output", () => {
		const wrapped = buildWrappedOptionLabelWithInlineNote(
			"Other (type your own)",
			"custom-flow",
			true,
			20,
			INLINE_NOTE_WRAP_PADDING,
		);

		expect(wrapped[wrapped.length - 1]?.endsWith("▍")).toBe(true);
	});
});
