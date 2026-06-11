import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

const showOnlyForFromImages = { resource: ['generate'], operation: ['fromImages'] };

/**
 * The drop-in replacement for `n8n-nodes-pdfkit`'s entire feature set
 * (images -> PDF, PRD F7 / goal 4). See the README migration note.
 */
export const fromImagesDescription: INodeProperties[] = [
	binaryPropertyField('generate', 'fromImages', {
		description:
			'Name of the binary field, on each incoming item, that contains an image (JPEG/PNG) to add as a page. Images are added in input order.',
	}),
	{
		displayName: 'Page Size',
		name: 'pageSize',
		type: 'options',
		displayOptions: { show: showOnlyForFromImages },
		options: [
			{ name: 'Fit to Image', value: 'fit' },
			{ name: 'A4', value: 'a4' },
			{ name: 'Letter', value: 'letter' },
		],
		default: 'fit',
		description: 'Page size to use for each image page',
	},
	outputOptionsField('generate', 'fromImages', [], 'images.pdf'),
];

// TODO: implement with pdfmake (one page per incoming image binary, scaled
// to the chosen page size) once the bundling strategy for PRD open question
// O1 is resolved.
export async function fromImagesExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'From Images', itemIndex);
}
