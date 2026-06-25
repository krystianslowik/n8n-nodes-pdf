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
// The evaluated alternative, a qpdf-wasm engine (PRD §7/O2), was genuinely
// attempted and rejected for THIS package: both viable npm builds
// (@jspawn/qpdf-wasm, @neslinesli93/qpdf-wasm) are Emscripten Node bundles
// whose bootstrap code unconditionally references banned globals (`process`,
// `__dirname`) and `require()`s banned built-in modules (`fs`, `path`) —
// unlike pdf-lib's single, cleanly-substitutable `setTimeout` call (see
// spike/FINDINGS.md Q2), these are entangled throughout the Node-environment
// detection/CLI-bootstrap path, not isolated. See spike/FINDINGS.md
// "Q6 — qpdf-wasm eval" for the full evaluation and future paths (e.g. a
// companion package per PRD O3, or a from-source Emscripten SINGLE_FILE
// rebuild).
export async function encryptExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwEngineUnavailable.call(
		this,
		'Encrypt',
		'PDF encryption needs a WASM engine (qpdf), and the evaluated qpdf-wasm builds cannot ' +
			'yet be bundled scanner-clean for this package (no filesystem/env access at runtime) — ' +
			'see spike/FINDINGS.md "Q6 — qpdf-wasm eval" for the full evaluation and viable future paths',
		itemIndex,
	);
}
