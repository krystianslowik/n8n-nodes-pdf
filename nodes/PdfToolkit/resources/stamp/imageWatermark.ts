import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField, pageRangeField } from '../../shared/descriptions';
import { parsePageRanges } from '../../shared/pageRanges';
import {
	assertBinarySizeWithinLimit,
	embedImageAuto,
	loadPdfDocument,
	savePdfAsBinary,
} from '../../shared/pdf';
import { resolveStampPosition, type StampPosition } from '../../shared/stampPosition';

const showOnlyForImageWatermark = { resource: ['stamp'], operation: ['imageWatermark'] };

export const imageWatermarkDescription: INodeProperties[] = [
	binaryPropertyField('stamp', 'imageWatermark'),
	{
		displayName: 'Image Binary Property',
		name: 'imageBinaryPropertyName',
		type: 'string',
		default: 'image',
		required: true,
		displayOptions: { show: showOnlyForImageWatermark },
		description: 'Name of the input binary field that contains the watermark image (JPEG/PNG)',
	},
	{
		...pageRangeField('stamp', 'imageWatermark', {
			description:
				'Pages to stamp (e.g. "1-3,7,9-"), or "all" to stamp every page.',
		}),
		default: 'all',
		required: false,
	},
	outputOptionsField(
		'stamp',
		'imageWatermark',
		[
			{
				displayName: 'Opacity',
				name: 'opacity',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.3,
				description: 'Opacity of the watermark, from 0 (invisible) to 1 (opaque)',
			},
			{
				displayName: 'Scale (%)',
				name: 'scale',
				type: 'number',
				default: 50,
				description: 'Size of the watermark image relative to the page, in percent',
			},
			{
				displayName: 'Position',
				name: 'position',
				type: 'options',
				options: [
					{ name: 'Bottom Left', value: 'bottomLeft' },
					{ name: 'Bottom Right', value: 'bottomRight' },
					{ name: 'Center', value: 'center' },
					{ name: 'Top Left', value: 'topLeft' },
					{ name: 'Top Right', value: 'topRight' },
				],
				default: 'center',
				description: 'Where to place the watermark on each page',
			},
		],
		'watermarked.pdf',
	),
];

// Implemented with pdf-lib: `embedPng`/`embedJpg` (sniffed by signature, via
// the shared `embedImageAuto` helper) once,
// then `page.drawImage()` with opacity/scale for every page selected by the
// page-range expression (default "all").
export async function imageWatermarkExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const imageBinaryPropertyName = this.getNodeParameter(
		'imageBinaryPropertyName',
		itemIndex,
		'image',
	) as string;
	const pageRanges = this.getNodeParameter('pageRanges', itemIndex, 'all') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
		opacity?: number;
		scale?: number;
		position?: StampPosition;
	};

	const opacity = options.opacity ?? 0.3;
	const scalePercent = options.scale ?? 50;
	const position = options.position ?? 'center';

	this.helpers.assertBinaryData(itemIndex, imageBinaryPropertyName);
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const pdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);
	const pageCount = pdf.getPageCount();

	const normalizedRanges = pageRanges.trim().toLowerCase();
	const isAllPages = normalizedRanges.length === 0 || normalizedRanges === 'all';
	const pageIndices = isAllPages
		? Array.from({ length: pageCount }, (_, index) => index)
		: parsePageRanges(pageRanges, pageCount, this.getNode(), itemIndex);

	const imageBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, imageBinaryPropertyName);
	assertBinarySizeWithinLimit(imageBuffer, this.getNode(), imageBinaryPropertyName, itemIndex);
	const image = await embedImageAuto(
		pdf,
		imageBuffer,
		this.getNode(),
		imageBinaryPropertyName,
		itemIndex,
	);

	const pages = pdf.getPages();
	for (const pageIndex of pageIndices) {
		const page = pages[pageIndex];
		const { width: pageWidth, height: pageHeight } = page.getSize();
		const maxWidth = pageWidth * (scalePercent / 100);
		const maxHeight = pageHeight * (scalePercent / 100);
		const { width, height } = image.scaleToFit(maxWidth, maxHeight);
		const { x, y } = resolveStampPosition(position, pageWidth, pageHeight, width, height);
		page.drawImage(image, { x, y, width, height, opacity });
	}

	const outputFileName = options.outputFileName ?? 'watermarked.pdf';
	const binaryData = await savePdfAsBinary(this, pdf, outputFileName);

	return {
		json: { pageCount, stampedPageCount: pageIndices.length },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: itemIndex,
	};
}
