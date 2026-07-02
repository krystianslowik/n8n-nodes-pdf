/**
 * Low-level content-stream inspection for Stamp resource tests.
 *
 * pdf-lib has no text-EXTRACTION API (it's a manipulation library, not a
 * parser/renderer) — there is no `page.getText()`. What IS honestly
 * verifiable, and what these helpers expose, is the page's raw content
 * stream (the sequence of drawing operators pdf-lib itself writes and can
 * decode, since it authored them): its BYTE LENGTH (so "did stamping add
 * drawing operators to this page" is a real, structural assertion, not a
 * guess), and its decoded operator text, in which a `Tj`/`TJ` text-showing
 * operator's operand is either a literal string `(...)` or, for pdf-lib's
 * standard-font encoding (what every Stamp op here uses), a hex string
 * `<...>` containing the exact bytes of the drawn text. Searching decoded
 * content for the hex encoding of a known marker string is therefore a real
 * (if low-level) check that specific text was drawn — not a text-content
 * assertion in the "read what a human sees" sense, which pdf-lib cannot
 * provide.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodePDFRawStream } = require('pdf-lib');

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
 * stream as `<4142> Tj`). Uppercase, matching pdf-lib's own output.
 */
export function textToHexOperand(text) {
	return Buffer.from(text, 'latin1').toString('hex').toUpperCase();
}
