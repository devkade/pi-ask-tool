import { wrapTextWithAnsi } from "@mariozechner/pi-tui";

const INLINE_NOTE_SEPARATOR = " — note: ";
const INLINE_EDIT_CURSOR = "▍";

export const INLINE_NOTE_WRAP_PADDING = 2;

function sanitizeNoteForInlineDisplay(rawNote: string): string {
	return rawNote.replace(/[\r\n\t]/g, " ").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function truncateTextKeepingTail(text: string, maxLength: number): string {
	if (maxLength <= 0) return "";
	if (text.length <= maxLength) return text;
	if (maxLength === 1) return "…";
	return `…${text.slice(-(maxLength - 1))}`;
}

function truncateTextKeepingHead(text: string, maxLength: number): string {
	if (maxLength <= 0) return "";
	if (text.length <= maxLength) return text;
	if (maxLength === 1) return "…";
	return `${text.slice(0, maxLength - 1)}…`;
}

export function buildOptionLabelWithInlineNote(
	baseOptionLabel: string,
	rawNote: string,
	isEditingNote: boolean,
	maxInlineLabelLength?: number,
): string {
	const sanitizedNote = sanitizeNoteForInlineDisplay(rawNote);
	if (!isEditingNote && sanitizedNote.trim().length === 0) {
		return baseOptionLabel;
	}

	const labelPrefix = `${baseOptionLabel}${INLINE_NOTE_SEPARATOR}`;
	const inlineNote = isEditingNote ? `${sanitizedNote}${INLINE_EDIT_CURSOR}` : sanitizedNote.trim();
	const inlineLabel = `${labelPrefix}${inlineNote}`;

	if (maxInlineLabelLength == null) {
		return inlineLabel;
	}

	return isEditingNote
		? truncateTextKeepingTail(inlineLabel, maxInlineLabelLength)
		: truncateTextKeepingHead(inlineLabel, maxInlineLabelLength);
}

export function buildWrappedOptionLabelWithInlineNote(
	baseOptionLabel: string,
	rawNote: string,
	isEditingNote: boolean,
	maxInlineLabelLength: number,
	wrapPadding = INLINE_NOTE_WRAP_PADDING,
): string[] {
	const inlineLabel = buildOptionLabelWithInlineNote(baseOptionLabel, rawNote, isEditingNote);
	const sanitizedWrapPadding = Number.isFinite(wrapPadding) ? Math.max(0, Math.floor(wrapPadding)) : 0;
	const sanitizedMaxInlineLabelLength = Number.isFinite(maxInlineLabelLength)
		? Math.max(1, Math.floor(maxInlineLabelLength))
		: 1;
	const wrapWidth = Math.max(1, sanitizedMaxInlineLabelLength - sanitizedWrapPadding);
	const wrappedLines = wrapTextWithAnsi(inlineLabel, wrapWidth);
	return wrappedLines.length > 0 ? wrappedLines : [""];
}
