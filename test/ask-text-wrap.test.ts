import { describe, expect, it } from "bun:test";
import { visibleWidth } from "@mariozechner/pi-tui";
import { appendWrappedTextLines } from "../src/ask-text-wrap";

describe("appendWrappedTextLines", () => {
	it("wraps long text to fit width", () => {
		const lines: string[] = [];
		appendWrappedTextLines(lines, "This prompt should wrap into multiple lines without truncation.", 20, { indent: 1 });

		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(20);
		}
		expect(lines.join("\n")).not.toContain("…");
	});

	it("preserves explicit line breaks", () => {
		const lines: string[] = [];
		appendWrappedTextLines(lines, "Line A\nLine B", 20, { indent: 2 });

		expect(lines).toEqual(["  Line A", "  Line B"]);
	});

	it("applies custom line formatting", () => {
		const lines: string[] = [];
		appendWrappedTextLines(lines, "abc", 10, { formatLine: (line) => `[${line}]` });

		expect(lines[0]).toBe("[abc]");
	});
});
