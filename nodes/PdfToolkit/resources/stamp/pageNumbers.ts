import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { loadPdfDocument, savePdfAsBinary } from '../../shared/pdf';
import { resolveStampPosition, type StampPosition } from '../../shared/stampPosition';

export const pageNumbersDescription: INodeProperties[] = [
	binaryPropertyField('stamp', 'pageNumbers'),
	outputOptionsField(
		'stamp',
		'pageNumbers',
		[
			{
				displayName: 'Format',
				name: 'format',
				type: 'string',
				default: 'Page {page} of {pages}',
				description:
					'Format string for the page number label. Use "{page}" for the current page and "{pages}" for the total page count.',
			},
			{
				displayName: 'Start Number',
				name: 'startNumber',
				type: 'number',
				default: 1,
				description: 'Number to use for the first page',
			},
			{
				displayName: 'Font Size',
				name: 'fontSize',
				type: 'number',
				default: 10,
				description: 'Font size (in points) for the page-number label',
			},
			{
				displayName: 'Position',
				name: 'position',
				type: 'options',
				options: [
					{ name: 'Bottom Center', value: 'bottomCenter' },
					{ name: 'Bottom Left', value: 'bottomLeft' },
					{ name: 'Bottom Right', value: 'bottomRight' },
					{ name: 'Top Center', value: 'topCenter' },
					{ name: 'Top Left', value: 'topLeft' },
					{ name: 'Top Right', value: 'topRight' },
				],
				default: 'bottomCenter',
				description: 'Where to place the page number on each page',
			},
		],
		'numbered.pdf',
	),
];

/** Substitutes "{page}"/"{pages}" in the format template (e.g. 'Page {page} of {total}'). */
function formatPageLabel(format: string, page: number, pages: number): string {
	return format.replace(/\{page\}/g, String(page)).replace(/\{pages\}|\{total\}/g, String(pages));
}

// Implemented with pdf-lib: embeds Helvetica once, then `page.drawText()`
// with the formatted page-number label for EVERY page (page numbering
// always applies to the whole document, unlike the watermark ops' optional
// page-range selection).
export async function pageNumbersExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
		format?: string;
		startNumber?: number;
		fontSize?: number;
		position?: StampPosition;
	};

	const format = options.format ?? 'Page {page} of {pages}';
	const startNumber = options.startNumber ?? 1;
	const fontSize = options.fontSize ?? 10;
	const position = options.position ?? 'bottomCenter';

	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const pdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);
	const pages = pdf.getPages();
	const pageCount = pages.length;

	const font = await pdf.embedFont('Helvetica');
	const textHeight = font.heightAtSize(fontSize);

	for (let index = 0; index < pageCount; index++) {
		const page = pages[index];
		const label = formatPageLabel(format, startNumber + index, pageCount);
		const textWidth = font.widthOfTextAtSize(label, fontSize);
		const { width, height } = page.getSize();
		const { x, y } = resolveStampPosition(position, width, height, textWidth, textHeight);
		page.drawText(label, { x, y, size: fontSize, font });
	}

	const outputFileName = options.outputFileName ?? 'numbered.pdf';
	const binaryData = await savePdfAsBinary(this, pdf, outputFileName);

	return {
		json: { pageCount, numberedPageCount: pageCount },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: itemIndex,
	};
}
