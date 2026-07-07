import type { INodeProperties } from 'n8n-workflow';

import type { BinaryInputParamMap, ExecuteMap, ManyToOneExecuteMap } from '../../shared/types';
import { fromImagesDescription, fromImagesExecute } from './fromImages';
import { fromMarkdownDescription, fromMarkdownExecute } from './fromMarkdown';
import { fromTemplateDescription, fromTemplateExecute } from './fromTemplate';

const showOnlyForGenerate = { resource: ['generate'] };

const generateOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: showOnlyForGenerate },
	options: [
		{
			name: 'From Template',
			value: 'fromTemplate',
			description: 'Generate a PDF from a declarative JSON template',
			action: 'Generate a PDF from a template',
		},
		{
			name: 'From Markdown',
			value: 'fromMarkdown',
			description: 'Generate a PDF from Markdown source',
			action: 'Generate a PDF from markdown',
		},
		{
			name: 'From Images',
			value: 'fromImages',
			description: 'Generate a PDF from one image per page (n8n-nodes-pdfkit parity)',
			action: 'Generate a PDF from images',
		},
	],
	default: 'fromTemplate',
};

export const generateDescription: INodeProperties[] = [
	generateOperations,
	...fromTemplateDescription,
	...fromMarkdownDescription,
	...fromImagesDescription,
];

// Itemwise operations: exactly one input item in, exactly one output item
// out. From Images has many-to-one cardinality and is registered in
// `generateManyToOneExecuteMap` below instead — see `shared/types.ts` and the
// dispatch in `PdfToolkit.node.ts`.
export const generateExecuteMap: ExecuteMap = {
	fromTemplate: fromTemplateExecute,
	fromMarkdown: fromMarkdownExecute,
};

// From Images (the n8n-nodes-pdfkit parity op: images → PDF): consumes ALL
// incoming items (one image per item, in input order) in one
// call, producing a single combined multi-page output PDF — the same
// cardinality Document > Merge needs.
export const generateManyToOneExecuteMap: ManyToOneExecuteMap = {
	fromImages: fromImagesExecute,
};

export const generateBinaryInputParamMap: BinaryInputParamMap = {
	// From Template / From Markdown consume JSON/string parameters, not a PDF
	// binary, so they are intentionally absent here (no binary to assert).
	// From Images is intentionally absent too: as a many-to-one operation it
	// resolves its own binary input across every incoming item, so the
	// generic single-item pre-check in `PdfToolkit.node.ts` doesn't apply to
	// it (see `merge.ts`'s equivalent comment for Document > Merge).
};
