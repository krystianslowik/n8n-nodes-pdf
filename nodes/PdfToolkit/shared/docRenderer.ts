/**
 * Shared pdf-lib-based document renderer for the Generate resource (From
 * Template / From Markdown), used AFTER a genuine bundling attempt at
 * `pdfmake` (the PRD's originally-specified engine for this resource) found
 * it architecturally incompatible with this package's scanner-clean /
 * no-filesystem constraints — see spike/FINDINGS.md "Q5 — pdfmake bundling"
 * for the full write-up (pdfkit's built-in standard-14 fonts read AFM metric
 * files off disk via `fs.readFileSync(__dirname + ...)`, and both the
 * Node/pdfkit path and the browser bundle path pull in dozens of
 * `@n8n/community-nodes/no-restricted-globals` violations from `fontkit`/
 * `linebreak`/`js-md5`/the webpack browser build itself — not one isolated,
 * legitimately-shimmable call site the way pdf-lib's single `setTimeout` was,
 * see spike/FINDINGS.md Q2).
 *
 * This is the documented v0 fallback: a deliberately small, pdf-lib-only
 * layout engine covering the block types PRD F3/F9 actually ask for (text,
 * headings, lists, simple tables, code blocks, images, headers/footers with
 * page numbers) — NOT a general-purpose document-layout engine. Known
 * boundaries (documented here rather than silently glossed over):
 * - Only the pdf-lib standard-14 fonts are available (Helvetica/Courier
 *   variants) — no custom/embedded font support (PRD F3's "custom font via
 *   binary input" is deferred with a clear error, see `fromTemplate.ts`).
 * - No nested lists, no cell-spanning tables, no floated/inline images.
 * - Code blocks are drawn line-for-line, unwrapped (preserves whitespace
 *   fidelity; a line wider than the page simply overflows the margin).
 * - Table columns are always equal-width (no content-driven sizing).
 */
import type { INode } from 'n8n-workflow';

import { embedImageAuto, PDFDocument } from './pdf';

export type Alignment = 'left' | 'center' | 'right';

export interface TextRun {
	text: string;
	bold?: boolean;
	italic?: boolean;
	/** Rendered in the monospace font, independent of bold/italic. */
	code?: boolean;
}

/** A block's text content: either plain text, or explicit runs for mixed inline bold/italic/code (e.g. Markdown's `**bold**`). */
export type InlineText = string | TextRun[];

export type DocBlock =
	| { type: 'heading'; level?: 1 | 2 | 3; text: InlineText; alignment?: Alignment }
	| { type: 'paragraph'; text: InlineText; alignment?: Alignment }
	| { type: 'list'; items: InlineText[]; ordered?: boolean }
	| { type: 'table'; headers?: string[]; rows: string[][] }
	| { type: 'code'; text: string }
	| { type: 'image'; buffer: Buffer; width?: number; height?: number }
	| { type: 'pageBreak' };

export interface DocRenderOptions {
	pageSize?: 'a4' | 'letter';
	margins?: { top?: number; bottom?: number; left?: number; right?: number };
	/** Drawn once per page, inside the top margin. Supports "{{page}}"/"{{pages}}" substitution. */
	header?: InlineText;
	/** Drawn once per page, inside the bottom margin. Supports "{{page}}"/"{{pages}}" substitution. */
	footer?: InlineText;
	/** Convenience: if true and no explicit `footer` is given, defaults the footer to "Page {{page}} of {{pages}}". */
	pageNumbers?: boolean;
}

const PAGE_SIZES: Record<'a4' | 'letter', [number, number]> = {
	a4: [595.28, 841.89],
	letter: [612, 792],
};

const DEFAULT_MARGIN = 50;
// Header/footer are drawn INSIDE the default margin whitespace (not an extra
// reserved band), close to the page edge — this only works cleanly with the
// default margins; unusually small custom margins can make header/footer
// overlap content (documented v0 boundary, not guarded against).
const BAND_FROM_EDGE = 24;

async function buildFonts(pdf: PDFDocument) {
	return {
		regular: await pdf.embedFont('Helvetica'),
		bold: await pdf.embedFont('Helvetica-Bold'),
		italic: await pdf.embedFont('Helvetica-Oblique'),
		boldItalic: await pdf.embedFont('Helvetica-BoldOblique'),
		mono: await pdf.embedFont('Courier'),
	};
}
type FontSet = Awaited<ReturnType<typeof buildFonts>>;
type PdfPage = Awaited<ReturnType<PDFDocument['addPage']>>;
type PdfFont = FontSet['regular'];

interface Token {
	text: string;
	font: PdfFont;
	width: number;
}

