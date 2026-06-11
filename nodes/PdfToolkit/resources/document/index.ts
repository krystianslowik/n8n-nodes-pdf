import type { INodeProperties } from 'n8n-workflow';

import type { BinaryInputParamMap, ExecuteMap } from '../../shared/types';
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

export const documentExecuteMap: ExecuteMap = {
	merge: mergeExecute,
	split: splitExecute,
	extractPages: extractPagesExecute,
	rotate: rotateExecute,
	reorder: reorderExecute,
	deletePages: deletePagesExecute,
};

export const documentBinaryInputParamMap: BinaryInputParamMap = {
	merge: 'binaryPropertyName',
	split: 'binaryPropertyName',
	extractPages: 'binaryPropertyName',
	rotate: 'binaryPropertyName',
	reorder: 'binaryPropertyName',
	deletePages: 'binaryPropertyName',
};
