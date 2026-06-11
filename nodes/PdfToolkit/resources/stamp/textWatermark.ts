import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

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
		description: 'Watermark text to stamp onto every page',
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

// TODO: implement with pdf-lib (page.drawText with rotation/opacity for
// every page) once the bundling strategy for PRD open question O1 is
// resolved.
export async function textWatermarkExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Text Watermark', itemIndex);
}
