import type { INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/**
 * One comma-separated token of a page-range expression (e.g. "1-3,7,9-"),
 * resolved to 0-indexed page numbers against a real document's page count.
 */
export interface PageRangeGroup {
	/** The original token text, e.g. "1-3", "7", or "9-". */
	raw: string;
	/** 0-indexed page numbers this token selects, ascending. */
	pages: number[];
}

// A token is either a single page ("7"), a closed range ("1-3"), or an
// open-ended range ("9-", meaning 9 through the last page).
const RANGE_TOKEN_PATTERN = /^(\d+)(-(\d+)?)?$/;

function pageWord(pageCount: number): string {
	return pageCount === 1 ? 'page' : 'pages';
}

function fail(node: INode, itemIndex: number | undefined, message: string): never {
	throw new NodeOperationError(node, message, itemIndex === undefined ? {} : { itemIndex });
}

/**
 * Parses an expression-friendly page-range string into one group PER
 * comma-separated token, each resolved to 0-indexed page numbers. "9-"
 * is open-ended (9 through the document's last page). Input page numbers
 * are 1-indexed and validated against `pageCount` — the source document's
 * REAL page count, not a guess — so malformed or out-of-range tokens throw a
 * `NodeOperationError` naming the bad token, the full expression, and the
 * document's actual page count.
 *
 * Document > Split emits one output item PER GROUP this returns
 * (batch-aware: splits 1 → N items). Extract Pages / Rotate / Delete
 * Pages instead flatten every group into a single selection — see
 * `parsePageRanges` below, which most callers should use directly.
 */
export function parsePageRangeGroups(
	expression: string,
	pageCount: number,
	node: INode,
	itemIndex?: number,
): PageRangeGroup[] {
	const trimmedExpression = expression.trim();
	if (trimmedExpression.length === 0) {
		fail(
			node,
			itemIndex,
			`Page range expression is empty (document has ${pageCount} ${pageWord(pageCount)})`,
		);
	}

	const tokens = trimmedExpression
		.split(',')
		.map((token) => token.trim())
		.filter((token) => token.length > 0);

	if (tokens.length === 0) {
		fail(node, itemIndex, `Page range expression "${expression}" contains no valid page ranges`);
	}

	return tokens.map((raw) => {
		const match = RANGE_TOKEN_PATTERN.exec(raw);
		if (!match) {
			fail(
				node,
				itemIndex,
				`Invalid page range "${raw}" in "${expression}" — expected a page number (e.g. "7"), ` +
					'a range (e.g. "1-3"), or an open-ended range (e.g. "9-")',
			);
		}

		const [, startText, hasDash, endText] = match;
		const start = Number(startText);
		const end = hasDash ? (endText ? Number(endText) : pageCount) : start;

		if (start < 1 || start > pageCount) {
			fail(
				node,
				itemIndex,
				`Page range "${raw}" in "${expression}" starts at page ${start}, but the document only ` +
					`has ${pageCount} ${pageWord(pageCount)}`,
			);
		}
		if (end > pageCount) {
			fail(
				node,
				itemIndex,
				`Page range "${raw}" in "${expression}" ends at page ${end}, but the document only has ` +
					`${pageCount} ${pageWord(pageCount)}`,
			);
		}
		if (start > end) {
			fail(
				node,
				itemIndex,
				`Invalid page range "${raw}" in "${expression}" — start page ${start} is after end page ${end}`,
			);
		}

		const pages: number[] = [];
		for (let page = start; page <= end; page++) {
			pages.push(page - 1);
		}
		return { raw, pages };
	});
}

/**
 * Same parsing as `parsePageRangeGroups`, flattened into a single,
 * deduplicated, first-occurrence-ordered list of 0-indexed page numbers —
 * what Extract Pages / Rotate / Delete Pages need (one selection, not one
 * output item per token). Overlapping tokens (e.g. "1-3,2-4") are legal: the
 * overlap is simply deduplicated, keeping each page's first-seen position.
 */
export function parsePageRanges(
	expression: string,
	pageCount: number,
	node: INode,
	itemIndex?: number,
): number[] {
	const groups = parsePageRangeGroups(expression, pageCount, node, itemIndex);
	const seen = new Set<number>();
	const pages: number[] = [];
	for (const group of groups) {
		for (const page of group.pages) {
			if (!seen.has(page)) {
				seen.add(page);
				pages.push(page);
			}
		}
	}
	return pages;
}
