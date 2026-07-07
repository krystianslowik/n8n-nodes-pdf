/**
 * Low-level content-stream inspection for Stamp/Generate resource tests.
 *
 * pdf-lib has no text-EXTRACTION API (it's a manipulation library, not a
 * parser/renderer) — there is no `page.getText()`. What IS honestly
 * verifiable, and what these helpers expose, is the page's raw content
 * stream (the sequence of drawing operators pdf-lib itself writes and can
 * decode, since it authored them): its BYTE LENGTH (so "did stamping add
 * drawing operators to this page" is a real, structural assertion, not a
 * guess), and — via `extractDrawnText` — the actual Unicode text a `Tj`/`TJ`
 * text-showing operator drew.
 *
 * Since `shared/fonts.ts` embeds every text-drawing face as a CUSTOM
 * (fontkit-embedded, Type0/CID-keyed) font, a `Tj`/`TJ` operand's hex bytes
 * are GLYPH IDs assigned by pdf-lib's subset embedder — NOT character codes
 * — so they can't be compared against a known string's hex encoding the way
 * a WinAnsi standard font's single-byte encoding could (see this repo's
 * git history for the pre-Unicode version of this file). `extractDrawnText`
 * instead reverses glyph IDs back to Unicode text using the SAME `ToUnicode`
 * CMap pdf-lib embeds alongside every custom font (a real PDF structure,
 * not a test-only shortcut — see `CustomFontEmbedder.embedUnicodeCmap` in
 * pdf-lib's source), which is a real, honest way to verify what text a
 * custom-font `Tj`/`TJ` call actually drew.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodePDFRawStream, PDFArray, PDFDict, PDFName, PDFStream } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

/**
 * Returns the concatenated, DECODED (un-Flate-compressed) content-stream
 * bytes for one page of an already-loaded `PDFDocument`. Requires the
 * document to have gone through a real `save()` + `load()` round-trip first
 * — a fresh, unsaved `PDFPage`'s "contents" are still an in-memory operator
 * list (`PDFContentStream`), not the serialized `PDFRawStream` this reads.
 */
export function getPageContentBytes(pdf, pageIndex) {
	const page = pdf.getPages()[pageIndex];
	const contents = page.node.Contents();
	if (!contents) return Buffer.alloc(0);

	const items = contents.constructor.name === 'PDFArray' ? contents.asArray() : [contents];
	const chunks = [];
	for (const item of items) {
		const stream = item.constructor.name === 'PDFRef' ? pdf.context.lookup(item) : item;
		chunks.push(Buffer.from(decodePDFRawStream(stream).decode()));
	}
	return Buffer.concat(chunks);
}

/** Same as `getPageContentBytes`, but decoded to a latin1 string for substring searches. */
export function getPageContentText(pdf, pageIndex) {
	return getPageContentBytes(pdf, pageIndex).toString('latin1');
}

/**
 * The hex-string encoding pdf-lib's standard-font text-showing operator uses
 * for a drawn string (e.g. `drawText('AB', ...)` shows up in the content
 * stream as `<4142> Tj`). Uppercase, matching pdf-lib's own output. Only
 * meaningful for a pdf-lib STANDARD font (WinAnsi, one byte per character)
 * — none of this package's operations still use one (see `shared/fonts.ts`)
 * — kept for any future standard-font content, and used internally as the
 * "no ToUnicode CMap" fallback decode in `extractDrawnText` below.
 */
export function textToHexOperand(text) {
	return Buffer.from(text, 'latin1').toString('hex').toUpperCase();
}

/**
 * Minimal PDF content-stream tokenizer — enough to parse what THIS
 * package's own `page.drawText`/`drawImage`/`drawRectangle`/etc. calls
 * produce (not a general-purpose, arbitrary-PDF content-stream parser).
 * Recognizes: `/Name`, `<hex string>`, numbers, `[`/`]` (array delimiters
 * for `TJ`), and bare keywords (operators like `Tf`/`Tj`/`TJ`/`BT`/`ET`).
 * `(...)` literal strings are intentionally NOT supported: every text this
 * package draws goes through a font's `encodeText()`, which always returns
 * a hex string (`PDFHexString`), for both pdf-lib's standard-font encoder
 * and the custom/Type0 encoder `shared/fonts.ts` uses — see
 * `CustomFontEmbedder.encodeText`/`StandardFontEmbedder.encodeText` in
 * pdf-lib's source.
 */
