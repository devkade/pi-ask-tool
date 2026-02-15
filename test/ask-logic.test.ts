import { describe, expect, it } from "bun:test";
import {
	DONE_SELECTING_OPTION,
	OTHER_OPTION,
	addRecommendedSuffix,
	askQuestion,
	buildMultiSelection,
	buildSingleSelection,
	stripRecommendedSuffix,
	type AskQuestion,
	type AskUI,
} from "../src/ask-logic";

describe("addRecommendedSuffix", () => {
	it("adds suffix only for valid recommended index", () => {
		expect(addRecommendedSuffix(["A", "B", "C"], 1)).toEqual(["A", "B (Recommended)", "C"]);
		expect(addRecommendedSuffix(["A", "B", "C"], -1)).toEqual(["A", "B", "C"]);
		expect(addRecommendedSuffix(["A", "B", "C"], 9)).toEqual(["A", "B", "C"]);
	});
});

describe("stripRecommendedSuffix", () => {
	it("removes suffix when present", () => {
		expect(stripRecommendedSuffix("Fast (Recommended)")).toBe("Fast");
		expect(stripRecommendedSuffix("Slow")).toBe("Slow");
	});
});

describe("buildSingleSelection", () => {
	it("returns selected option when no note is provided", () => {
		expect(buildSingleSelection("Session auth", "")).toEqual({ selectedOptions: ["Session auth"] });
	});

	it("appends note for predefined options", () => {
		expect(buildSingleSelection("Session auth", "분할세션")).toEqual({ selectedOptions: ["Session auth - 분할세션"] });
	});

	it("returns customInput when Other is selected", () => {
		expect(buildSingleSelection(OTHER_OPTION, "완전 커스텀 방식")).toEqual({
			selectedOptions: [],
			customInput: "완전 커스텀 방식",
		});
	});
});

describe("buildMultiSelection", () => {
	it("builds selected options with per-option notes", () => {
		const result = buildMultiSelection(
			["JWT", "Session (Recommended)", OTHER_OPTION],
			[0, 1],
			["", "분할세션", ""],
			2,
		);

		expect(result).toEqual({ selectedOptions: ["JWT", "Session - 분할세션"] });
	});

	it("puts Other note into customInput while keeping selected options", () => {
		const result = buildMultiSelection(
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

function createScriptedUI(steps: Array<string | undefined>, inputValue?: string): AskUI {
	let index = 0;
	return {
		select: async () => steps[index++],
		input: async () => inputValue,
	};
}

function question(overrides: Partial<AskQuestion> = {}): AskQuestion {
	return {
		id: "strategy",
		question: "Which strategy should we use?",
		options: [{ label: "Fast" }, { label: "Safe" }],
		multi: false,
		...overrides,
	};
}

describe("askQuestion single", () => {
	it("returns selected option without recommended suffix", async () => {
		const ui = createScriptedUI(["Safe (Recommended)"]);
		const result = await askQuestion(ui, question({ recommended: 1 }));

		expect(result.selectedOptions).toEqual(["Safe"]);
		expect(result.customInput).toBeUndefined();
	});

	it("returns customInput when Other is selected", async () => {
		const ui = createScriptedUI([OTHER_OPTION], "Ship it with docs");
		const result = await askQuestion(ui, question());

		expect(result.selectedOptions).toEqual([]);
		expect(result.customInput).toBe("Ship it with docs");
	});
});

describe("askQuestion multi", () => {
	it("supports toggling multiple choices and done selection", async () => {
		const ui = createScriptedUI(["☐ Fast", "☐ Safe", DONE_SELECTING_OPTION]);
		const result = await askQuestion(ui, question({ multi: true }));

		expect(result.selectedOptions).toEqual(["Fast", "Safe"]);
		expect(result.customInput).toBeUndefined();
	});

	it("allows custom input in multi mode", async () => {
		const ui = createScriptedUI([OTHER_OPTION], "Fast + Safe hybrid");
		const result = await askQuestion(ui, question({ multi: true }));

		expect(result.selectedOptions).toEqual([]);
		expect(result.customInput).toBe("Fast + Safe hybrid");
	});
});
