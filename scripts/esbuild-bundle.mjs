#!/usr/bin/env node
/**
 * Spike (branch spike/esbuild-bundling) — bundles heavy PDF libs (pdf-lib,
 * later pdfmake/pdfjs-dist) into the TypeScript-compiled node JS so the
 * published package can declare ZERO runtime "dependencies" (PRD open
 * question O1 / .agents "no runtime dependencies" verification rule).
 *
 * Runs AFTER `n8n-node build` (which does the TypeScript compile into
 * `dist/`). This step rewrites the compiled node entry file in place,
 * inlining every reachable `require()` (including third-party npm packages
 * like `pdf-lib`) except `n8n-workflow`, which n8n's runtime always provides
 * and which the community-node verification rules require to stay a
 * peerDependency, not bundled.
 */
import { build } from 'esbuild';
import { existsSync, rmSync } from 'node:fs';

const entryPoints = ['dist/nodes/PdfToolkit/PdfToolkit.node.js'];

for (const entry of entryPoints) {
	if (!existsSync(entry)) {
		console.error(`[esbuild-bundle] entry point not found: ${entry} (did the TypeScript build run first?)`);
		process.exit(1);
	}
}

await build({
	entryPoints,
	bundle: true,
	platform: 'node',
	target: 'node18',
	format: 'cjs',
	external: ['n8n-workflow'],
	outfile: entryPoints[0],
	allowOverwrite: true,
	sourcemap: false,
	logLevel: 'info',
	// SPIKE FINDING: pdf-lib itself calls `console.warn`/`console.log` in a
	// few validation paths (e.g. malformed-PDF recovery). Once bundled, that
	// third-party code is indistinguishable from "our" code to static
	// analysis, and n8n's community-node scanner runs a blanket `no-console`
	// rule (see spike/FINDINGS.md Q1/Q2). `drop: ['console']` strips those
	// calls from the bundle. This is safe here (they're debug/warning noise,
	// not control flow pdf-lib depends on), but is a real, load-bearing
	// workaround, not a formality.
	drop: ['console'],
});

// The individually tsc-compiled per-file JS under resources/** and shared/**
// are now dead weight: esbuild inlined everything reachable from the entry
// point (bundle: true walks relative requires too), so nothing at runtime
// ever loads these files again — `package.json`'s `n8n.nodes` only points at
// the bundled entry file. Critically, leaving them in `dist` is not just
// bloat: they are the *unbundled* tsc output, so they still contain literal
// `require('pdf-lib')` calls, and the n8n community-node scanner lints every
// `.js` file in the published tarball, not just the entry point. Pruning
// them is required for the scanner's `no-restricted-imports` check to pass
// (see spike/FINDINGS.md Q1/Q2).
rmSync('dist/nodes/PdfToolkit/resources', { recursive: true, force: true });
rmSync('dist/nodes/PdfToolkit/shared', { recursive: true, force: true });
// Also drop the stale pre-bundle sourcemap tsc emitted for the entry file
// (it no longer matches the esbuild-rewritten `PdfToolkit.node.js`).
rmSync('dist/nodes/PdfToolkit/PdfToolkit.node.js.map', { force: true });

console.log('[esbuild-bundle] bundled pdf-lib into', entryPoints[0]);
console.log('[esbuild-bundle] pruned orphaned per-file compiled output (resources/, shared/)');
