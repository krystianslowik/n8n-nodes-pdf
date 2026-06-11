import type { INodeProperties } from 'n8n-workflow';

import type { BinaryInputParamMap, ExecuteMap } from '../../shared/types';
import { fillFormDescription, fillFormExecute } from './fillForm';
import { readFieldsDescription, readFieldsExecute } from './readFields';

const showOnlyForForm = { resource: ['form'] };

const formOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: showOnlyForForm },
	options: [
		{
			name: 'Read Fields',
			value: 'readFields',
			description: 'Read a PDF form\'s fields into JSON',
			action: 'Read fields from a PDF form',
		},
		{
			name: 'Fill Form',
			value: 'fillForm',
			description: 'Fill a PDF form from JSON values',
			action: 'Fill a PDF form',
		},
	],
	default: 'readFields',
};

export const formDescription: INodeProperties[] = [
	formOperations,
	...readFieldsDescription,
	...fillFormDescription,
];

export const formExecuteMap: ExecuteMap = {
	readFields: readFieldsExecute,
	fillForm: fillFormExecute,
};

export const formBinaryInputParamMap: BinaryInputParamMap = {
	readFields: 'binaryPropertyName',
	fillForm: 'binaryPropertyName',
};
