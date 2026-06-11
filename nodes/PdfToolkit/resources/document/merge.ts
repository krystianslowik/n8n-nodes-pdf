import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

const showOnlyForMerge = { resource: ['document'], operation: ['merge'] };

/**
 * Merge has two source modes (PRD scaffold spec + README: "combine PDFs from
 * all incoming items or listed binary properties"):
 * - `allItems` (default): one PDF per incoming item, read from the same
 *   named binary field on every item (the common "Binary Property" param).
 * - `binaryProperties`: an explicit, ordered list of binary field names to
 *   pull from across the incoming item(s) — the mode that lets a single item
 *   carrying several named PDF binaries (e.g. "cover", "body", "appendix")
 *   be merged without needing one item per PDF.
 * Either way, Merge consumes ALL incoming items in one call and produces a
 * single output item (many-to-one cardinality — see `mergeExecute` below).
 */
export const mergeDescription: INodeProperties[] = [
	{
		displayName: 'Merge From',
		name: 'mergeFrom',
		type: 'options',
		displayOptions: { show: showOnlyForMerge },
		options: [
			{
				name: 'All Incoming Items',
				value: 'allItems',
				description: 'Merge one PDF per incoming item, read from the same binary field on each',
			},
			{
				name: 'Listed Binary Properties',
				value: 'binaryProperties',
				description:
					'Merge an explicit, ordered list of binary field names (can span one item with several PDF binaries, or many items)',
			},
		],
		default: 'allItems',
	},
	{
		...binaryPropertyField('document', 'merge', {
			description:
				'Name of the binary field, on each incoming item, that contains a PDF file to merge. Items are merged in input order.',
		}),
		displayOptions: { show: { ...showOnlyForMerge, mergeFrom: ['allItems'] } },
	},
	{
		displayName: 'Binary Properties',
		name: 'binaryPropertyNames',
		type: 'string',
		default: 'data',
		placeholder: 'data,attachment_1,attachment_2',
		required: true,
		displayOptions: { show: { ...showOnlyForMerge, mergeFrom: ['binaryProperties'] } },
		description:
			'Comma-separated, ordered list of binary field names to merge. Every incoming item is scanned in input order, and every listed field name present on that item is merged in list order (so one item with multiple named PDF binaries, or several items with one each, both work).',
	},
	outputOptionsField('document', 'merge', [], 'merged.pdf'),
];

// TODO: implement with pdf-lib (PdfDocument.copyPages across every resolved
// binary, preserving item order for `allItems` and item-then-list order for
// `binaryProperties`) once the bundling strategy for PRD open question O1 is
// resolved.
//
// Many-to-one cardinality (PRD: "Batch-aware: ... merge N items → 1"): this
// is called ONCE per node execution with every incoming item, not once per
// item — see `ManyToOneExecuteMap` in `shared/types.ts` and the dispatch in
// `PdfToolkit.node.ts`. There's no single `itemIndex` to blame a failure on
// here, so binary-input validation (`this.helpers.assertBinaryData`) for
// whichever items/properties this mode selects belongs inside this function
// once implemented, not in the generic pre-check `PdfToolkit.node.ts` does
// for itemwise operations.
export async function mergeExecute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData> {
	// `items` isn't read yet (the whole body is a stub), but it's kept as a
	// named, real parameter — matching the many-to-one signature the real
	// implementation will use — rather than dropped or prefixed `_`.
	void items;
	return throwNotImplemented.call(this, 'Merge');
}
