import type { INodeProperties } from 'n8n-workflow';

import type { BinaryInputParamMap, ExecuteMap } from '../../shared/types';
import { extractEmbeddedImagesDescription, extractEmbeddedImagesExecute } from './embeddedImages';
import { extractMetadataDescription, extractMetadataExecute } from './metadata';
import { extractPageCountDescription, extractPageCountExecute } from './pageCount';
import { extractTextDescription, extractTextExecute } from './text';

const showOnlyForExtract = { resource: ['extract'] };

const extractOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: showOnlyForExtract },
	options: [
		{
			name: 'Text',
			value: 'text',
			description:
				'Not implemented yet — always throws an error. Extract per-page text, optionally with coordinates (see README).',
			action: 'Extract text from a PDF',
		},
		{
			name: 'Metadata',
			value: 'metadata',
			description: 'Extract document metadata (title, author, dates, etc.)',
			action: 'Extract metadata from a PDF',
		},
		{
			name: 'Embedded Images',
			value: 'embeddedImages',
			description:
				'Extract images embedded in the PDF (JPEG/DCTDecode images only — other image filters are not supported, see README)',
			action: 'Extract embedded images from a PDF',
		},
		{
			name: 'Page Count',
			value: 'pageCount',
			description: 'Get the number of pages in the PDF',
			action: 'Get the page count of a PDF',
		},
	],
	// 'metadata' rather than 'text': Extract > Text is a documented stub
	// (needs pdfjs-dist, currently unavailable — see README's Limits section)
	// and the default operation must work zero-config.
	default: 'metadata',
};

export const extractDescription: INodeProperties[] = [
	extractOperations,
	...extractTextDescription,
	...extractMetadataDescription,
	...extractEmbeddedImagesDescription,
	...extractPageCountDescription,
];

export const extractExecuteMap: ExecuteMap = {
	text: extractTextExecute,
	metadata: extractMetadataExecute,
	embeddedImages: extractEmbeddedImagesExecute,
	pageCount: extractPageCountExecute,
};

export const extractBinaryInputParamMap: BinaryInputParamMap = {
	text: 'binaryPropertyName',
	metadata: 'binaryPropertyName',
	embeddedImages: 'binaryPropertyName',
	pageCount: 'binaryPropertyName',
};
