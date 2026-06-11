import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

const showOnlyForExtractText = { resource: ['extract'], operation: ['text'] };

export const extractTextDescription: INodeProperties[] = [
	binaryPropertyField('extract', 'text'),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showOnlyForExtractText },
		options: [
			{
				displayName: 'Include Coordinates',
				name: 'includeCoordinates',
				type: 'boolean',
				default: false,
				description:
					'Whether to include per-text-item bounding-box coordinates alongside the extracted text (PRD F5)',
			},
		],
	},
];

// TODO: implement with pdfjs-dist (getDocument + page.getTextContent per
// page, in text-only mode without canvas; include item.transform-derived
// coordinates when "Include Coordinates" is enabled) once the bundling
// strategy for PRD open question O1 is resolved.
export async function extractTextExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Text', itemIndex);
}
