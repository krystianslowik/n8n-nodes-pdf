/**
 * Loads the REAL, BUILT dist artifact (`dist/nodes/PdfToolkit/PdfToolkit.node.js`
 * — the exact esbuild-bundled output `npm run build` produces), not the TS
 * source. Every `tests/ops/*.test.mjs` file drives this, so tests exercise
 * the exact same artifact that ships and that `scripts/scan-check.mjs`
 * scans.
 *
 * Requires `npm run build` to have already run (`dist/` must exist) — run
 * via `tests/run-all.mjs`, or manually with `npm run build && node
 * tests/run-all.mjs`.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const distEntry = path.join(__dirname, '..', 'dist', 'nodes', 'PdfToolkit', 'PdfToolkit.node.js');

let PdfToolkit;
try {
	({ PdfToolkit } = require(distEntry));
} catch (error) {
	console.error(
		`[tests] Could not load ${distEntry}. Run "npm run build" first (tests exercise the bundled dist output, not the TS source).`,
	);
	throw error;
}

export { PdfToolkit, distEntry };

export function createPdfToolkitInstance() {
	return new PdfToolkit();
}
