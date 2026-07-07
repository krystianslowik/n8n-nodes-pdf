/**
 * Shared pdf-lib-based document renderer for the Generate resource (From
 * Template / From Markdown). `pdfmake`, the engine that would normally cover
 * this kind of layout, is architecturally incompatible with this package's
 * scanner-clean / no-filesystem constraints: pdfkit's built-in standard-14
 * fonts read AFM metric files off disk via `fs.readFileSync(__dirname +
 * ...)`, and both the Node/pdfkit path and the browser bundle path pull in
 * dozens of `@n8n/community-nodes/no-restricted-globals` violations from
 * `fontkit`/`linebreak`/`js-md5`/the webpack browser build itself, spread
 * across code we don't control the shape of — not the same situation as
 * THIS package's own, deliberate use of `@pdf-lib/fontkit` (see
 * `shared/fonts.ts`), which is one dependency, embedding fonts we chose, shimmed
 * the same way pdf-lib's single `setTimeout` call already is (see
 * `scripts/shims/yield.js`/`scripts/shims/globals.js`).
 *
 * This is the documented v0 fallback: a deliberately small, pdf-lib-only
 * layout engine covering the block types Generate actually asks for (text,
 * headings, lists, simple tables, code blocks, block quotes, horizontal
 * rules, images, headers/footers with page numbers) — NOT a general-purpose
 * document-layout engine. Known
 * boundaries (documented here rather than silently glossed over):
 * - Text is drawn with the bundled Noto Sans/Noto Sans Mono/Noto Emoji faces
 *   (see `shared/fonts.ts` for language/emoji coverage and its boundaries)
 *   — no custom/embedded font support (a custom font via binary input is
 *   deferred with a clear error, see `fromTemplate.ts`).
 * - No nested lists, no cell-spanning tables, no floated/inline images.
 * - Code blocks are drawn line-for-line, unwrapped (preserves whitespace
 *   fidelity; a line wider than the page simply overflows the margin).
 * - Table columns are always equal-width (no content-driven sizing).
 */
import type { INode } from 'n8n-workflow';

import { drawUnicodeText, embedUnicodeFonts, measureUnicodeText } from './fonts';
import type { FontStyle, UnicodeFontBundle } from './fonts';
import { embedImageAuto, PDFDocument, PDFString, rgb } from './pdf';

export type Alignment = 'left' | 'center' | 'right';

export interface TextRun {
	text: string;
	bold?: boolean;
	italic?: boolean;
	/** Rendered in the monospace font, independent of bold/italic. */
	code?: boolean;
	/** Drawn with a line-through at mid-cap height. */
	strike?: boolean;
	/** Target URL: the run is underlined and covered by a clickable link annotation. */
	link?: string;
}

/** A block's text content: either plain text, or explicit runs for mixed inline bold/italic/code (e.g. Markdown's `**bold**`). */
export type InlineText = string | TextRun[];

export type DocBlock =
	| { type: 'heading'; level?: 1 | 2 | 3; text: InlineText; alignment?: Alignment }
	| { type: 'paragraph'; text: InlineText; alignment?: Alignment }
	| { type: 'quote'; text: InlineText }
	| { type: 'list'; items: InlineText[]; ordered?: boolean }
	| { type: 'table'; headers?: string[]; rows: string[][] }
	| { type: 'code'; text: string }
	| { type: 'hr' }
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

type PdfPage = Awaited<ReturnType<PDFDocument['addPage']>>;

/** Everything a single `renderDocument()` call threads through every drawing helper below. */
interface RenderContext {
	bundle: UnicodeFontBundle;
	node: INode;
	itemIndex: number;
	opName: string;
}

interface Token {
	text: string;
	style: FontStyle;
	width: number;
	strike?: boolean;
	link?: string;
}

// Consistent bottom margin every block type leaves before the next block, so
// no block's trailing spacing depends on which block type happens to follow.
const BLOCK_SPACING = 10;

function isWhitespaceToken(text: string): boolean {
	return /^\s+$/.test(text);
}

