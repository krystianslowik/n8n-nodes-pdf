import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField, pageRangeField } from '../../shared/descriptions';
import { parsePageRanges } from '../../shared/pageRanges';
import { degrees, loadPdfDocument, savePdfAsBinary } from '../../shared/pdf';

export const rotateDescription: INodeProperties[] = [
	binaryPropertyField('document', 'rotate'),
	{
		...pageRangeField('document', 'rotate', {
			description: 'Pages to rotate (e.g. "1-3,7,9-"), or "all" to rotate every page.',
		}),
		default: 'all',
		required: false,
	},
	{
		displayName: 'Rotation',
		name: 'rotation',
		type: 'options',
		displayOptions: { show: { resource: ['document'], operation: ['rotate'] } },
		options: [
			{ name: '90° Clockwise', value: 90 },
			{ name: '180°', value: 180 },
			{ name: '270° Clockwise', value: 270 },
			{ name: '90° Counter-Clockwise', value: -90 },
		],
		default: 90,
		description: 'Angle to rotate the selected pages by',
	},
	outputOptionsField('document', 'rotate', [], 'rotated.pdf'),
];

function normalizeAngle(angle: number): number {
	return ((angle % 360) + 360) % 360;
}

// Implemented with pdf-lib: "all" (the default) rotates every page;
// otherwise the page-range expression (shared/pageRanges.ts) selects which
// pages get `page.setRotation()`. Rotation is ADDED to each page's existing
// rotation (so rotating an already-90°-rotated page by another 90° yields
// 180°), matching how PDF viewers apply /Rotate.
export async function rotateExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const pageRanges = this.getNodeParameter('pageRanges', itemIndex, 'all') as string;
	const rotation = this.getNodeParameter('rotation', itemIndex, 90) as number;
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
	};

	// Binary presence is already validated by `PdfToolkit.node.ts`'s generic
	// itemwise pre-check (via `documentBinaryInputParamMap`) before this runs.
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const pdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);
	const pageCount = pdf.getPageCount();

	const normalizedRanges = pageRanges.trim().toLowerCase();
	const isAllPages = normalizedRanges.length === 0 || normalizedRanges === 'all';
	const pageIndices = isAllPages
		? Array.from({ length: pageCount }, (_, index) => index)
		: parsePageRanges(pageRanges, pageCount, this.getNode(), itemIndex);

	const pages = pdf.getPages();
	for (const pageIndex of pageIndices) {
		const page = pages[pageIndex];
		const newAngle = normalizeAngle(page.getRotation().angle + rotation);
		page.setRotation(degrees(newAngle));
	}

	const outputFileName = options.outputFileName ?? 'rotated.pdf';
	const binaryData = await savePdfAsBinary(this, pdf, outputFileName);

	return {
		json: { pageCount, rotatedPageCount: pageIndices.length },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: itemIndex,
	};
}
