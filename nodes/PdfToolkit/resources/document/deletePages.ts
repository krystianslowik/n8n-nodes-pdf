import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField, pageRangeField } from '../../shared/descriptions';
import { parsePageRanges } from '../../shared/pageRanges';
import { loadPdfDocument, savePdfAsBinary } from '../../shared/pdf';

export const deletePagesDescription: INodeProperties[] = [
	binaryPropertyField('document', 'deletePages'),
	pageRangeField('document', 'deletePages', {
		description: 'Pages to delete from the document (e.g. "1-3,7,9-").',
	}),
	outputOptionsField('document', 'deletePages', [], 'document.pdf'),
];

// Implemented with pdf-lib: parses the page-range expression into a single,
// deduplicated selection (shared/pageRanges.ts), then removes those pages
// highest-index-first — `removePage` shifts every later page's index down,
// so removing low-to-high would delete the wrong pages after the first
// removal.
export async function deletePagesExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const pageRanges = this.getNodeParameter('pageRanges', itemIndex, '') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
	};

	// Binary presence is already validated by `PdfToolkit.node.ts`'s generic
	// itemwise pre-check (via `documentBinaryInputParamMap`) before this runs.
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const pdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);
	const pageCount = pdf.getPageCount();

	const pagesToDelete = parsePageRanges(pageRanges, pageCount, this.getNode(), itemIndex);

	if (pagesToDelete.length >= pageCount) {
		throw new NodeOperationError(
			this.getNode(),
			`Delete Pages would remove all ${pageCount} page(s) of the document, leaving an empty PDF — ` +
				`narrow "Page Ranges" ("${pageRanges}") to leave at least one page`,
			{ itemIndex },
		);
	}

	for (const pageIndex of [...pagesToDelete].sort((a, b) => b - a)) {
		pdf.removePage(pageIndex);
	}

	const outputFileName = options.outputFileName ?? 'document.pdf';
	const binaryData = await savePdfAsBinary(this, pdf, outputFileName);

	return {
		json: { pageCount: pdf.getPageCount() },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: itemIndex,
	};
}
