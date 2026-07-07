#!/usr/bin/env node
/**
 * Local stand-in for the n8n community-node scanner, runnable pre-publish.
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
 *      (`scripts/.analyze-tmp/`, see .gitignore).
 *   2. Unpack the tarball into that same temp dir.
 *   3. Call the scanner's own `analyzePackage()` against the unpacked dir.
 *   4. Print every error the scanner reports and exit 1 if there are any;
 *      exit 0 only on a clean pass.
 *
 * Run with: `npm run scan` (or `timeout 300 node scripts/scan-check.mjs < /dev/null`)
 * Requires `npm run build` to have been run first (dist/ must exist — `npm
 * pack` packs whatever `dist/` currently contains).
 *
 * A "0 errors" result here means the scanner's lint logic passes locally,
 * pre-publish. It is NOT the published-package scanner CLI (which requires
 * an actual npm publish + registry lookup), and it is not human review,
 * malware scanning, or n8n Cloud's post-publish install/allowlist gate — this
 * check narrows the risk of a scanner-blocking issue surfacing after
 * publish, it doesn't eliminate every gate a submission has to pass.
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
		`[scan-check] ${distEntry} not found. Run "npm run build" first (this script packs and lints the actual built dist/, not the TS source).`,
	);
	process.exit(1);
}

const tmpRoot = path.join(repoRoot, 'scripts', '.analyze-tmp');
rmSync(tmpRoot, { recursive: true, force: true });
mkdirSync(tmpRoot, { recursive: true });
const packDestination = mkdtempSync(path.join(tmpRoot, 'pack-'));
const unpackedDir = path.join(tmpRoot, 'unpacked');
mkdirSync(unpackedDir, { recursive: true });

console.log('[scan-check] npm pack...');
const packResult = spawnSync('npm', ['pack', '--json', `--pack-destination=${packDestination}`], {
	cwd: repoRoot,
	stdio: ['ignore', 'pipe', 'inherit'],
	encoding: 'utf-8',
});
if (packResult.status !== 0) {
	console.error('[scan-check] npm pack failed');
	process.exit(1);
}
const [packInfo] = JSON.parse(packResult.stdout);
const tarballPath = path.join(packDestination, packInfo.filename);
console.log(`[scan-check] packed ${packInfo.filename} (${packInfo.size} bytes)`);

console.log(`[scan-check] unpacking into ${unpackedDir}...`);
const tarResult = spawnSync('tar', ['-xzf', tarballPath, '-C', unpackedDir, '--strip-components=1'], {
	stdio: 'inherit',
});
if (tarResult.status !== 0) {
	console.error('[scan-check] tar extraction failed');
	process.exit(1);
}

// Sanity check: fail loudly rather than silently "passing" on an empty dir
// if pack/extract produced nothing (e.g. an empty `files` field).
const unpackedTop = readdirSync(unpackedDir);
if (unpackedTop.length === 0) {
	console.error(`[scan-check] ${unpackedDir} is empty after extraction — nothing to analyze`);
	process.exit(1);
}

console.log('[scan-check] running the scanner\'s analyzePackage() against the unpacked tarball...');
const result = await analyzePackage(unpackedDir);

console.log('\n[scan-check] result:');
console.log(JSON.stringify(result, null, 2));

if (!result.passed) {
	console.error('\n[scan-check] FAILED — scanner reported violations (see "details" above).');
	process.exit(1);
}

console.log('\n[scan-check] PASSED — 0 ESLint violations in the packed tarball.');
console.log(
	'[scan-check] Reminder: this is the scanner\'s local lint check only, not the published-package ' +
		'CLI, human review, or the Cloud install gate.',
);
process.exit(0);
