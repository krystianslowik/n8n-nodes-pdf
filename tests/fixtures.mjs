/**
 * Test-PDF generators, built with the bundled pdf-lib itself (same library
 * the dist build inlines — see `spike/harness.mjs`, which this generalizes).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

/** A plain N-page PDF, each page annotated with a text label. */
export async function makePdf(pageCount, label = 'Doc') {
	const pdf = await PDFDocument.create();
	const font = await pdf.embedFont('Helvetica');
	for (let i = 0; i < pageCount; i++) {
		const page = pdf.addPage([300, 200]);
		page.drawText(`${label} — page ${i + 1}/${pageCount}`, { x: 20, y: 100, size: 12, font });
	}
	return Buffer.from(await pdf.save());
}

/**
 * An N-page PDF where each page has a DIFFERENT width (100 + 10*pageNumber),
 * so a page's original 1-indexed position can be recovered from the output
 * of a page-reordering/deleting operation just by reading back its width —
 * no text-extraction library needed to verify semantics like "page order"
 * or "which pages survived a delete".
 */
export async function makeDistinguishablePdf(pageCount) {
	const pdf = await PDFDocument.create();
	for (let i = 0; i < pageCount; i++) {
		pdf.addPage([100 + (i + 1) * 10, 200]);
	}
	return Buffer.from(await pdf.save());
}

/** Reads back the 1-indexed original page number from a page's width. */
export function pageNumberFromWidth(width) {
	return Math.round((width - 100) / 10);
}
