import type { INodeProperties } from 'n8n-workflow';

import type {
	BinaryInputParamMap,
	ExecuteMap,
	ManyToOneExecuteMap,
	OneToManyExecuteMap,
} from '../../shared/types';
import { deletePagesDescription, deletePagesExecute } from './deletePages';
import { extractPagesDescription, extractPagesExecute } from './extractPages';
import { mergeDescription, mergeExecute } from './merge';
import { reorderDescription, reorderExecute } from './reorder';
import { rotateDescription, rotateExecute } from './rotate';
import { splitDescription, splitExecute } from './split';

const showOnlyForDocument = { resource: ['document'] };

const documentOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: showOnlyForDocument },
	options: [
		{
			name: 'Delete Pages',
			value: 'deletePages',
			description: 'Remove a set of pages',
			action: 'Delete pages from a PDF',
		},
		{
			name: 'Extract Pages',
			value: 'extractPages',
			description: 'Extract a set of pages into a new PDF',
			action: 'Extract pages from a PDF',
		},
		{
			name: 'Merge',
			value: 'merge',
			description: 'Combine multiple PDFs into one, preserving order',
			action: 'Merge multiple PDF files',
		},
		{
			name: 'Reorder',
			value: 'reorder',
			description: 'Change the order of pages',
			action: 'Reorder pages in a PDF',
		},
		{
			name: 'Rotate',
			value: 'rotate',
			description: 'Rotate one or more pages',
			action: 'Rotate pages in a PDF',
		},
		{
			name: 'Split',
			value: 'split',
			description: 'Split a PDF into multiple PDFs by page ranges',
			action: 'Split a PDF',
		},
	],
	default: 'merge',
};

export const documentDescription: INodeProperties[] = [
	documentOperations,
	...mergeDescription,
	...splitDescription,
	...extractPagesDescription,
	...rotateDescription,
	...reorderDescription,
	...deletePagesDescription,
];

// Itemwise operations: exactly one input item in, exactly one output item
// out. Merge (many-to-one) and Split (one-to-many) have different item
// cardinality and are registered in the maps below instead — see
// `shared/types.ts` and the dispatch in `PdfToolkit.node.ts`.
export const documentExecuteMap: ExecuteMap = {
	extractPages: extractPagesExecute,
	rotate: rotateExecute,
	reorder: reorderExecute,
	deletePages: deletePagesExecute,
};

// Merge (PRD: "Batch-aware: ... merge N items → 1"): consumes ALL incoming
// items in one call, producing exactly one output item.
export const documentManyToOneExecuteMap: ManyToOneExecuteMap = {
	merge: mergeExecute,
};

// Split (PRD: "Batch-aware: ... split 1 → N items"): still consumes exactly
// one input item per call, but returns zero or more output items.
export const documentOneToManyExecuteMap: OneToManyExecuteMap = {
	split: splitExecute,
};

export const documentBinaryInputParamMap: BinaryInputParamMap = {
	// `merge` is intentionally absent: as a many-to-one operation it resolves
	// its own binary input(s) across every incoming item (mode-dependent —
	// see `merge.ts`), so the generic single-item pre-check in
	// `PdfToolkit.node.ts` doesn't apply to it.
	split: 'binaryPropertyName',
	extractPages: 'binaryPropertyName',
	rotate: 'binaryPropertyName',
	reorder: 'binaryPropertyName',
	deletePages: 'binaryPropertyName',
};
