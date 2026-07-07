import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField } from '../../shared/descriptions';
import { throwEngineUnavailable } from '../../shared/notImplemented';

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
					'Whether to include per-text-item bounding-box coordinates alongside the extracted text',
			},
		],
	},
];

// pdfjs-dist (the library this op needs for real text extraction:
// getDocument + page.getTextContent per page, in text-only mode without
// canvas) has a Node.js support model that is architecturally incompatible
// with this package's constraints: a much larger banned-globals surface than
// pdf-lib's single `setTimeout` call, and a hard, non-substitutable
// dependency on the real Node `process` global for environment detection
// that can't legally be obtained under `no-restricted-globals` or
// `no-restricted-imports`.
export async function extractTextExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwEngineUnavailable.call(
		this,
		'Text',
		'text extraction needs pdfjs-dist, and its Node.js support model cannot yet be bundled ' +
			'scanner-clean for this package (banned globals in its parser core, and a required ' +
			"`process` environment check that cannot legally be obtained). See the README's Limits " +
			'section.',
		itemIndex,
	);
}
