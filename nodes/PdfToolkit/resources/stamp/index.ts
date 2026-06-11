import type { INodeProperties } from 'n8n-workflow';

import type { BinaryInputParamMap, ExecuteMap } from '../../shared/types';
import { imageWatermarkDescription, imageWatermarkExecute } from './imageWatermark';
import { overlayPdfDescription, overlayPdfExecute } from './overlayPdf';
import { pageNumbersDescription, pageNumbersExecute } from './pageNumbers';
import { textWatermarkDescription, textWatermarkExecute } from './textWatermark';

const showOnlyForStamp = { resource: ['stamp'] };

const stampOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: showOnlyForStamp },
	options: [
		{
			name: 'Text Watermark',
			value: 'textWatermark',
			description: 'Stamp text onto every page',
			action: 'Add a text watermark to a PDF',
		},
		{
			name: 'Image Watermark',
			value: 'imageWatermark',
			description: 'Stamp an image onto every page',
			action: 'Add an image watermark to a PDF',
		},
		{
			name: 'Page Numbers',
			value: 'pageNumbers',
			description: 'Add page numbers to every page',
			action: 'Add page numbers to a PDF',
		},
		{
			name: 'Overlay PDF',
			value: 'overlayPdf',
			description: 'Overlay one PDF on top of another',
			action: 'Overlay a PDF on another PDF',
		},
	],
	default: 'textWatermark',
};

export const stampDescription: INodeProperties[] = [
	stampOperations,
	...textWatermarkDescription,
	...imageWatermarkDescription,
	...pageNumbersDescription,
	...overlayPdfDescription,
];

export const stampExecuteMap: ExecuteMap = {
	textWatermark: textWatermarkExecute,
	imageWatermark: imageWatermarkExecute,
	pageNumbers: pageNumbersExecute,
	overlayPdf: overlayPdfExecute,
};

export const stampBinaryInputParamMap: BinaryInputParamMap = {
	textWatermark: 'binaryPropertyName',
	imageWatermark: 'binaryPropertyName',
	pageNumbers: 'binaryPropertyName',
	overlayPdf: 'binaryPropertyName',
};
