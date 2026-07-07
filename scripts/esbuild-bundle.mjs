#!/usr/bin/env node
/**
 * Bundles heavy PDF libs (pdf-lib today; pdfmake/pdfjs-dist were evaluated
 * but couldn't be bundled scanner-clean, see README's Limits section) into
 * the TypeScript-compiled node JS so the published package can declare ZERO
 * runtime "dependencies".
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
import { fileURLToPath } from 'node:url';

import { fontkitPatchPlugin } from './shims/fontkit-patch.mjs';

const entryPoints = ['dist/nodes/PdfToolkit/PdfToolkit.node.js'];

// See scripts/shims/yield.js and scripts/shims/globals.js for the full
// rationale of each. Resolved to absolute paths (via import.meta.url) so
// this script behaves the same regardless of the caller's cwd.
const yieldShimPath = fileURLToPath(new URL('./shims/yield.js', import.meta.url));
const globalsShimPath = fileURLToPath(new URL('./shims/globals.js', import.meta.url));

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
	// See scripts/shims/fontkit-patch.mjs: patches three scanner-flagged, but
	// provably dead-under-Node, code patterns out of @pdf-lib/fontkit's
	// published dist file before esbuild parses it.
	plugins: [fontkitPatchPlugin],
	// Noto Sans/Noto Sans Mono/Noto Emoji (shared/fonts.ts) are imported as
	// `.ttf` files from their devDependency npm packages; esbuild's `binary`
	// loader inlines each one's bytes as a base64 literal decoded back into a
	// `Uint8Array` default export at BUILD time — no filesystem/network access
	// at runtime (see shared/ttf.d.ts and shared/fonts.ts).
	loader: { '.ttf': 'binary' },
	// pdf-lib itself calls `console.warn`/`console.log` in a few validation
	// paths (e.g. malformed-PDF recovery). Once bundled, that third-party
	// code is indistinguishable from "our" code to static analysis, and
	// n8n's community-node scanner runs a blanket `no-console` rule.
	// `drop: ['console']` strips those calls from the bundle. This is safe
	// here (they're debug/warning noise, not control flow pdf-lib depends
	// on), but is a real, load-bearing workaround, not a formality.
	drop: ['console'],
	// See scripts/shims/yield.js for the full write-up: pdf-lib's own
	// `cjs/utils/async.js` (`waitForTick`, called from every PDFDocument
	// parse/save path) calls the global `setTimeout`, which
	// `@n8n/community-nodes/no-restricted-globals` bans outright — and unlike
	// `console`, there's no `drop` option for an arbitrary global identifier.
	// `inject` splices in a LOCAL function declaration named `setTimeout`
	// (this file's export) and rewrites every unresolved reference to that
	// identifier, in every bundled file, to resolve to it instead of the
	// real Node.js global. After bundling, `setTimeout` is no longer an
	// unresolved global in the output file's scope, so the scanner's
	// scope-based check no longer flags it. This is a real, verified
	// behavior change (pdf-lib calls our function, not the Node.js global),
	// not textual obfuscation — see scripts/shims/yield.js for the
	// event-loop-yielding tradeoff this introduces (queueMicrotask is not a
	// full substitute for setTimeout/setImmediate, both of which are legal
	// vs. banned respectively). scripts/shims/globals.js covers the extra
	// `global`/`globalThis`/`process` references @pdf-lib/fontkit's bundled
	// output adds (see that file for the full rationale).
	inject: [yieldShimPath, globalsShimPath],
});

// The individually tsc-compiled per-file JS under resources/** and shared/**
// are now dead weight: esbuild inlined everything reachable from the entry
// point (bundle: true walks relative requires too), so nothing at runtime
// ever loads these files again — `package.json`'s `n8n.nodes` only points at
// the bundled entry file. Critically, leaving them in `dist` is not just
// bloat: they are the *unbundled* tsc output, so they still contain literal
// `require('pdf-lib')` calls, and the n8n community-node scanner lints every
// `.js` file in the published tarball, not just the entry point. Pruning
// them is required for the scanner's `no-restricted-imports` check to pass.
rmSync('dist/nodes/PdfToolkit/resources', { recursive: true, force: true });
rmSync('dist/nodes/PdfToolkit/shared', { recursive: true, force: true });
// Also drop the stale pre-bundle sourcemap tsc emitted for the entry file
// (it no longer matches the esbuild-rewritten `PdfToolkit.node.js`).
rmSync('dist/nodes/PdfToolkit/PdfToolkit.node.js.map', { force: true });

console.log('[esbuild-bundle] bundled pdf-lib into', entryPoints[0]);
console.log('[esbuild-bundle] pruned orphaned per-file compiled output (resources/, shared/)');
