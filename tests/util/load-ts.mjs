/**
 * Loads a plain (non-pdf-lib) TypeScript source file from `nodes/PdfToolkit/`
 * for direct unit testing, by transpiling it on the fly with esbuild (already
 * a devDependency — the exact tool `scripts/esbuild-bundle.mjs` uses for the
 * real build) and `require()`-ing the result.
 *
 * This is deliberately NOT how `tests/ops/*.test.mjs` load code: those tests
 * drive the real bundled dist artifact end-to-end (see `tests/load-dist.mjs`).
 * This helper is only for unit-testing small, pure logic modules like
 * `shared/pageRanges.ts` in isolation, without needing a full node build —
 * useful because `scripts/esbuild-bundle.mjs` PRUNES the individually
 * tsc-compiled `dist/nodes/PdfToolkit/shared/**` output after bundling (it's
 * dead weight post-bundle), so there is no standalone compiled artifact for a
 * shared module to require after a full
 * `npm run build`. Only usable for modules with no third-party bundled-lib
 * imports (pageRanges.ts has none — just `n8n-workflow`, which esbuild's
 * `bundle: false` here leaves as a plain `require()` that Node resolves
 * normally from `node_modules`).
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Written INSIDE the repo (not os.tmpdir()) so the transpiled file's
// `require('n8n-workflow')` resolves via Node's normal upward node_modules
// walk from this project — os.tmpdir() has no node_modules ancestor.
// Gitignored (see .gitignore); cleaned up immediately after each require.
const cacheDir = path.join(__dirname, '.ts-cache');
mkdirSync(cacheDir, { recursive: true });

export function requireTs(absoluteTsPath) {
	const result = buildSync({
		entryPoints: [absoluteTsPath],
		bundle: false,
		platform: 'node',
		format: 'cjs',
		target: 'node18',
		write: false,
		logLevel: 'silent',
	});

	const code = result.outputFiles[0].text;
	const tmpFile = path.join(
		cacheDir,
		`${path.basename(absoluteTsPath, '.ts')}-${process.pid}-${Date.now()}-${Math.random()
			.toString(36)
			.slice(2)}.cjs`,
	);
	writeFileSync(tmpFile, code);
	try {
		return require(tmpFile);
	} finally {
		unlinkSync(tmpFile);
	}
}

/** Resolves a path relative to `nodes/PdfToolkit/` into an absolute path. */
export function nodesPdfToolkitPath(...segments) {
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	return path.join(__dirname, '..', '..', 'nodes', 'PdfToolkit', ...segments);
}
