import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwEngineUnavailable } from '../../shared/notImplemented';

const showOnlyForSetPermissions = { resource: ['secure'], operation: ['setPermissions'] };

export const setPermissionsDescription: INodeProperties[] = [
	binaryPropertyField('secure', 'setPermissions'),
	{
		displayName: 'Owner Password',
		name: 'ownerPassword',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		required: true,
		displayOptions: { show: showOnlyForSetPermissions },
		description: 'Owner password used to enforce the chosen permissions',
	},
	{
		displayName: 'Allowed Actions',
		name: 'permissions',
		type: 'multiOptions',
		displayOptions: { show: showOnlyForSetPermissions },
		options: [
			{ name: 'Annotating', value: 'annotating' },
			{ name: 'Content Accessibility', value: 'contentAccessibility' },
			{ name: 'Copying Content', value: 'copying' },
			{ name: 'Document Assembly', value: 'documentAssembly' },
			{ name: 'Filling Forms', value: 'fillingForms' },
			{ name: 'Modifying', value: 'modifying' },
			{ name: 'Printing', value: 'printing' },
		],
		default: ['printing', 'copying'],
		description: 'Which actions to allow on the document; unlisted actions are restricted',
	},
	outputOptionsField('secure', 'setPermissions', [], 'restricted.pdf'),
];

// The PDF permissions bitmask lives inside the standard-security-handler
// encryption dictionary (a permitted-but-unencrypted-content PDF still needs
// an owner-password-protected encryption dict to carry restriction flags) —
// pdf-lib cannot write one, same root cause as encrypt.ts/decrypt.ts.
export async function setPermissionsExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwEngineUnavailable.call(
		this,
		'Set Permissions',
		'setting PDF permissions needs a WASM engine (qpdf), and the available qpdf-wasm builds ' +
			'cannot yet be bundled scanner-clean for this package (no filesystem/env access at ' +
			"runtime). See the README's Limits section.",
		itemIndex,
	);
}
