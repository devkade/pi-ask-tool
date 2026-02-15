const INLINE_NOTE_SEPARATOR = " — note: ";
const INLINE_EDIT_CURSOR = "▍";

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
	const rawInlineNote = isEditingNote ? `${sanitizedNote}${INLINE_EDIT_CURSOR}` : sanitizedNote.trim();
	const fullInlineLabel = `${labelPrefix}${rawInlineNote}`;

	if (maxInlineLabelLength == null) {
		return fullInlineLabel;
	}

	return isEditingNote
		? truncateTextKeepingTail(fullInlineLabel, maxInlineLabelLength)
		: truncateTextKeepingHead(fullInlineLabel, maxInlineLabelLength);
}
