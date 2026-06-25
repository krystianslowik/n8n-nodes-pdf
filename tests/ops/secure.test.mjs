/**
 * Secure > Encrypt / Decrypt / Set Permissions: pdf-lib has no
 * standard-security-handler encryption support, and the evaluated qpdf-wasm
 * engines couldn't be bundled scanner-clean for this package (see
 * spike/FINDINGS.md "Q6 — qpdf-wasm eval"). These three operations remain
 * honestly-deferred stubs — this test asserts the error thrown explains WHY
 * (names the blocking engine and points at the evaluation), not just "not
 * implemented yet", and still carries `itemIndex` so `continueOnFail()`
 * keeps working.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, itemWithPdf } from '../mock-execute.mjs';
import { makePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { NodeOperationError } = require('n8n-workflow');

async function runSecureOp(operation, extraParams = {}) {
	const pdf = await makePdf(2);
	const items = [itemWithPdf(pdf)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'secure',
		operation,
		binaryPropertyName: 'data',
		options: {},
		...extraParams,
	});
	return createPdfToolkitInstance().execute.call(mockThis);
}

function assertEngineUnavailable(error, operationLabel) {
	assert.ok(error instanceof NodeOperationError, `expected a NodeOperationError, got ${error}`);
	assert.ok(
		error.message.includes(`The "${operationLabel}" operation is not available`),
		`expected message to name the operation and say it's unavailable (not just "not implemented ` +
			`yet"), got: ${error.message}`,
	);
	assert.ok(/qpdf/i.test(error.message), `expected message to name the blocking engine (qpdf), got: ${error.message}`);
	assert.ok(
		/FINDINGS\.md/.test(error.message),
		`expected message to point at the written-up evaluation, got: ${error.message}`,
	);
	assert.equal(error.context?.itemIndex, 0, 'expected the error to carry itemIndex for continueOnFail()');
	return true;
}

export const tests = [
	{
		name: 'Encrypt throws a NodeOperationError explaining the qpdf-wasm blocker (not a bare "not implemented")',
		fn: async () => {
			await assert.rejects(
				() => runSecureOp('encrypt', { userPassword: 'secret', ownerPassword: '' }),
				(error) => assertEngineUnavailable(error, 'Encrypt'),
			);
		},
	},
	{
		name: 'Decrypt throws a NodeOperationError explaining the qpdf-wasm blocker',
		fn: async () => {
			await assert.rejects(
				() => runSecureOp('decrypt', { password: 'secret' }),
				(error) => assertEngineUnavailable(error, 'Decrypt'),
			);
		},
	},
	{
		name: 'Set Permissions throws a NodeOperationError explaining the qpdf-wasm blocker',
		fn: async () => {
			await assert.rejects(
				() =>
					runSecureOp('setPermissions', {
						ownerPassword: 'secret',
						permissions: ['printing', 'copying'],
					}),
				(error) => assertEngineUnavailable(error, 'Set Permissions'),
			);
		},
	},
];
