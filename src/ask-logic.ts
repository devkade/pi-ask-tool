export const OTHER_OPTION = "Other (type your own)";
export const DONE_SELECTING_OPTION = "✅ Done selecting";
const RECOMMENDED_SUFFIX = " (Recommended)";
const CHECKED_PREFIX = "☑ ";
const UNCHECKED_PREFIX = "☐ ";

export interface AskOption {
	label: string;
}

export interface AskQuestion {
	id: string;
	question: string;
	options: AskOption[];
	multi?: boolean;
	recommended?: number;
}

export interface AskSelection {
	selectedOptions: string[];
	customInput?: string;
}

export interface AskUI {
	select(
		prompt: string,
		options: string[],
		settings?: {
			timeout?: number;
			initialIndex?: number;
			outline?: boolean;
		},
	): Promise<string | undefined>;
	input(prompt: string): Promise<string | undefined>;
}

export function addRecommendedSuffix(labels: string[], recommendedIndex?: number): string[] {
	if (recommendedIndex == null || recommendedIndex < 0 || recommendedIndex >= labels.length) {
		return labels;
	}

	return labels.map((label, index) => {
		if (index === recommendedIndex && !label.endsWith(RECOMMENDED_SUFFIX)) {
			return `${label}${RECOMMENDED_SUFFIX}`;
		}
		return label;
	});
}

export function stripRecommendedSuffix(label: string): string {
	if (!label.endsWith(RECOMMENDED_SUFFIX)) {
		return label;
	}
	return label.slice(0, -RECOMMENDED_SUFFIX.length);
}

export function buildSingleSelection(choiceLabel: string, note?: string): AskSelection {
	const normalizedChoice = stripRecommendedSuffix(choiceLabel);
	const normalizedNote = note?.trim();

	if (normalizedChoice === OTHER_OPTION) {
		if (normalizedNote) {
			return { selectedOptions: [], customInput: normalizedNote };
		}
		return { selectedOptions: [] };
	}

	if (normalizedNote) {
		return { selectedOptions: [`${normalizedChoice} - ${normalizedNote}`] };
	}

	return { selectedOptions: [normalizedChoice] };
}

export function buildMultiSelection(
	optionLabels: string[],
	selectedIndexes: number[],
	notes: string[],
	otherIndex: number,
): AskSelection {
	const selected = new Set(selectedIndexes);
	const selectedOptions: string[] = [];
	let customInput: string | undefined;

	for (let index = 0; index < optionLabels.length; index++) {
		if (!selected.has(index)) continue;
		const label = stripRecommendedSuffix(optionLabels[index]);
		const note = notes[index]?.trim();

		if (index === otherIndex) {
			if (note) customInput = note;
			continue;
		}

		if (note) {
			selectedOptions.push(`${label} - ${note}`);
		} else {
			selectedOptions.push(label);
		}
	}

	if (customInput) {
		return { selectedOptions, customInput };
	}
	return { selectedOptions };
}

function parseCheckboxLabel(label: string): string {
	if (label.startsWith(CHECKED_PREFIX)) {
		return label.slice(CHECKED_PREFIX.length);
	}
	if (label.startsWith(UNCHECKED_PREFIX)) {
		return label.slice(UNCHECKED_PREFIX.length);
	}
	return label;
}

export async function askQuestion(ui: AskUI, q: AskQuestion): Promise<AskSelection> {
	const labels = q.options.map((option) => option.label);
	const selectedOptions: string[] = [];
	let customInput: string | undefined;

	if (q.multi) {
		const selected = new Set<string>();

		while (true) {
			const renderedOptions = labels.map((label) => `${selected.has(label) ? CHECKED_PREFIX : UNCHECKED_PREFIX}${label}`);
			if (selected.size > 0) {
				renderedOptions.push(DONE_SELECTING_OPTION);
			}
			renderedOptions.push(OTHER_OPTION);

			const choice = await ui.select(
				selected.size > 0 ? `(${selected.size} selected) ${q.question}` : q.question,
				renderedOptions,
				{
					initialIndex: q.recommended,
					outline: true,
				},
			);

			if (choice == null || choice === DONE_SELECTING_OPTION) {
				break;
			}

			if (choice === OTHER_OPTION) {
				const input = await ui.input("Enter your response:");
				if (input && input.trim()) {
					customInput = input.trim();
				}
				break;
			}

			const optionLabel = stripRecommendedSuffix(parseCheckboxLabel(choice));
			if (selected.has(optionLabel)) {
				selected.delete(optionLabel);
			} else {
				selected.add(optionLabel);
			}
		}

		selectedOptions.push(...selected);
		return { selectedOptions, customInput };
	}

	const singleOptions = addRecommendedSuffix(labels, q.recommended);
	const choice = await ui.select(q.question, [...singleOptions, OTHER_OPTION], {
		initialIndex: q.recommended,
		outline: true,
	});

	if (choice === OTHER_OPTION) {
		const input = await ui.input("Enter your response:");
		if (input && input.trim()) {
			customInput = input.trim();
		}
	} else if (choice) {
		selectedOptions.push(stripRecommendedSuffix(choice));
	}

	return { selectedOptions, customInput };
}
