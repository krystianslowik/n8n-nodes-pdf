/**
 * Unicode text support shared by Generate (`docRenderer.ts`), Stamp > Text
 * Watermark, Stamp > Page Numbers, and Form > Fill Form. Replaces pdf-lib's
 * bundled standard-14 fonts (WinAnsi-only — e.g. `page.drawText('ł', ...)`
 * throws "WinAnsi cannot encode ł") with embedded Noto Sans (Latin/Latin
 * Extended/Cyrillic/Greek), Noto Sans Mono (code blocks), and Noto Emoji
 * (monochrome pictographs, fallback only) via `@pdf-lib/fontkit`.
 *
 * Font files are devDependencies, never runtime `dependencies` — esbuild's
 * `.ttf: binary` loader (`scripts/esbuild-bundle.mjs`) inlines each one into
 * the bundle as a `Uint8Array` at BUILD time, so nothing is read from disk
 * or fetched over the network at runtime. See `ttf.d.ts` for the module
 * declaration tsc needs for a `.ttf` import, and `scripts/shims/globals.js`
 * for the `global`/`globalThis`/`process` shim fontkit's bundled output
 * needs (same mechanism as `scripts/shims/yield.js`, extended to cover the
 * extra globals fontkit references that pdf-lib's own `setTimeout` call did
 * not).
 *
 * Known, documented boundaries (not silently glossed over):
 * - Emoji are drawn MONOCHROME (Noto Emoji has no color glyphs).
 * - ZWJ sequences (e.g. a "family" emoji built from four codepoints joined
 *   by U+200D) render as their component emoji if Noto Emoji has no ligature
 *   glyph for that exact sequence — fontkit's `layout()` degrades gracefully
 *   (no exception), it just returns one glyph per component.
 * - Skin-tone modifiers (U+1F3FB–U+1F3FF) may render as nothing: Noto Emoji
 *   is monochrome by design and largely has no distinct modifier glyphs.
 * - A custom user-supplied font is still not supported (unrelated existing
 *   boundary — see `fromTemplate.ts`'s "Custom Font Binary Property" error).
 */