function isWhitespaceToken(text: string): boolean {
	return /^\s+$/.test(text);
}

function fontFor(run: TextRun, fonts: FontSet, forceBold: boolean): PdfFont {
	if (run.code) return fonts.mono;
	const bold = forceBold || Boolean(run.bold);
	if (bold && run.italic) return fonts.boldItalic;
	if (bold) return fonts.bold;
	if (run.italic) return fonts.italic;
	return fonts.regular;
}

function toRuns(text: InlineText): TextRun[] {
	return typeof text === 'string' ? [{ text }] : text;
}

function tokenize(text: InlineText, fonts: FontSet, fontSize: number, forceBold = false): Token[] {
	const tokens: Token[] = [];
	for (const run of toRuns(text)) {
		const font = fontFor(run, fonts, forceBold);
		// Split into words AND whitespace runs (capturing group keeps both), so
		// wrapping can treat a space as its own breakable token.
		for (const piece of run.text.split(/(\s+)/).filter((p) => p.length > 0)) {
			tokens.push({ text: piece, font, width: font.widthOfTextAtSize(piece, fontSize) });
		}
	}
	return tokens;
}

/** Greedy word-wrap: packs tokens onto lines no wider than `maxWidth`, dropping leading/trailing whitespace tokens per line. */
function wrapTokens(tokens: Token[], maxWidth: number): Token[][] {
	const lines: Token[][] = [];
	let current: Token[] = [];
	let currentWidth = 0;

	const flush = () => {
		while (current.length && isWhitespaceToken(current[current.length - 1].text)) current.pop();
		lines.push(current);
		current = [];
		currentWidth = 0;
	};

	for (const token of tokens) {
		if (current.length === 0 && isWhitespaceToken(token.text)) continue;
		if (current.length > 0 && currentWidth + token.width > maxWidth) {
			flush();
			if (isWhitespaceToken(token.text)) continue;
		}
		current.push(token);
		currentWidth += token.width;
	}
	flush();
	return lines.length > 0 ? lines : [[]];
}

function lineWidth(line: Token[]): number {
	return line.reduce((sum, token) => sum + token.width, 0);
}

/** Per-page/layout mutable cursor state, shared across every block-drawing helper below. */
class Layout {
	pdf: PDFDocument;
	pageWidth: number;
	pageHeight: number;
	marginTop: number;
	marginBottom: number;
	marginLeft: number;
	marginRight: number;
	contentWidth: number;
	page!: PdfPage;
	y = 0;
	pages: PdfPage[] = [];

	constructor(
		pdf: PDFDocument,
		pageWidth: number,
		pageHeight: number,
		margins: { top: number; bottom: number; left: number; right: number },
	) {
		this.pdf = pdf;
		this.pageWidth = pageWidth;
		this.pageHeight = pageHeight;
		this.marginTop = margins.top;
		this.marginBottom = margins.bottom;
		this.marginLeft = margins.left;
		this.marginRight = margins.right;
		this.contentWidth = pageWidth - margins.left - margins.right;
		this.newPage();
	}

	contentTop(): number {
		return this.pageHeight - this.marginTop;
	}

	newPage(): void {
		this.page = this.pdf.addPage([this.pageWidth, this.pageHeight]);
		this.pages.push(this.page);
		this.y = this.contentTop();
	}

	/** Starts a new page first if `height` would not fit above the bottom margin. */
	ensureSpace(height: number): void {
		if (this.y - height < this.marginBottom) {
			this.newPage();
		}
	}
}

/** Draws one already-wrapped line of tokens onto `page` at a fixed `y`, honoring `alignment` within `width`. */
function drawLine(
	page: PdfPage,
	line: Token[],
	fontSize: number,
	x0: number,
	width: number,
	y: number,
	alignment: Alignment,
): void {
	const totalWidth = lineWidth(line);
	let x = x0;
	if (alignment === 'center') x = x0 + (width - totalWidth) / 2;
	else if (alignment === 'right') x = x0 + (width - totalWidth);
	for (const token of line) {
		if (token.text.length > 0 && !isWhitespaceToken(token.text)) {
			page.drawText(token.text, { x, y, size: fontSize, font: token.font });
		}
		x += token.width;
	}
}

/** Wraps and draws `text` starting at the current cursor, advancing `layout.y` by every line drawn plus trailing spacing. */
function drawWrappedText(
	layout: Layout,
	fonts: FontSet,
	text: InlineText,
	fontSize: number,
	options: { alignment?: Alignment; indent?: number; forceBold?: boolean; spacingAfter?: number } = {},
): void {
	const indent = options.indent ?? 0;
	const maxWidth = layout.contentWidth - indent;
	const tokens = tokenize(text, fonts, fontSize, options.forceBold ?? false);
	const lines = wrapTokens(tokens, maxWidth);
	const lineHeight = fontSize * 1.3;

	for (const line of lines) {
		layout.ensureSpace(lineHeight);
		drawLine(layout.page, line, fontSize, layout.marginLeft + indent, maxWidth, layout.y, options.alignment ?? 'left');
		layout.y -= lineHeight;
	}
	layout.y -= options.spacingAfter ?? fontSize * 0.3;
}

