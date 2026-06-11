import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

const showOnlyForEmbeddedImages = { resource: ['extract'], operation: ['embeddedImages'] };

// Intentional exception to the common-params spec's "Output Binary Property"
// + "Output File Name" pair: Embedded Images emits a *variable* number of
// images (zero or more per PDF), not a single output file, so there's no one
// binary field/file name to configure. A "Output Binary Property Prefix"
// option is used instead — each extracted image lands on its own binary
// field (`<prefix>0`, `<prefix>1`, ...) on the same output item, which is the
// standard n8n convention for operations that produce N binaries per item
// (e.g. core "Extract from File" >  Move to a specific binary property /
// "Read/Write Files from Disk" with multiple files).
export const extractEmbeddedImagesDescription: INodeProperties[] = [
	binaryPropertyField('extract', 'embeddedImages'),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showOnlyForEmbeddedImages },
		options: [
			{
				displayName: 'Output Binary Property Prefix',
				name: 'outputBinaryPropertyPrefix',
				type: 'string',
				default: 'image',
				description:
					'Prefix used for the binary field of each extracted image on the output item (e.g. "image" produces "image0", "image1", ...)',
			},
		],
	},
];

// TODO: implement with pdfjs-dist (walk each page's operator list for image
// XObjects and emit one binary field per embedded image) once the bundling
// strategy for PRD open question O1 is resolved.
export async function extractEmbeddedImagesExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Embedded Images', itemIndex);
}
