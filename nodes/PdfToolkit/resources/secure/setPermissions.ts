import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

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

// TODO: implement with pdf-lib (where supported) or a qpdf-wasm-based
// fallback for the PDF permission bitmask (PRD §7/O1) once the bundling
// strategy for PRD open question O1 is resolved.
export async function setPermissionsExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Set Permissions', itemIndex);
}
