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
// cause as encrypt.ts. The qpdf-wasm evaluation in spike/FINDINGS.md
// "Q6 — qpdf-wasm eval" covers this operation too (qpdf's CLI handles both
// directions; the blocker is the same Node-bootstrap globals/fs surface, not
// something specific to decrypt).
export async function decryptExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwEngineUnavailable.call(
		this,
		'Decrypt',
		'PDF decryption needs a WASM engine (qpdf), and the evaluated qpdf-wasm builds cannot ' +
			'yet be bundled scanner-clean for this package (no filesystem/env access at runtime) — ' +
			'see spike/FINDINGS.md "Q6 — qpdf-wasm eval" for the full evaluation and viable future paths',
		itemIndex,
	);
}
