#!/usr/bin/env node
/**
 * Repro/verification script (branch spike/esbuild-bundling, PRD open
 * question O1 / spike/FINDINGS.md Q2).
 *
 * The real `@n8n/scan-community-package` CLI only accepts a package NAME and
 * always resolves it against the public npm registry (see
 * `scanner/cli.mjs` -> `analyzePackageByName()`) — there is no code path for
 * a local, unpublished tarball, so it cannot be exercised pre-publish. This
 * script runs the exact same static-analysis check the scanner uses
 * (`analyzePackage(packageDir)`, a pure local ESLint pass — no network calls)
 * against our own `npm pack` output, which is the closest thing to a real
 * pre-publish scanner run obtainable without actually publishing.
 *
 * What it does:
 *   1. `npm pack` the package into a git-ignored temp dir inside the repo
 *      (`spike/.analyze-tmp/`, see .gitignore).
 *   2. Unpack the tarball into that same temp dir.
 *   3. Call the scanner's own `analyzePackage()` against the unpacked dir.
 *   4. Print every error the scanner reports and exit 1 if there are any;
 *      exit 0 only on a clean pass.
 *
 * Run with: `timeout 300 node spike/drive-analyze.mjs < /dev/null`
 * Requires `npm run build` to have been run first (dist/ must exist — `npm
 * pack` packs whatever `dist/` currently contains).
 *
 * IMPORTANT — read spike/FINDINGS.md Q2 before treating a "0 errors" result
 * here as "verified": this is the scanner's lint logic, run locally and
 * pre-publish. It is not the published-package scanner CLI (which requires
 * an actual npm publish + registry lookup), and it is not human review,
 * Aikido malware scanning, or n8n Cloud's post-publish install/allowlist
 * gate. See FINDINGS.md's "Verdict" for the full, honest remaining gap.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzePackage } from '@n8n/scan-community-package/scanner/scanner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distEntry = path.join(repoRoot, 'dist', 'nodes', 'PdfToolkit', 'PdfToolkit.node.js');

if (!existsSync(distEntry)) {
	console.error(
		`[drive-analyze] ${distEntry} not found. Run "npm run build" first (this script packs and lints the actual built dist/, not the TS source).`,
	);
	process.exit(1);
}

const tmpRoot = path.join(repoRoot, 'spike', '.analyze-tmp');
rmSync(tmpRoot, { recursive: true, force: true });
mkdirSync(tmpRoot, { recursive: true });
const packDestination = mkdtempSync(path.join(tmpRoot, 'pack-'));
const unpackedDir = path.join(tmpRoot, 'unpacked');
mkdirSync(unpackedDir, { recursive: true });

console.log('[drive-analyze] npm pack...');
const packResult = spawnSync('npm', ['pack', '--json', `--pack-destination=${packDestination}`], {
	cwd: repoRoot,
	stdio: ['ignore', 'pipe', 'inherit'],
	encoding: 'utf-8',
});
if (packResult.status !== 0) {
	console.error('[drive-analyze] npm pack failed');
	process.exit(1);
}
const [packInfo] = JSON.parse(packResult.stdout);
const tarballPath = path.join(packDestination, packInfo.filename);
console.log(`[drive-analyze] packed ${packInfo.filename} (${packInfo.size} bytes)`);

console.log(`[drive-analyze] unpacking into ${unpackedDir}...`);
const tarResult = spawnSync('tar', ['-xzf', tarballPath, '-C', unpackedDir, '--strip-components=1'], {
	stdio: 'inherit',
});
if (tarResult.status !== 0) {
	console.error('[drive-analyze] tar extraction failed');
	process.exit(1);
}

// Sanity check: fail loudly rather than silently "passing" on an empty dir
// if pack/extract produced nothing (e.g. an empty `files` field).
const unpackedTop = readdirSync(unpackedDir);
if (unpackedTop.length === 0) {
	console.error(`[drive-analyze] ${unpackedDir} is empty after extraction — nothing to analyze`);
	process.exit(1);
}

console.log('[drive-analyze] running the scanner\'s analyzePackage() against the unpacked tarball...');
const result = await analyzePackage(unpackedDir);

console.log('\n[drive-analyze] result:');
console.log(JSON.stringify(result, null, 2));

if (!result.passed) {
	console.error('\n[drive-analyze] FAILED — scanner reported violations (see "details" above).');
	process.exit(1);
}

console.log('\n[drive-analyze] PASSED — 0 ESLint violations in the packed tarball.');
console.log(
	'[drive-analyze] Reminder: this is the scanner\'s local lint check only, not the published-package ' +
		'CLI, human review, or the Cloud install gate — see spike/FINDINGS.md Q2 for the honest remaining gap.',
);
process.exit(0);
