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
//
// Many-to-one cardinality (PRD F7 / README migration note: "Images→PDF, the
// n8n-nodes-pdfkit parity op" — pdfkit-node itself combines every incoming
// image into ONE multi-page PDF). This mirrors Document > Merge: called ONCE
// per node execution with every incoming item, not once per item — see
// `ManyToOneExecuteMap` in `shared/types.ts` and the dispatch in
// `PdfToolkit.node.ts`. There's no single `itemIndex` to blame a failure on
// here, so binary-input validation (`this.helpers.assertBinaryData`) for the
// image field on each item belongs inside this function once implemented,
// not in the generic per-item pre-check `PdfToolkit.node.ts` does for
// itemwise operations.
export async function fromImagesExecute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData> {
	// `items` isn't read yet (the whole body is a stub), but it's kept as a
	// named, real parameter — matching the many-to-one signature the real
	// implementation will use — rather than dropped or prefixed `_`.
	void items;
	return throwNotImplemented.call(this, 'From Images');
}
