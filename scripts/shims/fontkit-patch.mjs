/**
 * esbuild `onLoad` plugin that patches `@pdf-lib/fontkit`'s published
 * `dist/fontkit.umd.js` (the file its `main` field resolves to, and the one
 * esbuild actually bundles) BEFORE esbuild parses it, removing three
 * scanner-flagged patterns that are all PROVABLY dead code under Node:
 *
 * 1. `function-bind`'s polyfill implementation of `Function.prototype.bind`
 *    builds the bound function via `Function('binder', '...')(binder)` — a
 *    dynamic-code-from-string call, banned outright by
 *    `@n8n/community-nodes/no-dangerous-functions` (same class of risk as
 *    `eval`). It is only ever reached via
 *    `Function.prototype.bind || implementation$1`, and Node has always
 *    shipped native `Function.prototype.bind` — the `||` never falls
 *    through. Patched to build the bound function directly via closure
 *    (`binder` already forwards correctly; only its `.length` arity, which
 *    nothing here depends on, is not reproduced).
 * 2. A browser-typed-array feature-detection guard
 *    (`typeof console.error === 'function'`) around a `console.error(...)`
 *    warning about missing `Uint8Array` subclassing support — Node's
 *    `Uint8Array` always supports this; dead code. Removed entirely.
 * 3. `EventEmitter`'s `emitWarning()` helper
 *    (`typeof console.warn === 'function' ? console.warn(e) : console.log(e)`)
 *    — already a no-op post-bundle (`drop: ['console']` in
 *    `esbuild-bundle.mjs` strips the call expressions), but the `typeof
 *    console.warn`/`console.log` MEMBER EXPRESSIONS themselves survive
 *    `drop` (which only removes call sites) and still trip `no-console`.
 *    Reduced to a true no-op function, matching what `drop` already made
 *    it do at runtime.
 *
 * Each replacement asserts its target text is found EXACTLY once, so a
 * `@pdf-lib/fontkit` version bump that changes this vendored code fails the
 * build loudly instead of silently leaving the pattern unpatched.
 */
import { readFileSync } from 'node:fs';

const PATCHES = [
	{
		label: 'function-bind Function() constructor call',
		find: "bound = Function('binder', 'return function (' + boundArgs.join(',') + '){ return binder.apply(this,arguments); }')(binder);",
		replace: '// [n8n-nodes-pdf patch] no-dangerous-functions: dead code under Node (native Function.prototype.bind always wins the `||` below) — see scripts/shims/fontkit-patch.mjs\n\t  bound = binder;',
	},
	{
		label: 'Buffer TYPED_ARRAY_SUPPORT console.error guard',
		find:
			"\t  if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' && typeof console.error === 'function') {\n" +
			"\t    console.error('This browser lacks typed array (Uint8Array) support which is required by ' + '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.');\n" +
			'\t  }',
		replace:
			'\t  // [n8n-nodes-pdf patch] no-console: dead code under Node (TYPED_ARRAY_SUPPORT is always true) — see scripts/shims/fontkit-patch.mjs',
	},
	{
		label: 'EventEmitter emitWarning console fallback',
		find: "typeof console.warn === 'function' ? console.warn(e) : console.log(e);",
		replace: '/* [n8n-nodes-pdf patch] no-console: already a no-op post-`drop`; see scripts/shims/fontkit-patch.mjs */',
	},
	{
		// This one is a real BUG FIX, not a scanner appeasement:
		// `TTFSubset.encode` leaves `this.loca.version` unset, so
		// `loca.preEncode` re-derives the offset format from the SUBSET's byte
		// size — short format (each offset stored ÷ 2 as uint16) whenever the
		// subset's glyf data is under 128KB, which it almost always is. But
		// `_addGlyph` copies glyph records verbatim with NO even-byte padding
		// (`this.offset += buffer.length`), so records inherit the odd byte
		// lengths modern Noto builds carry (legal in the source font: its own
		// `loca` is LONG format, where offsets are raw uint32). One odd-length
		// record then makes every later offset odd, `offset >>> 1` truncates
		// it, and every glyph after it reads from a misaligned data window —
		// the saved font program has the right glyph COUNT but empty/corrupt
		// OUTLINES (blank text in every renderer: Preview, PDF.js, Chrome).
		// Upstream fontkit fixed this in 2.x by inheriting the SOURCE font's
		// loca version (foliojs/fontkit `TTFSubset.encode`:
		// `this.loca = { offsets: [], version: this.font.loca.version }`) —
		// preset, `preEncode`'s `if (this.version != null) return` keeps the
		// raw byte offsets as uint32, which never truncate. This patch applies
		// exactly that line. Regression test:
		// `tests/ops/fromMarkdown.test.mjs` "every drawn glyph across all six
		// faces has a real outline in the embedded subset".
		label: 'TTFSubset loca-format truncation (subset corruption bug fix)',
		find: '\t    this.glyf = [];\n\t    this.offset = 0;\n\t    this.loca = {\n\t      offsets: []\n\t    };',
		replace:
			'\t    this.glyf = [];\n\t    this.offset = 0;\n' +
			'\t    // [n8n-nodes-pdf patch] inherit the source font\'s loca offset format (upstream fontkit 2.x fix) — see scripts/shims/fontkit-patch.mjs\n' +
			'\t    this.loca = {\n\t      offsets: [],\n\t      version: this.font.loca.version\n\t    };',
	},
];

export const fontkitPatchPlugin = {
	name: 'fontkit-dangerous-patterns-patch',
	setup(build) {
		build.onLoad({ filter: /@pdf-lib[\\/]fontkit[\\/]dist[\\/]fontkit\.umd\.js$/ }, (args) => {
			let contents = readFileSync(args.path, 'utf8');
			for (const { label, find, replace } of PATCHES) {
				const count = contents.split(find).length - 1;
				if (count !== 1) {
					throw new Error(
						`[fontkit-patch] expected exactly one occurrence of "${label}" in ${args.path}, found ${count}. ` +
							'@pdf-lib/fontkit likely changed — update scripts/shims/fontkit-patch.mjs.',
					);
				}
				contents = contents.replace(find, replace);
			}
			return { contents, loader: 'js' };
		});
	},
};
