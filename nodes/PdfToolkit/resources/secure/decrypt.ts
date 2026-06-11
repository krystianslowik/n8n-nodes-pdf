import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

const showOnlyForDecrypt = { resource: ['secure'], operation: ['decrypt'] };

export const decryptDescription: INodeProperties[] = [
	binaryPropertyField('secure', 'decrypt'),
	{
		displayName: 'Password',
		name: 'password',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		displayOptions: { show: showOnlyForDecrypt },
		description: 'User or owner password to decrypt the document with',
	},
	outputOptionsField('secure', 'decrypt', [], 'decrypted.pdf'),
];

// TODO: implement with pdf-lib (where supported) or a qpdf-wasm-based
// fallback for documents encrypted with algorithms pdf-lib can't decrypt
// (PRD §7/O1) once the bundling strategy for PRD open question O1 is
// resolved.
export async function decryptExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Decrypt', itemIndex);
}
