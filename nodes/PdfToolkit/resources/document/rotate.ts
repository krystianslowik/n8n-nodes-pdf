import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField, pageRangeField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

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

// TODO: implement with pdf-lib (parse the page-range string, then
// page.setRotation(degrees) for each selected page) once the bundling
// strategy for PRD open question O1 is resolved.
export async function rotateExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Rotate', itemIndex);
}
