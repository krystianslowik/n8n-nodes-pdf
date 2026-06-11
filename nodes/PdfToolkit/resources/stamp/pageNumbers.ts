import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

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

// TODO: implement with pdf-lib (page.drawText with the formatted page-number
// label for every page) once the bundling strategy for PRD open question O1
// is resolved.
export async function pageNumbersExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Page Numbers', itemIndex);
}
