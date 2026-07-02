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
					'Whether to include per-text-item bounding-box coordinates alongside the extracted text (PRD F5)',
			},
		],
	},
];

// pdfjs-dist (the library this op needs for real text extraction: getDocument
// + page.getTextContent per page, in text-only mode without canvas) was
// genuinely attempted and rejected for THIS package — not an oversight to
// "just wire up". Its Node.js support model is architecturally incompatible
// with this package's combined constraints (scanner-clean static analysis,
// no filesystem access at runtime, no unbundled dynamic `import()`): a much
// larger banned-globals surface than pdf-lib's single `setTimeout` call
// (Q2), and a hard, non-substitutable dependency on the real Node `process`
// global for environment detection that can't legally be obtained under
// either `no-restricted-globals` or `no-restricted-imports`. See
// spike/FINDINGS.md "Q4 — pdfjs-dist bundling" for the full evaluation
// (Findings 1-3) and the two productive future directions it identifies (a
// purpose-built pure-JS text-extraction routine against pdf-lib's own object
// model, or revisiting once pdfjs-dist ships an official no-worker Node
// entry point).
export async function extractTextExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwEngineUnavailable.call(
		this,
		'Text',
		'text extraction needs pdfjs-dist, and its Node.js support model cannot yet be bundled ' +
			'scanner-clean for this package (banned globals in its parser core, and a required ' +
			'`process` environment check that cannot legally be obtained) — see spike/FINDINGS.md ' +
			'"Q4 — pdfjs-dist bundling" for the full evaluation and viable future paths',
		itemIndex,
	);
}
