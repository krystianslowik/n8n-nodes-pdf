import type { INodeProperties } from 'n8n-workflow';

import type { BinaryInputParamMap, ExecuteMap } from '../../shared/types';
import { decryptDescription, decryptExecute } from './decrypt';
import { encryptDescription, encryptExecute } from './encrypt';
import { setPermissionsDescription, setPermissionsExecute } from './setPermissions';

const showOnlyForSecure = { resource: ['secure'] };

const secureOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: showOnlyForSecure },
	options: [
		{
			name: 'Encrypt',
			value: 'encrypt',
			description: 'Not implemented yet — always throws an error. Password-protect a PDF (see README).',
			action: 'Encrypt a PDF',
		},
		{
			name: 'Decrypt',
			value: 'decrypt',
			description:
				'Not implemented yet — always throws an error. Remove password protection from a PDF (see README).',
			action: 'Decrypt a PDF',
		},
		{
			name: 'Set Permissions',
			value: 'setPermissions',
			description:
				'Not implemented yet — always throws an error. Restrict printing, copying, editing, and other actions (see README).',
			action: 'Set permissions on a PDF',
		},
	],
	default: 'encrypt',
};

export const secureDescription: INodeProperties[] = [
	secureOperations,
	...encryptDescription,
	...decryptDescription,
	...setPermissionsDescription,
];

export const secureExecuteMap: ExecuteMap = {
	encrypt: encryptExecute,
	decrypt: decryptExecute,
	setPermissions: setPermissionsExecute,
};

export const secureBinaryInputParamMap: BinaryInputParamMap = {
	encrypt: 'binaryPropertyName',
	decrypt: 'binaryPropertyName',
	setPermissions: 'binaryPropertyName',
};
