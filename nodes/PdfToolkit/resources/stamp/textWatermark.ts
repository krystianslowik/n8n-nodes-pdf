import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField, pageRangeField } from '../../shared/descriptions';
import { drawUnicodeText, embedUnicodeFonts, measureUnicodeText } from '../../shared/fonts';
import { parsePageRanges } from '../../shared/pageRanges';
import { loadPdfDocument, savePdfAsBinary } from '../../shared/pdf';
import { resolveStampPosition, type StampPosition } from '../../shared/stampPosition';

const showOnlyForTextWatermark = { resource: ['stamp'], operation: ['textWatermark'] };

export const textWatermarkDescription: INodeProperties[] = [
	binaryPropertyField('stamp', 'textWatermark'),
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnlyForTextWatermark },
		description: 'Watermark text to stamp onto every selected page',
	},
	{
		...pageRangeField('stamp', 'textWatermark', {
			description:
				'Pages to stamp (e.g. "1-3,7,9-"), or "all" to stamp every page.',
		}),
		default: 'all',
		required: false,
	},
	outputOptionsField(
		'stamp',
		'textWatermark',
		[
			{
				displayName: 'Font Size',
				name: 'fontSize',
				type: 'number',
				default: 48,
				description: 'Font size (in points) for the watermark text',
			},
			{
				displayName: 'Opacity',
				name: 'opacity',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.3,
				description: 'Opacity of the watermark, from 0 (invisible) to 1 (opaque)',
			},
			{
				displayName: 'Rotation (Degrees)',
				name: 'rotation',
				type: 'number',
				default: 45,
				description: 'Rotation of the watermark text, in degrees',
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

// Implemented with pdf-lib + `@pdf-lib/fontkit`: embeds the bundled Noto
// Sans face once (see `shared/fonts.ts` for language/emoji coverage), then
// draws it (segmented into emoji/non-emoji runs) with rotation/opacity for
// every page selected by the page-range expression (default "all" — same
// convention as Document > Rotate).
export async function textWatermarkExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const text = this.getNodeParameter('text', itemIndex, '') as string;
	const pageRanges = this.getNodeParameter('pageRanges', itemIndex, 'all') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
		fontSize?: number;
		opacity?: number;
		rotation?: number;
		position?: StampPosition;
	};

	const fontSize = options.fontSize ?? 48;
	const opacity = options.opacity ?? 0.3;
	const rotation = options.rotation ?? 45;
	const position = options.position ?? 'center';

	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const pdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);
	const pageCount = pdf.getPageCount();

	const normalizedRanges = pageRanges.trim().toLowerCase();
	const isAllPages = normalizedRanges.length === 0 || normalizedRanges === 'all';
	const pageIndices = isAllPages
		? Array.from({ length: pageCount }, (_, index) => index)
		: parsePageRanges(pageRanges, pageCount, this.getNode(), itemIndex);

	const bundle = await embedUnicodeFonts(pdf);
	const textWidth = measureUnicodeText(bundle, text, 'regular', fontSize);
	const textHeight = bundle.fonts.regular.heightAtSize(fontSize);

	const pages = pdf.getPages();
	for (const pageIndex of pageIndices) {
		const page = pages[pageIndex];
		const { width, height } = page.getSize();
		const { x, y } = resolveStampPosition(position, width, height, textWidth, textHeight);
		drawUnicodeText(
			page,
			text,
			bundle,
			{ x, y, size: fontSize, style: 'regular', opacity, rotationDegrees: rotation },
			this.getNode(),
			'Text Watermark',
			itemIndex,
		);
	}

	const outputFileName = options.outputFileName ?? 'watermarked.pdf';
	const binaryData = await savePdfAsBinary(this, pdf, outputFileName);

	return {
		json: { pageCount, stampedPageCount: pageIndices.length },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: itemIndex,
	};
}
