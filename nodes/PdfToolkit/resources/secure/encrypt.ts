import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwEngineUnavailable } from '../../shared/notImplemented';

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

// pdf-lib has no PDF standard-security-handler (encryption) support at all —
// confirmed against its own docs/source, not an oversight to "just wire up".
// The available qpdf-wasm builds (@jspawn/qpdf-wasm, @neslinesli93/qpdf-wasm)
// are Emscripten Node bundles whose bootstrap code unconditionally
// references banned globals (`process`, `__dirname`) and `require()`s banned
// built-in modules (`fs`, `path`), entangled throughout the Node-environment
// detection/CLI-bootstrap path rather than isolated to one substitutable call
// site (unlike pdf-lib's single `setTimeout` call, see
// scripts/shims/yield.js), so they cannot be bundled scanner-clean today.
export async function encryptExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwEngineUnavailable.call(
		this,
		'Encrypt',
		'PDF encryption needs a WASM engine (qpdf), and the available qpdf-wasm builds cannot ' +
			'yet be bundled scanner-clean for this package (no filesystem/env access at runtime). ' +
			"See the README's Limits section.",
		itemIndex,
	);
}
