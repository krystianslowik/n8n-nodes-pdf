// pdf-lib is a devDependency, never a runtime one: esbuild bundles it into
// dist/ (scripts/esbuild-bundle.mjs), so nothing under this exact `import`
// line ever ships. `no-restricted-imports` is a source-level AST check with
// no bundling-aware escape hatch (see spike/FINDINGS.md Q2); the artifact it
// actually protects is the compiled dist file, which IS scanner-checked (via
// spike/drive-analyze.mjs) and does not contain an unbundled `pdf-lib` import.
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { PDFDocument } from 'pdf-lib';
import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField } from '../../shared/descriptions';

export const extractPageCountDescription: INodeProperties[] = [
	binaryPropertyField('extract', 'pageCount'),
];

// Implemented with pdf-lib (PDFDocument.getPageCount()). PRD F8/Tier1
// originally scoped this to pdfjs-dist, but for the spike (and given pdf-lib
// is already bundled for Document/Form/Stamp) reusing pdf-lib here avoids
// bundling a second PDF-parsing library for a single number.
export async function extractPageCountExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	// Binary presence is already validated by `PdfToolkit.node.ts`'s generic
	// itemwise pre-check (via `extractBinaryInputParamMap`) before this runs.
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const pdf = await PDFDocument.load(buffer);

	return {
		json: { pageCount: pdf.getPageCount() },
		pairedItem: itemIndex,
	};
}