const HEADING_FONT_SIZES: Record<1 | 2 | 3, number> = { 1: 22, 2: 17, 3: 14 };

function drawHeading(layout: Layout, fonts: FontSet, block: { level?: 1 | 2 | 3; text: InlineText; alignment?: Alignment }): void {
	const level = block.level ?? 2;
	drawWrappedText(layout, fonts, block.text, HEADING_FONT_SIZES[level], {
		alignment: block.alignment,
		forceBold: true,
		spacingAfter: 10,
	});
}

function drawList(layout: Layout, fonts: FontSet, items: InlineText[], ordered: boolean): void {
	const fontSize = 12;
	const markerWidth = 22;
	items.forEach((item, index) => {
		const marker = ordered ? `${index + 1}.` : '•';
		layout.ensureSpace(fontSize * 1.3);
		layout.page.drawText(marker, { x: layout.marginLeft, y: layout.y, size: fontSize, font: fonts.regular });
		drawWrappedText(layout, fonts, item, fontSize, { indent: markerWidth, spacingAfter: 4 });
	});
	layout.y -= 6;
}

function drawCodeBlock(layout: Layout, fonts: FontSet, text: string): void {
	const fontSize = 10;
	const lineHeight = fontSize * 1.35;
	const padding = 6;
	const lines = text.split('\n');

	layout.ensureSpace(lineHeight + padding);
	const top = layout.y + padding;
	layout.y -= padding;
	for (const line of lines) {
		layout.ensureSpace(lineHeight);
		layout.page.drawText(line, { x: layout.marginLeft + padding, y: layout.y, size: fontSize, font: fonts.mono });
		layout.y -= lineHeight;
	}
	const bottom = layout.y;
	// pdf-lib has no z-order "draw behind" primitive, so an outline (rather
	// than a filled background box drawn UNDER already-drawn text) is what
	// visually distinguishes a code block from surrounding paragraph text.
	layout.page.drawRectangle({
		x: layout.marginLeft,
		y: bottom,
		width: layout.contentWidth,
		height: top - bottom,
		borderWidth: 0.75,
		borderOpacity: 0.4,
	});
	layout.y -= 10;
}

function cellText(value: string | undefined): string {
	return value ?? '';
}

function drawTable(layout: Layout, fonts: FontSet, headers: string[] | undefined, rows: string[][]): void {
	const fontSize = 10;
	const lineHeight = fontSize * 1.25;
	const cellPaddingX = 5;
	const cellPaddingY = 5;
	const columnCount = Math.max(headers?.length ?? 0, ...rows.map((row) => row.length), 1);
	const colWidth = layout.contentWidth / columnCount;

	const wrapCell = (value: string): Token[][] =>
		wrapTokens(tokenize(value, fonts, fontSize), colWidth - 2 * cellPaddingX);

	const drawRow = (cells: string[], bold: boolean): void => {
		const wrappedCells = Array.from({ length: columnCount }, (_, col) => wrapCell(cellText(cells[col])));
		const rowLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
		const rowHeight = rowLines * lineHeight + 2 * cellPaddingY;

		layout.ensureSpace(rowHeight);
		const page = layout.page;
		const rowTop = layout.y;
		const rowBottom = rowTop - rowHeight;

		wrappedCells.forEach((lines, col) => {
			let cy = rowTop - cellPaddingY - fontSize;
			for (const line of lines) {
				let cx = layout.marginLeft + col * colWidth + cellPaddingX;
				for (const token of line) {
					const font = bold ? fonts.bold : token.font;
					page.drawText(token.text, { x: cx, y: cy, size: fontSize, font });
					cx += token.width;
				}
				cy -= lineHeight;
			}
		});

		for (let col = 0; col <= columnCount; col++) {
			const x = layout.marginLeft + col * colWidth;
			page.drawLine({ start: { x, y: rowTop }, end: { x, y: rowBottom }, thickness: 0.5 });
		}
		page.drawLine({
			start: { x: layout.marginLeft, y: rowTop },
			end: { x: layout.marginLeft + layout.contentWidth, y: rowTop },
			thickness: 0.5,
		});

		layout.y = rowBottom;
	};

	if (headers && headers.length > 0) drawRow(headers, true);
	for (const row of rows) drawRow(row, false);
	layout.page.drawLine({
		start: { x: layout.marginLeft, y: layout.y },
		end: { x: layout.marginLeft + layout.contentWidth, y: layout.y },
		thickness: 0.5,
	});
	layout.y -= 10;
}

