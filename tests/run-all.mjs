#!/usr/bin/env node
/**
 * Test runner for `n8n-nodes-pdf`. Discovers every `tests/**\/*.test.mjs`
 * file, imports it, and runs every `{ name, fn }` entry in its exported
 * `tests` array, tallying pass/fail.
 *
 * `tests/ops/*.test.mjs` drive the REAL BUILT dist artifact (via
 * `tests/load-dist.mjs`) — run `npm run build` first. `tests/shared/*.test.mjs`
 * unit-test pure logic modules directly (via `tests/util/load-ts.mjs`) and
 * don't need a build.
 *
 * Run with: `timeout 300 node tests/run-all.mjs < /dev/null`
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function collectTestFiles(dir) {
	const files = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectTestFiles(full));
		} else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
			files.push(full);
		}
	}
	return files;
}

const testFiles = collectTestFiles(__dirname).sort();

if (testFiles.length === 0) {
	console.error('[run-all] No *.test.mjs files found under tests/.');
	process.exit(1);
}

let totalPassed = 0;
let totalFailed = 0;

for (const file of testFiles) {
	const relPath = path.relative(__dirname, file);
	let mod;
	try {
		mod = await import(`file://${file}`);
	} catch (error) {
		console.error(`[FAIL] ${relPath} (failed to import)`);
		console.error(error);
		totalFailed++;
		continue;
	}

	const fileTests = mod.tests ?? [];
	if (fileTests.length === 0) {
		console.warn(`[run-all] WARNING: ${relPath} exports no tests`);
		continue;
	}

	for (const { name, fn } of fileTests) {
		const label = `${relPath} > ${name}`;
		try {
			await fn();
			console.log(`[PASS] ${label}`);
			totalPassed++;
		} catch (error) {
			console.error(`[FAIL] ${label}`);
			console.error(error);
			totalFailed++;
		}
	}
}

console.log(
	`\n[run-all] ${totalPassed} passed, ${totalFailed} failed, out of ${testFiles.length} test file(s)`,
);
process.exit(totalFailed === 0 ? 0 : 1);
