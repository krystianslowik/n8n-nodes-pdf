import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField, pageRangeField } from '../../shared/descriptions';
import { parsePageRangeGroups } from '../../shared/pageRanges';
import { PDFDocument, loadPdfDocument, savePdfAsBinary } from '../../shared/pdf';

export const splitDescription: INodeProperties[] = [
	binaryPropertyField('document', 'split'),
	pageRangeField('document', 'split', {
		description:
			'How to split the document. Each comma-separated range becomes its own output item (e.g. "1-3,7,9-" produces three output PDFs: pages 1-3, page 7, and page 9 to the end).',
	}),
	outputOptionsField('document', 'split', [], 'split.pdf'),
];

/**
 * Turns a range token like "9-" (open-ended) into a filesystem-friendly
 * suffix ("9-end") for the per-range output file name, so multiple output
 * items don't all try to use the exact same file name.
 */
function fileNameForRange(baseFileName: string, raw: string): string {
	const suffix = raw.endsWith('-') ? `${raw.slice(0, -1)}-end` : raw;
	const dotIndex = baseFileName.lastIndexOf('.');
	if (dotIndex <= 0) {
		return `${baseFileName}-${suffix}`;
	}
	return `${baseFileName.slice(0, dotIndex)}-${suffix}${baseFileName.slice(dotIndex)}`;
}

// Implemented with pdf-lib: parses the page-range expression into one group
// PER comma-separated token (shared/pageRanges.ts), then copies each
// group's pages into its own new PDFDocument.
//
// One-to-many cardinality (PRD: "Batch-aware: ... split 1 → N items"): this
// still consumes exactly one input item (itemIndex), but returns an array so
// it can emit one output item per range — see `OneToManyExecuteMap` in
// `shared/types.ts` and the dispatch in `PdfToolkit.node.ts`, which pushes
// every item this returns instead of assuming exactly one.
export async function splitExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const pageRanges = this.getNodeParameter('pageRanges', itemIndex, '') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
	};

	// Binary presence is already validated by `PdfToolkit.node.ts`'s generic
	// itemwise pre-check (via `documentBinaryInputParamMap`) before this runs.
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const sourcePdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);
	const groups = parsePageRangeGroups(pageRanges, sourcePdf.getPageCount(), this.getNode(), itemIndex);

	const outputBinaryPropertyName = options.outputBinaryPropertyName ?? 'data';
	const baseFileName = options.outputFileName ?? 'split.pdf';
	const multipleOutputs = groups.length > 1;

	const outputItems: INodeExecutionData[] = [];
	for (const group of groups) {
		const outputPdf = await PDFDocument.create();
		const copiedPages = await outputPdf.copyPages(sourcePdf, group.pages);
		for (const page of copiedPages) {
			outputPdf.addPage(page);
		}

		const fileName = multipleOutputs ? fileNameForRange(baseFileName, group.raw) : baseFileName;
		const binaryData = await savePdfAsBinary(this, outputPdf, fileName);

		outputItems.push({
			json: { pageRange: group.raw, pageCount: outputPdf.getPageCount() },
			binary: { [outputBinaryPropertyName]: binaryData },
			pairedItem: itemIndex,
		});
	}

	return outputItems;
}