function tokenizeContentStream(text) {
	const tokens = [];
	let i = 0;
	const n = text.length;
	while (i < n) {
		const ch = text[i];
		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		if (ch === '/') {
			let j = i + 1;
			while (j < n && !/[\s/()<>[\]{}%]/.test(text[j])) j++;
			tokens.push({ type: 'name', value: text.slice(i + 1, j) });
			i = j;
			continue;
		}
		if (ch === '<') {
			// PDF hex strings never nest (`<<`/`>>` are dict delimiters, which
			// none of this package's own drawing operators emit inside a Tj/TJ
			// operand position), so a plain search for the closing `>` is exact
			// for content this package generates.
			const close = text.indexOf('>', i + 1);
			const raw = text.slice(i + 1, close);
			tokens.push({ type: 'hex', value: raw.replace(/\s+/g, '') });
			i = close + 1;
			continue;
		}
		if (ch === '[' || ch === ']') {
			tokens.push({ type: ch });
			i++;
			continue;
		}
		if (/[-.\d]/.test(ch)) {
			let j = i + 1;
			while (j < n && /[-.\d]/.test(text[j])) j++;
			tokens.push({ type: 'number', value: text.slice(i, j) });
			i = j;
			continue;
		}
		// Bare keyword/operator (Tf, Tj, TJ, BT, ET, cm, gs, re, Do, rg, q, Q, ...).
		let j = i + 1;
		while (j < n && !/[\s/()<>[\]{}%]/.test(text[j])) j++;
		tokens.push({ type: 'op', value: text.slice(i, j) });
		i = j;
	}
	return tokens;
}

/**
 * Parses a pdf-lib-generated `ToUnicode` CMap stream (always
 * `beginbfchar`/`endbfchar` — see `CMap.js`'s `createCmap` in pdf-lib's
 * source; pdf-lib never emits `beginbfrange`) into a `Map<cid, unicodeText>`.
 */
function parseToUnicodeCMap(cmapText) {
	const map = new Map();
	const bfCharBlock = /beginbfchar([\s\S]*?)endbfchar/g;
	const pairPattern = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
	for (const blockMatch of cmapText.matchAll(bfCharBlock)) {
		for (const pair of blockMatch[1].matchAll(pairPattern)) {
			const cid = parseInt(pair[1], 16);
			const unicodeHex = pair[2];
			const codeUnits = [];
			for (let k = 0; k < unicodeHex.length; k += 4) {
				codeUnits.push(parseInt(unicodeHex.slice(k, k + 4), 16));
			}
			map.set(cid, String.fromCharCode(...codeUnits));
		}
	}
	return map;
}

/**
 * Builds `{ [fontResourceName]: Map<cid, unicodeText> | null }` for every
 * `/Font` resource on one page — `null` for a font with no `ToUnicode`
 * entry (a pdf-lib STANDARD font), signaling `extractDrawnText` to fall
 * back to a plain latin1 byte decode for that font's operands.
 */
function getPageFontUnicodeMaps(pdf, pageIndex) {
	const page = pdf.getPages()[pageIndex];
	const resources = page.node.Resources();
	const fontDict = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
	const maps = {};
	if (!fontDict) return maps;

	for (const name of fontDict.keys()) {
		const fontRef = fontDict.get(name);
		const font = pdf.context.lookup(fontRef, PDFDict);
		const toUnicodeStream = font?.lookupMaybe(PDFName.of('ToUnicode'), PDFStream);
		if (!toUnicodeStream) {
			maps[name.decodeText()] = null;
			continue;
		}
		const cmapText = Buffer.from(decodePDFRawStream(toUnicodeStream).decode()).toString('latin1');
		maps[name.decodeText()] = parseToUnicodeCMap(cmapText);
	}
	return maps;
}

/** Decodes one `Tj`/`TJ` hex operand (an even-length hex string) through `unicodeMap`, or latin1 if `unicodeMap` is `null`. */
function decodeHexOperand(hex, unicodeMap) {
	if (unicodeMap === null) {
		return Buffer.from(hex, 'hex').toString('latin1');
	}
	let out = '';
	for (let k = 0; k < hex.length; k += 4) {
		const cid = parseInt(hex.slice(k, k + 4), 16);
		out += unicodeMap.get(cid) ?? '';
	}
	return out;
}

