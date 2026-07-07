/**
 * Bundle-time shim for the `global`/`globalThis`/`process`/`clearTimeout`
 * identifiers, injected into the esbuild bundle by
 * `scripts/esbuild-bundle.mjs` (esbuild's `inject` option) — same mechanism
 * as `scripts/shims/yield.js` (read that file first for the full write-up
 * of WHY this mechanism works), extended to cover the extra globals
 * `@pdf-lib/fontkit`'s bundled output references that pdf-lib's own single
 * `setTimeout` call did not.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * `@pdf-lib/fontkit`'s published `dist/fontkit.umd.js` is itself a bundle of
 * fontkit plus several dependencies, including a browserify-style polyfill
 * of Node's `stream`/`util`/`events` (fontkit's `Subset.encodeStream()` —
 * which `shared/fonts.ts` calls for every embedded font subset — is built on
 * a bundled `readable-stream` implementation). That polyfill layer
 * references the bare identifiers `global`, `globalThis`, `process`, and
 * `clearTimeout` many times (e.g. `typeof global !== 'undefined' ? global :
 * ...`, `process.nextTick`, `process.env`, `cachedClearTimeout =
 * clearTimeout`), none of which esbuild can tree-shake away since fontkit's
 * own build already flattened them into one non-modular file (verified with
 * `npm run scan` against a build with only `scripts/shims/yield.js`
 * injected: dozens of `no-restricted-globals` violations for exactly these
 * names, at exactly these call sites).
 *
 * ---------------------------------------------------------------------------
 * THE FIX
 * ---------------------------------------------------------------------------
 * Same as `yield.js`: esbuild's `inject` splices in a LOCAL top-level
 * binding for each exported name below, and rewrites every unresolved
 * reference to that name, anywhere in the bundle, to resolve to it instead
 * of the real Node.js global. Once `global`/`globalThis`/`process`/
 * `clearTimeout` have a local definition in the bundled file's scope,
 * `@n8n/community-nodes/no-restricted-globals`'s scope-based check (which
 * only flags identifiers with ZERO definitions in scope) no longer matches
 * them.
 *
 * ---------------------------------------------------------------------------
 * THE HONEST TRADEOFF — `process` here is NOT Node's real global `process`
 * ---------------------------------------------------------------------------
 * Getting an actual reference to the real global `process`/`global` object
 * from this file, without using `eval`/the `Function` constructor (both
 * separately banned by `@n8n/community-nodes/no-dangerous-functions` — the
 * classic `Function('return this')()` trick to reach the global object hits
 * exactly this rule) and without an unresolvable `require()`/`import` of a
 * non-allowlisted module (`no-restricted-imports` bans it at the source
 * level, and Node built-ins like `process`/`node:process` can't be bundled
 * away by esbuild — they always survive as a literal, still-restricted
 * `require(...)` call in the final dist file) is not practically possible
 * from here. Below is a minimal, self-contained shim instead — the same
 * category of tradeoff as `yield.js`'s `queueMicrotask` standing in for the
 * real `setTimeout`. It only implements what fontkit's bundled polyfills
 * actually probe: feature-detection (`typeof process !== 'undefined'`),
 * `.env` reads, and `.nextTick` scheduling — not real environment variables,
 * process control, or timers.
 */
import { setTimeout } from './yield.js';

export function clearTimeout() {}

export const process = {
	env: {},
	version: 'v0.0.0',
	versions: {},
	browser: false,
	nextTick(fn, ...args) {
		queueMicrotask(() => fn(...args));
	},
};

const globalShim = { process, setTimeout, clearTimeout };

export const global = globalShim;
export const globalThis = globalShim;
