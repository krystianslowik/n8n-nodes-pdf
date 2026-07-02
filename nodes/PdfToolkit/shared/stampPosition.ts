/**
 * Shared position vocabulary for the Stamp resource (Text Watermark, Image
 * Watermark, Page Numbers): every stamp op places a piece of content
 * (text or an image) at one of a small set of named anchors on the page,
 * with a fixed margin from the page edge. Centralized here so the three
 * call sites don't each reimplement the same box-anchoring arithmetic.
 */
export type StampPosition =
	| 'topLeft'
	| 'topCenter'
	| 'topRight'
	| 'bottomLeft'
	| 'bottomCenter'
	| 'bottomRight'
	| 'center';

const DEFAULT_MARGIN = 24;

/**
 * Resolves the bottom-left (x, y) origin — the coordinate space pdf-lib's
 * `drawText`/`drawImage`/`drawPage` expect — for placing a `contentWidth` x
 * `contentHeight` box at `position` on a `pageWidth` x `pageHeight` page.
 */
export function resolveStampPosition(
	position: StampPosition,
	pageWidth: number,
	pageHeight: number,
	contentWidth: number,
	contentHeight: number,
	margin = DEFAULT_MARGIN,
): { x: number; y: number } {
	const left = margin;
	const right = pageWidth - margin - contentWidth;
	const centerX = (pageWidth - contentWidth) / 2;
	const top = pageHeight - margin - contentHeight;
	const bottom = margin;
	const centerY = (pageHeight - contentHeight) / 2;

	switch (position) {
		case 'topLeft':
			return { x: left, y: top };
		case 'topCenter':
			return { x: centerX, y: top };
		case 'topRight':
			return { x: right, y: top };
		case 'bottomLeft':
			return { x: left, y: bottom };
		case 'bottomCenter':
			return { x: centerX, y: bottom };
		case 'bottomRight':
			return { x: right, y: bottom };
		case 'center':
		default:
			return { x: centerX, y: centerY };
	}
}