type EmbeddedImage = Awaited<ReturnType<typeof embedImageAuto>>;

/** Draws `image` at `width`x`height` (defaulting to its natural pixel size), scaled down (aspect-preserved) to fit the remaining content box if it would otherwise overflow the page or content width. */
function drawImage(layout: Layout, image: EmbeddedImage, width?: number, height?: number): void {
	let targetWidth = width ?? image.width;
	let targetHeight = height ?? image.height;
	const maxWidth = layout.contentWidth;
	const maxHeight = layout.contentTop() - layout.marginBottom;
	const scale = Math.min(
		targetWidth > maxWidth ? maxWidth / targetWidth : 1,
		targetHeight > maxHeight ? maxHeight / targetHeight : 1,
	);
	targetWidth *= scale;
	targetHeight *= scale;

	layout.ensureSpace(targetHeight);
	layout.page.drawImage(image, {
		x: layout.marginLeft,
		y: layout.y - targetHeight,
		width: targetWidth,
		height: targetHeight,
	});
	layout.y -= targetHeight + 10;
}

function substituteTokens(text: InlineText, page: number, pages: number): InlineText {
	const replace = (value: string) =>
		value.replace(/\{\{page\}\}/g, String(page)).replace(/\{\{pages\}\}/g, String(pages));
	if (typeof text === 'string') return replace(text);
	return text.map((run) => ({ ...run, text: replace(run.text) }));
}

/**
 * Lays out `blocks` onto pages of `pdf` (mutating it in place — caller
 * `save()`s afterwards) per `options`, and returns the resulting page count.
 * Pure pdf-lib, no filesystem/network access, no restricted globals.
 */
export async function renderDocument(
	pdf: PDFDocument,
	blocks: DocBlock[],
	options: DocRenderOptions,
	node: INode,
): Promise<{ pageCount: number }> {
	const fonts = await buildFonts(pdf);
	const [pageWidth, pageHeight] = PAGE_SIZES[options.pageSize ?? 'a4'];
	const margins = {
		top: options.margins?.top ?? DEFAULT_MARGIN,
		bottom: options.margins?.bottom ?? DEFAULT_MARGIN,
		left: options.margins?.left ?? DEFAULT_MARGIN,
		right: options.margins?.right ?? DEFAULT_MARGIN,
	};
	const layout = new Layout(pdf, pageWidth, pageHeight, margins);

	for (const block of blocks) {
		switch (block.type) {
			case 'heading':
				drawHeading(layout, fonts, block);
				break;
			case 'paragraph':
				drawWrappedText(layout, fonts, block.text, 12, { alignment: block.alignment, spacingAfter: 8 });
				break;
			case 'list':
				drawList(layout, fonts, block.items, block.ordered ?? false);
				break;
			case 'table':
				drawTable(layout, fonts, block.headers, block.rows);
				break;
			case 'code':
				drawCodeBlock(layout, fonts, block.text);
				break;
			case 'image': {
				const image = await embedImageAuto(pdf, block.buffer, node, 'image');
				drawImage(layout, image, block.width, block.height);
				break;
			}
			case 'pageBreak':
				layout.newPage();
				break;
		}
	}

	// Header/footer need the FINAL page count (for "{{pages}}"), so they are
	// drawn in a second pass over every already-created page, not inline
	// during content layout above.
	const footer = options.footer ?? (options.pageNumbers ? 'Page {{page}} of {{pages}}' : undefined);
	const totalPages = layout.pages.length;
	const bandFontSize = 9;
	if (options.header || footer) {
		layout.pages.forEach((page, index) => {
			const pageNumber = index + 1;
			if (options.header) {
				const headerText = substituteTokens(options.header, pageNumber, totalPages);
				const headerLine = wrapTokens(tokenize(headerText, fonts, bandFontSize), layout.contentWidth)[0];
				drawLine(
					page,
					headerLine,
					bandFontSize,
					margins.left,
					layout.contentWidth,
					pageHeight - BAND_FROM_EDGE,
					'left',
				);
			}
			if (footer) {
				const footerText = substituteTokens(footer, pageNumber, totalPages);
				const footerLine = wrapTokens(tokenize(footerText, fonts, bandFontSize), layout.contentWidth)[0];
				drawLine(page, footerLine, bandFontSize, margins.left, layout.contentWidth, BAND_FROM_EDGE, 'center');
			}
		});
	}

	return { pageCount: totalPages };
}
