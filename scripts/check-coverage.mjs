#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

function readNumberFromEnv(name, fallback) {
	const raw = process.env[name];
	if (raw == null || raw.trim().length === 0) return fallback;
	const parsed = Number(raw);
	if (Number.isNaN(parsed)) {
		throw new Error(`Environment variable ${name} must be a number. Received: ${raw}`);
	}
	return parsed;
}

function ratio(hit, total) {
	if (total <= 0) return 100;
	return (hit / total) * 100;
}

function formatPercent(value) {
	return `${value.toFixed(2)}%`;
}

function parseLcovRecord(block) {
	let file = "";
	let linesFound = 0;
	let linesHit = 0;
	let functionsFound = 0;
	let functionsHit = 0;

	for (const line of block.split(/\r?\n/)) {
		if (line.startsWith("SF:")) file = line.slice(3).trim();
		if (line.startsWith("LF:")) linesFound = Number(line.slice(3).trim());
		if (line.startsWith("LH:")) linesHit = Number(line.slice(3).trim());
		if (line.startsWith("FNF:")) functionsFound = Number(line.slice(4).trim());
		if (line.startsWith("FNH:")) functionsHit = Number(line.slice(4).trim());
	}

	return { file, linesFound, linesHit, functionsFound, functionsHit };
}

const coverageFile = process.env.COVERAGE_FILE ?? "coverage/lcov.info";
if (!existsSync(coverageFile)) {
	console.error(`Coverage file not found: ${coverageFile}`);
	console.error("Run: npm run test:coverage");
	process.exit(1);
}

const lcovRaw = readFileSync(coverageFile, "utf-8");
const records = lcovRaw
	.split("end_of_record")
	.map((block) => block.trim())
	.filter((block) => block.length > 0)
	.map(parseLcovRecord)
	.filter((record) => record.file.length > 0 && record.file.startsWith("src/"));

if (records.length === 0) {
	console.error("No src/* coverage records found in lcov file.");
	process.exit(1);
}

const thresholds = {
	overall: {
		lines: readNumberFromEnv("COVERAGE_MIN_LINES", 38),
		functions: readNumberFromEnv("COVERAGE_MIN_FUNCTIONS", 80),
	},
	files: {
		"src/index.ts": {
			lines: readNumberFromEnv("COVERAGE_MIN_INDEX_LINES", 95),
			functions: readNumberFromEnv("COVERAGE_MIN_INDEX_FUNCTIONS", 100),
		},
		"src/ask-logic.ts": {
			lines: readNumberFromEnv("COVERAGE_MIN_ASK_LOGIC_LINES", 95),
			functions: readNumberFromEnv("COVERAGE_MIN_ASK_LOGIC_FUNCTIONS", 100),
		},
		"src/ask-inline-note.ts": {
			lines: readNumberFromEnv("COVERAGE_MIN_INLINE_NOTE_LINES", 80),
			functions: readNumberFromEnv("COVERAGE_MIN_INLINE_NOTE_FUNCTIONS", 70),
		},
	},
};

const totalLinesFound = records.reduce((sum, r) => sum + r.linesFound, 0);
const totalLinesHit = records.reduce((sum, r) => sum + r.linesHit, 0);
const totalFunctionsFound = records.reduce((sum, r) => sum + r.functionsFound, 0);
const totalFunctionsHit = records.reduce((sum, r) => sum + r.functionsHit, 0);

const overallLinePercent = ratio(totalLinesHit, totalLinesFound);
const overallFunctionPercent = ratio(totalFunctionsHit, totalFunctionsFound);

console.log("Coverage Gate Summary");
console.log(`- overall lines:     ${formatPercent(overallLinePercent)} (min ${thresholds.overall.lines}%)`);
console.log(`- overall functions: ${formatPercent(overallFunctionPercent)} (min ${thresholds.overall.functions}%)`);

const failures = [];
const EPSILON = 1e-9;

if (overallLinePercent + EPSILON < thresholds.overall.lines) {
	failures.push(
		`Overall line coverage ${formatPercent(overallLinePercent)} is below ${thresholds.overall.lines.toFixed(2)}%`,
	);
}
if (overallFunctionPercent + EPSILON < thresholds.overall.functions) {
	failures.push(
		`Overall function coverage ${formatPercent(overallFunctionPercent)} is below ${thresholds.overall.functions.toFixed(2)}%`,
	);
}

for (const [file, min] of Object.entries(thresholds.files)) {
	const record = records.find((entry) => entry.file === file);
	if (!record) {
		failures.push(`Missing coverage record for ${file}`);
		continue;
	}

	const linePercent = ratio(record.linesHit, record.linesFound);
	const functionPercent = ratio(record.functionsHit, record.functionsFound);

	console.log(
		`- ${file}: lines ${formatPercent(linePercent)} (min ${min.lines}%), funcs ${formatPercent(functionPercent)} (min ${min.functions}%)`,
	);

	if (linePercent + EPSILON < min.lines) {
		failures.push(`${file} line coverage ${formatPercent(linePercent)} is below ${min.lines.toFixed(2)}%`);
	}
	if (functionPercent + EPSILON < min.functions) {
		failures.push(`${file} function coverage ${formatPercent(functionPercent)} is below ${min.functions.toFixed(2)}%`);
	}
}

if (failures.length > 0) {
	console.error("\nCoverage gate failed:");
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	process.exit(1);
}

console.log("\nCoverage gate passed.");
