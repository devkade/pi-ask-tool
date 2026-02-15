import { describe, expect, it } from "bun:test";
import {
	OTHER_OPTION,
	appendRecommendedTagToOptionLabels,
	buildMultiSelectionResult,
	buildSingleSelectionResult,
} from "../src/ask-logic";

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
