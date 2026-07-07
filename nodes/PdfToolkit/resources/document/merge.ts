import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { PDFDocument, loadPdfDocument } from '../../shared/pdf';

const showOnlyForMerge = { resource: ['document'], operation: ['merge'] };

/**
 * Merge has two source modes (see README: "combine PDFs from all incoming
 * items or listed binary properties"):
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

// Implemented with pdf-lib (PDFDocument.copyPages across every resolved
// binary, preserving item order for `allItems` and item-then-list order for
// `binaryProperties`).
//
// Many-to-one cardinality (batch-aware: merges N items → 1): this
// is called ONCE per node execution with every incoming item, not once per
// item — see `ManyToOneExecuteMap` in `shared/types.ts` and the dispatch in
// `PdfToolkit.node.ts`. There's no single `itemIndex` to blame a failure on
// here, so binary-input validation (`this.helpers.assertBinaryData`) for
// whichever items/properties this mode selects happens inside this function,
// not in the generic pre-check `PdfToolkit.node.ts` does for itemwise
// operations.
export async function mergeExecute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData> {
	const mergeFrom = this.getNodeParameter('mergeFrom', 0, 'allItems') as string;
	const options = this.getNodeParameter('options', 0, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
	};

	// Ordered list of (item, binary field) sources to merge, in the exact
	// order they should end up in the merged output.
	const sources: Array<{ itemIndex: number; binaryPropertyName: string }> = [];

	if (mergeFrom === 'binaryProperties') {
		const binaryPropertyNames = (this.getNodeParameter('binaryPropertyNames', 0, 'data') as string)
			.split(',')
			.map((name) => name.trim())
			.filter((name) => name.length > 0);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			for (const binaryPropertyName of binaryPropertyNames) {
				if (items[itemIndex].binary?.[binaryPropertyName]) {
					sources.push({ itemIndex, binaryPropertyName });
				}
			}
		}
	} else {
		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', 0, 'data') as string;
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			sources.push({ itemIndex, binaryPropertyName });
		}
	}

	if (sources.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Merge found no PDF binaries to combine');
	}

	const mergedPdf = await PDFDocument.create();

	for (const source of sources) {
		this.helpers.assertBinaryData(source.itemIndex, source.binaryPropertyName);
		const buffer = await this.helpers.getBinaryDataBuffer(
			source.itemIndex,
			source.binaryPropertyName,
		);
		const sourcePdf = await loadPdfDocument(
			buffer,
			this.getNode(),
			source.binaryPropertyName,
			source.itemIndex,
		);
		const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
		for (const page of copiedPages) {
			mergedPdf.addPage(page);
		}
	}

	const mergedBytes = await mergedPdf.save();
	const outputFileName = options.outputFileName ?? 'merged.pdf';
	const binaryData = await this.helpers.prepareBinaryData(
		Buffer.from(mergedBytes),
		outputFileName,
		'application/pdf',
	);

	return {
		json: { pageCount: mergedPdf.getPageCount() },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: items.map((_item, itemIndex) => ({ item: itemIndex })),
	};
}
