import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

const showOnlyForEncrypt = { resource: ['secure'], operation: ['encrypt'] };

export const encryptDescription: INodeProperties[] = [
	binaryPropertyField('secure', 'encrypt'),
	{
		displayName: 'User Password',
		name: 'userPassword',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		displayOptions: { show: showOnlyForEncrypt },
		description: 'Password required to open the document',
	},
	{
		displayName: 'Owner Password',
		name: 'ownerPassword',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		displayOptions: { show: showOnlyForEncrypt },
		description:
			'Password required to change permissions/restrictions. Defaults to the user password if left empty.',
	},
	outputOptionsField('secure', 'encrypt', [], 'encrypted.pdf'),
];

// TODO: implement with pdf-lib (PDF standard-security-handler encryption is
// not natively supported by pdf-lib — evaluate a qpdf-wasm-based approach,
// PRD §7/O1) once the bundling strategy for PRD open question O1 is
// resolved.
export async function encryptExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Encrypt', itemIndex);
}
