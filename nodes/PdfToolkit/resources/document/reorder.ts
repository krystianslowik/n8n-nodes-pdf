import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { parsePageRangeGroups } from '../../shared/pageRanges';
import { PDFDocument, loadPdfDocument, savePdfAsBinary } from '../../shared/pdf';

export const reorderDescription: INodeProperties[] = [
	binaryPropertyField('document', 'reorder'),
	{
		displayName: 'New Order',
		name: 'newOrder',
		type: 'string',
		default: '',
		placeholder: '3,1,2,4',
		required: true,
		displayOptions: { show: { resource: ['document'], operation: ['reorder'] } },
		description:
			'Comma-separated list of 1-indexed page numbers (ranges allowed, e.g. "3,1-2,4") in the new order the output document should have (e.g. "3,1,2,4" moves page 3 to the front). Must list every page exactly once.',
	},
	outputOptionsField('document', 'reorder', [], 'reordered.pdf'),
];

// Implemented with pdf-lib: reuses shared/pageRanges.ts's range-GROUP parser
// (so ranges like "1-2" are legal inside the new-order expression too, not
// just single page numbers), then validates the flattened result is a
// complete permutation of the document's pages — every page listed exactly
// once, per the param description's completeness rule — before copying pages
// in that order into a new PDFDocument.
export async function reorderExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const newOrder = this.getNodeParameter('newOrder', itemIndex, '') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
	};

	// Binary presence is already validated by `PdfToolkit.node.ts`'s generic
	// itemwise pre-check (via `documentBinaryInputParamMap`) before this runs.
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const sourcePdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);
	const pageCount = sourcePdf.getPageCount();

	const groups = parsePageRangeGroups(newOrder, pageCount, this.getNode(), itemIndex);
	const order = groups.flatMap((group) => group.pages);

	if (order.length !== pageCount) {
		throw new NodeOperationError(
			this.getNode(),
			`New Order "${newOrder}" lists ${order.length} page reference(s), but the document has ` +
				`${pageCount} page(s) — every page must be listed exactly once`,
			{ itemIndex },
		);
	}

	const seen = new Set<number>();
	for (const pageIndex of order) {
		if (seen.has(pageIndex)) {
			throw new NodeOperationError(
				this.getNode(),
				`New Order "${newOrder}" lists page ${pageIndex + 1} more than once — every page must be ` +
					'listed exactly once',
				{ itemIndex },
			);
		}
		seen.add(pageIndex);
	}

	const outputPdf = await PDFDocument.create();
	const copiedPages = await outputPdf.copyPages(sourcePdf, order);
	for (const page of copiedPages) {
		outputPdf.addPage(page);
	}

	const outputFileName = options.outputFileName ?? 'reordered.pdf';
	const binaryData = await savePdfAsBinary(this, outputPdf, outputFileName);

	return {
		json: { pageCount: outputPdf.getPageCount() },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: itemIndex,
	};
}