import type { INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import fontkit from '@pdf-lib/fontkit';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import type { Font as FontkitFont } from '@pdf-lib/fontkit';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import notoSansRegularBytes from '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import notoSansBoldBytes from '@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import notoSansItalicBytes from '@expo-google-fonts/noto-sans/400Regular_Italic/NotoSans_400Regular_Italic.ttf';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import notoSansBoldItalicBytes from '@expo-google-fonts/noto-sans/700Bold_Italic/NotoSans_700Bold_Italic.ttf';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import notoSansMonoBytes from '@expo-google-fonts/noto-sans-mono/400Regular/NotoSansMono_400Regular.ttf';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import notoEmojiBytes from '@expo-google-fonts/noto-emoji/400Regular/NotoEmoji_400Regular.ttf';

import { degrees } from './pdf';
import type { PDFDocument, PDFFont, PDFPage } from './pdf';

export type FontStyle = 'regular' | 'bold' | 'italic' | 'boldItalic' | 'mono';
type Face = FontStyle | 'emoji';

export interface UnicodeFonts {
	regular: PDFFont;
	bold: PDFFont;
	italic: PDFFont;
	boldItalic: PDFFont;
	mono: PDFFont;
	emoji: PDFFont;
}
type CoverageFonts = Record<Face, FontkitFont>;

/** Everything a caller needs to draw/measure Unicode text in one document. */
export interface UnicodeFontBundle {
	fonts: UnicodeFonts;
	coverage: CoverageFonts;
}

/** Face bytes, in the order every `FACES` loop below relies on. */
const FACE_BYTES: Record<Face, Uint8Array> = {
	regular: notoSansRegularBytes,
	bold: notoSansBoldBytes,
	italic: notoSansItalicBytes,
	boldItalic: notoSansBoldItalicBytes,
	mono: notoSansMonoBytes,
	emoji: notoEmojiBytes,
};
const FACES = Object.keys(FACE_BYTES) as Face[];

// `PDFDocument.embedFont()` is not idempotent (calling it twice creates two
// separate embedded font objects/subsets), so every caller within one
// `execute()` call must share the SAME embed — keyed by the `PDFDocument`
// instance (a `WeakMap`, so no document instance is kept alive past its own
// lifetime by this cache outliving the process).
const embedCache = new WeakMap<PDFDocument, Promise<UnicodeFontBundle>>();

// The coverage fonts (a second, independent fontkit parse of the same bytes,
// purely for `hasGlyphForCodePoint()` checks — pdf-lib's `PDFFont` does not
// expose that query itself) are document-INdependent and read-only, so they
// are parsed lazily once per process, not once per document.
let coverageFonts: CoverageFonts | undefined;
function getCoverageFonts(): CoverageFonts {
	if (!coverageFonts) {
		const coverage = {} as CoverageFonts;
		for (const face of FACES) coverage[face] = fontkit.create(FACE_BYTES[face]);
		coverageFonts = coverage;
	}
	return coverageFonts;
}

/**
 * Embeds every Noto face into `pdf` at most once (subsequent calls for the
 * same document reuse the first call's result), with `subset: true` so the
 * saved PDF only carries the glyphs actually used, not the whole font.
 */
export async function embedUnicodeFonts(pdf: PDFDocument): Promise<UnicodeFontBundle> {
	const cached = embedCache.get(pdf);
	if (cached) return cached;

	const promise = (async (): Promise<UnicodeFontBundle> => {
		pdf.registerFontkit(fontkit);
		const embedded = await Promise.all(FACES.map((face) => pdf.embedFont(FACE_BYTES[face], { subset: true })));

		const fonts = {} as UnicodeFonts;
		FACES.forEach((face, index) => {
			fonts[face] = embedded[index];
		});
		return { fonts, coverage: getCoverageFonts() };
	})();

	embedCache.set(pdf, promise);
	return promise;
}

/**
 * A maximal run of codepoints that are Extended_Pictographic, emoji
 * variation selectors (U+FE0E/FE0F), the ZWJ joiner (U+200D), or a
 * Fitzpatrick skin-tone modifier (U+1F3FB–U+1F3FF) is drawn with the emoji
 * font; everything else is drawn with the current text style's Noto Sans
 * (or mono) face. This is a run-level split, not full grapheme-cluster
 * shaping — see this file's doc comment for the ZWJ/skin-tone boundaries
 * that follow from that simplification.
 */
// Written as top-level alternation, not one combined character class: a
// class mixing the ZWJ joiner/variation selectors/skin-tone-modifier RANGE
// with other characters reads to `no-misleading-character-class` as an
// attempt to match a JOINED sequence (base+modifier, char+ZWJ+char) via a
// class — which matches each alternative independently instead, a real
// footgun the rule is right to flag in general. Each branch below is
// intentionally independent (that IS what "maximal run of any of these" is
// supposed to mean), so keeping them as separate alternatives rather than
// one class is both correct and lint-clean.
const EMOJI_RUN = /(?:\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|\u{FE0E}|\u{FE0F}|\u{200D})+/gu;

interface TextRun {
	text: string;
	emoji: boolean;
}

/** Splits `text` into alternating emoji/non-emoji runs, preserving order and every character. */
function segmentEmojiRuns(text: string): TextRun[] {
	if (text.length === 0) return [];
	const runs: TextRun[] = [];
	let lastIndex = 0;
	for (const match of text.matchAll(EMOJI_RUN)) {
		const index = match.index ?? 0;
		if (index > lastIndex) runs.push({ text: text.slice(lastIndex, index), emoji: false });
		runs.push({ text: match[0], emoji: true });
		lastIndex = index + match[0].length;
	}
	if (lastIndex < text.length) runs.push({ text: text.slice(lastIndex), emoji: false });
	return runs;
}

/** U+XXXX rendering of a codepoint, for error messages naming an unsupported character. */
function codePointLabel(codePoint: number): string {
	return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Codepoints allowed to lack their own glyph in an EMOJI run: the ZWJ
 * joiner, the emoji/text variation selectors, and the Fitzpatrick skin-tone
 * modifiers — Noto Emoji handling (or dropping) these as parts of a
 * sequence is the documented graceful degradation (see this file's doc
 * comment), not a missing-glyph error.
 */
function isEmojiSequenceModifier(codePoint: number): boolean {
	return codePoint === 0x200d || codePoint === 0xfe0e || codePoint === 0xfe0f || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff);
}

/** The first codepoint in `text` that `font` has no glyph for, or `undefined` if every one is covered. */
function firstUncoveredCodePoint(font: FontkitFont, text: string, skipEmojiModifiers = false): number | undefined {
	for (const char of text) {
		if (char === '\n' || char === '\r' || char === '\t') continue;
		const codePoint = char.codePointAt(0) ?? 0;
		if (skipEmojiModifiers && isEmojiSequenceModifier(codePoint)) continue;
		if (!font.hasGlyphForCodePoint(codePoint)) return codePoint;
	}
	return undefined;
}

/**
 * Throws a `NodeOperationError` naming the character, the operation, and the
 * item, for the first codepoint in `text` that `font` has no glyph for. For
 * emoji runs, ZWJ/variation-selector/skin-tone codepoints are exempt (see
 * `isEmojiSequenceModifier`); every other codepoint — including a
 * pictograph Noto Emoji simply doesn't have — still fails loudly here
 * rather than silently drawing a blank/`.notdef` glyph.
 */
function assertCoverage(
	font: FontkitFont,
	text: string,
	node: INode,
	opName: string,
	itemIndex: number | undefined,
	isEmojiRun: boolean,
): void {
	const codePoint = firstUncoveredCodePoint(font, text, isEmojiRun);
	if (codePoint !== undefined) {
		const char = String.fromCodePoint(codePoint);
		throw new NodeOperationError(
			node,
			`${opName}: character "${char}" (${codePointLabel(codePoint)}) is not supported by the ` +
				'bundled Unicode fonts',
			itemIndex === undefined ? {} : { itemIndex },
		);
	}
}

/**
 * Like `firstUncoveredCodePoint`, but against one style's face in `bundle`
 * (e.g. `'regular'`, the single face Form > Fill Form's field-appearance
 * regeneration uses — pdf-lib draws one PDF form field's whole appearance
 * with a single font, unlike `drawUnicodeText`'s per-run emoji fallback, so
 * a field value's emoji/uncovered characters can't be silently
 * mixed-font-drawn there; see `fillForm.ts`). Returns the `U+XXXX` label
 * ready to drop into an error message, or `undefined` if fully covered.
 */
export function findUncoveredCodePointLabel(bundle: UnicodeFontBundle, text: string, style: FontStyle): string | undefined {
	const codePoint = firstUncoveredCodePoint(bundle.coverage[style], text);
	return codePoint === undefined ? undefined : codePointLabel(codePoint);
}

/**
 * Total rendered width of `text` at `size`, summing each emoji/non-emoji
 * run's width in its OWN font (an emoji run measures differently in Noto
 * Emoji than the same codepoints would in Noto Sans).
 */
export function measureUnicodeText(bundle: UnicodeFontBundle, text: string, style: FontStyle, size: number): number {
	let width = 0;
	for (const run of segmentEmojiRuns(text)) {
		const font = bundle.fonts[run.emoji ? 'emoji' : style];
		width += font.widthOfTextAtSize(run.text, size);
	}
	return width;
}

export interface DrawUnicodeTextOptions {
	x: number;
	y: number;
	size: number;
	style: FontStyle;
	opacity?: number;
	/** Degrees, same convention as pdf-lib's `drawText({ rotate: degrees(45) })`. */
	rotationDegrees?: number;
}

/**
 * Draws `text` starting at `{x, y}`, segmenting it into emoji/non-emoji runs
 * (see `segmentEmojiRuns`) and drawing each with its own font, advancing
 * along the rotation angle by each run's OWN measured width — so mixed text
 * like "Rocket 🚀 done ✅" lines up correctly even though the emoji runs use
 * a different face. Every run is coverage-checked first (see
 * `assertCoverage`; emoji runs exempt only ZWJ/variation-selector/skin-tone
 * codepoints): a character its run's font has no glyph for throws a clear
 * `NodeOperationError` naming it, instead of silently drawing a
 * blank/`.notdef` glyph (fontkit does not throw on an uncovered codepoint by
 * itself).
 */
export function drawUnicodeText(
	page: PDFPage,
	text: string,
	bundle: UnicodeFontBundle,
	options: DrawUnicodeTextOptions,
	node: INode,
	opName: string,
	itemIndex?: number,
): void {
	const angle = ((options.rotationDegrees ?? 0) * Math.PI) / 180;
	const dxUnit = Math.cos(angle);
	const dyUnit = Math.sin(angle);
	let x = options.x;
	let y = options.y;

	for (const run of segmentEmojiRuns(text)) {
		if (run.text.length === 0) continue;
		const face: Face = run.emoji ? 'emoji' : options.style;
		const font = bundle.fonts[face];
		assertCoverage(bundle.coverage[face], run.text, node, opName, itemIndex, run.emoji);

		page.drawText(run.text, {
			x,
			y,
			size: options.size,
			font,
			opacity: options.opacity,
			rotate: options.rotationDegrees ? degrees(options.rotationDegrees) : undefined,
		});

		const width = font.widthOfTextAtSize(run.text, options.size);
		x += width * dxUnit;
		y += width * dyUnit;
	}
}