/**
 * Whether any `/Font` resource on `pageIndex` has a `/BaseFont` name
 * containing `substring` — e.g. `pageHasEmbeddedFontNamed(pdf, 0,
 * 'NotoSans-Regular')` to confirm a Noto Sans subset was really embedded.
 * pdf-lib's default `save()` uses compressed cross-reference/object streams
 * (`useObjectStreams: true`), so a font's `/BaseFont` name (e.g.
 * "ABCDEF+NotoSans-Regular", the random 6-letter subset tag pdf-lib's
 * `addRandomSuffix` prepends) is NOT a plain substring of the raw saved
 * bytes — this reads it back through pdf-lib's own parser instead (which
 * already handles decompressing object streams), the same structural
 * check `docRenderer.ts`/`shared/fonts.ts` rely on being present.
 */
export function pageHasEmbeddedFontNamed(pdf, pageIndex, substring) {
	const page = pdf.getPages()[pageIndex];
	const resources = page.node.Resources();
	const fontDict = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
	if (!fontDict) return false;

	for (const name of fontDict.keys()) {
		const font = pdf.context.lookup(fontDict.get(name), PDFDict);
		const baseFont = font?.lookupMaybe(PDFName.of('BaseFont'), PDFName);
		if (baseFont?.decodeText().includes(substring)) return true;
	}
	return false;
}

/**
 * Codepoints legitimately drawn with an EMPTY glyph outline: whitespace, plus
 * the emoji sequence modifiers `shared/fonts.ts` documents as gracefully
 * degrading (ZWJ, variation selectors, Fitzpatrick skin tones — Noto Emoji
 * has no distinct outlines for them by design).
 */
function isLegitimatelyBlank(unicode) {
	for (const char of unicode) {
		const cp = char.codePointAt(0);
		const isModifier = cp === 0x200d || cp === 0xfe0e || cp === 0xfe0f || (cp >= 0x1f3fb && cp <= 0x1f3ff);
		if (!isModifier && !/\s/.test(char)) return false;
	}
	return true;
}

/**
 * Regression check for the `@pdf-lib/fontkit` TTF-subset corruption patched
 * in `scripts/shims/fontkit-patch.mjs` ("TTFSubset loca-format truncation"):
 * the unpatched subsetter re-derives the `loca` offset format from the
 * SUBSET's byte size, picking the short format (stored offset ÷ 2) without
 * padding glyph records to even lengths — one odd-length glyph record then
 * misaligns the data window of every glyph after it, so the saved font
 * program contains the right NUMBER of glyphs but mostly EMPTY (or
 * undecodable) outlines. `extractDrawnText` cannot catch that (the
 * `ToUnicode` CMap it reads stays intact — the text round-trips even though
 * nothing renders), so this helper instead parses each embedded `FontFile2`
 * font program back with fontkit and checks the OUTLINE of every glyph the
 * page's content stream actually draws (CID == subset glyph ID: pdf-lib
 * writes `CIDToGIDMap: Identity`).
 *
 * Returns `[{ baseFont, cid, unicode }]` for every drawn, non-whitespace,
 * non-emoji-modifier glyph whose embedded outline is empty or fails to
 * decode — `[]` for a healthy document.
 */
