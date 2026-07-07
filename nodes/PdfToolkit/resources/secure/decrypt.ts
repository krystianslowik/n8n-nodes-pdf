import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwEngineUnavailable } from '../../shared/notImplemented';

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

// pdf-lib CAN load password-encrypted PDFs' unencrypted structure in some
// cases, but it has no standard-security-handler DECRYPTION implementation
// (no code path takes a password and produces decrypted output) — same root
// cause as encrypt.ts. The qpdf/WASM blocker is the same for this operation:
// the available builds reference banned Node globals/fs at runtime.
export async function decryptExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwEngineUnavailable.call(
		this,
		'Decrypt',
		'PDF decryption needs a WASM engine (qpdf), and the available qpdf-wasm builds cannot ' +
			'yet be bundled scanner-clean for this package (no filesystem/env access at runtime). ' +
			"See the README's Limits section.",
		itemIndex,
	);
}
