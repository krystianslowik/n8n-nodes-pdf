import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

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

// TODO: implement with pdf-lib (embedJpg/embedPng + page.drawImage with
// opacity for every page) once the bundling strategy for PRD open question
// O1 is resolved.
export async function imageWatermarkExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Image Watermark', itemIndex);
}