function styleFor(run: TextRun, forceBold: boolean): FontStyle {
	if (run.code) return 'mono';
	const bold = forceBold || Boolean(run.bold);
	if (bold && run.italic) return 'boldItalic';
	if (bold) return 'bold';
	if (run.italic) return 'italic';
	return 'regular';
}

function toRuns(text: InlineText): TextRun[] {
	return typeof text === 'string' ? [{ text }] : text;
}

function tokenize(text: InlineText, ctx: RenderContext, fontSize: number, forceBold = false): Token[] {
	const tokens: Token[] = [];
	for (const run of toRuns(text)) {
		const style = styleFor(run, forceBold);
		// Split into words AND whitespace runs (capturing group keeps both), so
		// wrapping can treat a space as its own breakable token.
		for (const piece of run.text.split(/(\s+)/).filter((p) => p.length > 0)) {
			tokens.push({
				text: piece,
				style,
				width: measureUnicodeText(ctx.bundle, piece, style, fontSize),
				strike: run.strike,
				link: run.link,
			});
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

/** Registers a clickable URI link annotation covering the `width` x line-height box whose baseline starts at `{x, y}`. */
function addLinkAnnotation(page: PdfPage, url: string, x: number, y: number, width: number, fontSize: number): void {
	const context = page.doc.context;
	const annotation = context.obj({
		Type: 'Annot',
		Subtype: 'Link',
		Rect: [x, y - fontSize * 0.25, x + width, y + fontSize],
		Border: [0, 0, 0],
		A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
	});
	page.node.addAnnot(context.register(annotation));
}

/** Draws one already-wrapped line of tokens onto `page` at a fixed baseline `y`, honoring `alignment` within `width`. */
function drawLine(
	page: PdfPage,
	line: Token[],
	fontSize: number,
	x0: number,
	width: number,
	y: number,
	alignment: Alignment,
	ctx: RenderContext,
): void {
	const totalWidth = lineWidth(line);
	let x = x0;
	if (alignment === 'center') x = x0 + (width - totalWidth) / 2;
	else if (alignment === 'right') x = x0 + (width - totalWidth);
	for (const token of line) {
		// Space tokens are drawn too (not skipped as pure positioning): a space
		// glyph must exist in the content stream, or text extraction/copy-paste
		// joins the neighboring words ("Tuesday,for"). Tabs etc. stay position-only.
		if (token.text.length > 0 && (!isWhitespaceToken(token.text) || /^[ \u00A0]+$/.test(token.text))) {
			drawUnicodeText(
				page,
				token.text,
				ctx.bundle,
				{ x, y, size: fontSize, style: token.style },
				ctx.node,
				ctx.opName,
				ctx.itemIndex,
			);
		}
		if (token.strike) {
			page.drawLine({
				start: { x, y: y + fontSize * 0.3 },
				end: { x: x + token.width, y: y + fontSize * 0.3 },
				thickness: Math.max(0.5, fontSize * 0.05),
			});
		}
		if (token.link) {
			page.drawLine({
				start: { x, y: y - 1.5 },
				end: { x: x + token.width, y: y - 1.5 },
				thickness: 0.5,
			});
			addLinkAnnotation(page, token.link, x, y, token.width, fontSize);
		}
		x += token.width;
	}
}

/** Wraps and draws `text` starting at the current cursor, advancing `layout.y` by every line drawn plus trailing spacing. */
function drawWrappedText(
	layout: Layout,
	ctx: RenderContext,
	text: InlineText,
	fontSize: number,
	options: { alignment?: Alignment; indent?: number; forceBold?: boolean; spacingAfter?: number } = {},
): void {
	const indent = options.indent ?? 0;
	const maxWidth = layout.contentWidth - indent;
	const tokens = tokenize(text, ctx, fontSize, options.forceBold ?? false);
	const lines = wrapTokens(tokens, maxWidth);
	const lineHeight = fontSize * 1.3;

	for (const line of lines) {
		layout.ensureSpace(lineHeight);
		// `layout.y` is the TOP of the line box; the baseline sits `fontSize`
		// below it, so ascenders never reach up into the previous block.
		drawLine(
			layout.page,
			line,
			fontSize,
			layout.marginLeft + indent,
			maxWidth,
			layout.y - fontSize,
			options.alignment ?? 'left',
			ctx,
		);
		layout.y -= lineHeight;
	}
	layout.y -= options.spacingAfter ?? fontSize * 0.3;
}

const HEADING_FONT_SIZES: Record<1 | 2 | 3, number> = { 1: 22, 2: 17, 3: 14 };

function drawHeading(
	layout: Layout,
	ctx: RenderContext,
	block: { level?: 1 | 2 | 3; text: InlineText; alignment?: Alignment },
): void {
	const level = block.level ?? 2;
	drawWrappedText(layout, ctx, block.text, HEADING_FONT_SIZES[level], {
		alignment: block.alignment,
		forceBold: true,
		spacingAfter: BLOCK_SPACING,
	});
}

function drawList(layout: Layout, ctx: RenderContext, items: InlineText[], ordered: boolean): void {
	const fontSize = 12;
	const markerWidth = 22;
	items.forEach((item, index) => {
		const marker = ordered ? `${index + 1}.` : '•';
		layout.ensureSpace(fontSize * 1.3);
		// Marker baseline matches drawWrappedText's first-line baseline (top - fontSize).
		drawUnicodeText(
			layout.page,
			marker,
			ctx.bundle,
			{ x: layout.marginLeft, y: layout.y - fontSize, size: fontSize, style: 'regular' },
			ctx.node,
			ctx.opName,
			ctx.itemIndex,
		);
		drawWrappedText(layout, ctx, item, fontSize, { indent: markerWidth, spacingAfter: 4 });
	});
	layout.y -= BLOCK_SPACING - 4;
}

function drawCodeBlock(layout: Layout, ctx: RenderContext, text: string): void {
	const fontSize = 10;
	const lineHeight = fontSize * 1.35;
	const padding = 6;
	const lines = text.split('\n');

	// pdf-lib paints operators in call order, so the light-gray background box
	// must be drawn BEFORE its text — which requires knowing per page how many
	// lines fit up front (one box per page segment for a block that breaks).
	let index = 0;
	while (index < lines.length) {
		layout.ensureSpace(lineHeight + 2 * padding);
		const available = layout.y - layout.marginBottom - 2 * padding;
		const fit = Math.max(1, Math.min(lines.length - index, Math.floor(available / lineHeight)));
		const boxHeight = fit * lineHeight + 2 * padding;

		layout.page.drawRectangle({
			x: layout.marginLeft,
			y: layout.y - boxHeight,
			width: layout.contentWidth,
			height: boxHeight,
			color: rgb(0.95, 0.95, 0.95),
			borderColor: rgb(0.8, 0.8, 0.8),
			borderWidth: 0.75,
		});

		let baseline = layout.y - padding - fontSize;
		for (const line of lines.slice(index, index + fit)) {
			drawUnicodeText(
				layout.page,
				line,
				ctx.bundle,
				{ x: layout.marginLeft + padding, y: baseline, size: fontSize, style: 'mono' },
				ctx.node,
				ctx.opName,
				ctx.itemIndex,
			);
			baseline -= lineHeight;
		}
		layout.y -= boxHeight;
		index += fit;
	}
	layout.y -= BLOCK_SPACING;
}

function drawQuote(layout: Layout, ctx: RenderContext, text: InlineText): void {
	const fontSize = 12;
	const indent = 14;
	const startPage = layout.page;
	const top = layout.y - 1;
	drawWrappedText(layout, ctx, text, fontSize, { indent, spacingAfter: 0 });
	const bottom = layout.y + 2;
	// Vertical quote rule. If the quote broke across pages, `top` belongs to a
	// previous page — clamp the rule to the final page's content area.
	const ruleTop = layout.page === startPage ? top : layout.contentTop();
	layout.page.drawLine({
		start: { x: layout.marginLeft + 3, y: ruleTop },
		end: { x: layout.marginLeft + 3, y: bottom },
		thickness: 2,
		color: rgb(0.75, 0.75, 0.75),
	});
	layout.y -= BLOCK_SPACING;
}

function drawHorizontalRule(layout: Layout): void {
	const ruleSpacing = 8;
	layout.ensureSpace(2 * ruleSpacing);
	layout.y -= ruleSpacing;
	layout.page.drawLine({
		start: { x: layout.marginLeft, y: layout.y },
		end: { x: layout.marginLeft + layout.contentWidth, y: layout.y },
		thickness: 0.75,
		color: rgb(0.6, 0.6, 0.6),
	});
	layout.y -= BLOCK_SPACING;
}

function cellText(value: string | undefined): string {
	return value ?? '';
}

function drawTable(layout: Layout, ctx: RenderContext, headers: string[] | undefined, rows: string[][]): void {
	const fontSize = 10;
	const lineHeight = fontSize * 1.25;
	const cellPaddingX = 5;
	const cellPaddingY = 5;
	const columnCount = Math.max(headers?.length ?? 0, ...rows.map((row) => row.length), 1);
	const colWidth = layout.contentWidth / columnCount;

	const wrapCell = (value: string): Token[][] =>
		wrapTokens(tokenize(value, ctx, fontSize), colWidth - 2 * cellPaddingX);

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
					const style = bold ? 'bold' : token.style;
					drawUnicodeText(
						page,
						token.text,
						ctx.bundle,
						{ x: cx, y: cy, size: fontSize, style },
						ctx.node,
						ctx.opName,
						ctx.itemIndex,
					);
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
	layout.y -= BLOCK_SPACING;
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
	layout.y -= targetHeight + BLOCK_SPACING;
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
 * Pure pdf-lib + `@pdf-lib/fontkit`, no filesystem/network access, no
 * restricted globals (see `shared/fonts.ts`). `opName` and `itemIndex` are
 * only used to name the operation/item in a missing-glyph
 * `NodeOperationError` (see `shared/fonts.ts`'s `assertCoverage`).
 */
export async function renderDocument(
	pdf: PDFDocument,
	blocks: DocBlock[],
	options: DocRenderOptions,
	node: INode,
	opName: string,
	itemIndex: number,
): Promise<{ pageCount: number }> {
	const bundle = await embedUnicodeFonts(pdf);
	const ctx: RenderContext = { bundle, node, itemIndex, opName };
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
				drawHeading(layout, ctx, block);
				break;
			case 'paragraph':
				drawWrappedText(layout, ctx, block.text, 12, {
					alignment: block.alignment,
					spacingAfter: BLOCK_SPACING,
				});
				break;
			case 'quote':
				drawQuote(layout, ctx, block.text);
				break;
			case 'list':
				drawList(layout, ctx, block.items, block.ordered ?? false);
				break;
			case 'table':
				drawTable(layout, ctx, block.headers, block.rows);
				break;
			case 'code':
				drawCodeBlock(layout, ctx, block.text);
				break;
			case 'hr':
				drawHorizontalRule(layout);
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
				const headerLine = wrapTokens(tokenize(headerText, ctx, bandFontSize), layout.contentWidth)[0];
				drawLine(
					page,
					headerLine,
					bandFontSize,
					margins.left,
					layout.contentWidth,
					pageHeight - BAND_FROM_EDGE,
					'left',
					ctx,
				);
			}
			if (footer) {
				const footerText = substituteTokens(footer, pageNumber, totalPages);
				const footerLine = wrapTokens(tokenize(footerText, ctx, bandFontSize), layout.contentWidth)[0];
				drawLine(
					page,
					footerLine,
					bandFontSize,
					margins.left,
					layout.contentWidth,
					BAND_FROM_EDGE,
					'center',
					ctx,
				);
			}
		});
	}

	return { pageCount: totalPages };
}