export function findBlankDrawnGlyphs(pdf, pageIndex) {
	const page = pdf.getPages()[pageIndex];
	const resources = page.node.Resources();
	const fontDict = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
	if (!fontDict) return [];

	// fontResourceName -> { baseFont, unicodeMap, parsedFont } for every
	// embedded (FontFile2-carrying) Type0 font on the page.
	const fonts = {};
	for (const name of fontDict.keys()) {
		const font = pdf.context.lookup(fontDict.get(name), PDFDict);
		const baseFont = font?.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.decodeText() ?? '?';
		const descendants = font?.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
		if (!descendants || descendants.size() === 0) continue;
		const cidFont = pdf.context.lookup(descendants.get(0), PDFDict);
		const descriptor = cidFont?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
		const fontFile = descriptor?.lookupMaybe(PDFName.of('FontFile2'), PDFStream);
		const toUnicodeStream = font?.lookupMaybe(PDFName.of('ToUnicode'), PDFStream);
		if (!fontFile || !toUnicodeStream) continue;

		const cmapText = Buffer.from(decodePDFRawStream(toUnicodeStream).decode()).toString('latin1');
		fonts[name.decodeText()] = {
			baseFont,
			unicodeMap: parseToUnicodeCMap(cmapText),
			parsedFont: fontkit.create(new Uint8Array(decodePDFRawStream(fontFile).decode())),
		};
	}

	// Walk the content stream once, collecting the set of CIDs each embedded
	// font actually draws (same Tf-tracking approach as `extractDrawnText`).
	const drawnCids = new Map(); // fontResourceName -> Set<cid>
	const tokens = tokenizeContentStream(getPageContentText(pdf, pageIndex));
	let currentFont;
	const pending = [];
	for (const token of tokens) {
		if (token.type !== 'op') {
			pending.push(token);
			continue;
		}
		if (token.value === 'Tf') {
			const nameToken = pending[pending.length - 2];
			if (nameToken?.type === 'name') currentFont = nameToken.value;
		} else if ((token.value === 'Tj' || token.value === 'TJ') && currentFont && fonts[currentFont]) {
			for (const item of pending) {
				if (item.type !== 'hex') continue;
				let cids = drawnCids.get(currentFont);
				if (!cids) drawnCids.set(currentFont, (cids = new Set()));
				for (let k = 0; k < item.value.length; k += 4) cids.add(parseInt(item.value.slice(k, k + 4), 16));
			}
		}
		pending.length = 0;
	}

	const blank = [];
	for (const [resourceName, cids] of drawnCids) {
		const { baseFont, unicodeMap, parsedFont } = fonts[resourceName];
		for (const cid of cids) {
			const unicode = unicodeMap.get(cid) ?? '';
			if (isLegitimatelyBlank(unicode)) continue;
			let hasOutline = false;
			try {
				const glyph = parsedFont.getGlyph(cid);
				hasOutline = glyph.path.commands.length > 0;
			} catch {
				hasOutline = false; // undecodable glyph data = corrupt, same failure
			}
			if (!hasOutline) blank.push({ baseFont, cid, unicode });
		}
	}
	return blank;
}

/**
 * Reconstructs the actual Unicode text drawn by every `Tj`/`TJ` operator on
 * one page, in document order, concatenated with NO separator between calls
 * (each word is its own `Tj` call). `docRenderer.ts`'s `drawLine` draws
 * inter-word space tokens as REAL space glyphs (so text extraction and
 * copy-paste keep the space — see the bug comment there), which is why
 * multi-word phrases from a wrapped-text block DO appear contiguously here.
 * Line breaks from wrapping still concatenate with no separator. Decodes by
 * tracking the active font via `Tf` and reversing glyph IDs through that
 * font's `ToUnicode` CMap (see `getPageFontUnicodeMaps`).
 */
export function extractDrawnText(pdf, pageIndex) {
	const contentText = getPageContentText(pdf, pageIndex);
	const tokens = tokenizeContentStream(contentText);
	const fontMaps = getPageFontUnicodeMaps(pdf, pageIndex);

	let currentMap;
	let result = '';
	const pending = [];
	for (const token of tokens) {
		if (token.type === 'name') {
			pending.push(token);
			continue;
		}
		if (token.type === 'hex' || token.type === 'number' || token.type === '[' || token.type === ']') {
			pending.push(token);
			continue;
		}
		if (token.type === 'op') {
			if (token.value === 'Tf') {
				const nameToken = pending[pending.length - 2];
				if (nameToken?.type === 'name') currentMap = fontMaps[nameToken.value];
			} else if (token.value === 'Tj') {
				const hexToken = pending[pending.length - 1];
				if (hexToken?.type === 'hex') result += decodeHexOperand(hexToken.value, currentMap ?? null);
			} else if (token.value === 'TJ') {
				for (const item of pending) {
					if (item.type === 'hex') result += decodeHexOperand(item.value, currentMap ?? null);
				}
			}
			pending.length = 0;
			continue;
		}
	}
	return result;
}
