import type { INodeProperties } from 'n8n-workflow';

import type { BinaryInputParamMap, ExecuteMap } from '../../shared/types';
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

export const generateExecuteMap: ExecuteMap = {
	fromTemplate: fromTemplateExecute,
	fromMarkdown: fromMarkdownExecute,
	fromImages: fromImagesExecute,
};

export const generateBinaryInputParamMap: BinaryInputParamMap = {
	// From Template / From Markdown consume JSON/string parameters, not a PDF
	// binary, so they are intentionally absent here (no binary to assert).
	fromImages: 'binaryPropertyName',
};
