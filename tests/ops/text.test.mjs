/**
 * Extract > Text: pdfjs-dist (the library this op would need) was genuinely
 * attempted and rejected for this package (see spike/FINDINGS.md
 * "Q4 — pdfjs-dist bundling"). This test asserts the thrown error explains WHY
 * (names the blocking engine and points at the evaluation), the same
 * error-quality bar the Secure stubs already meet, not just a bare
 * "not implemented yet" — regression test for the audit finding that this
 * stub used the generic `throwNotImplemented` instead of
 * `throwEngineUnavailable`.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, itemWithPdf } from '../mock-execute.mjs';
import { makePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { NodeOperationError } = require('n8n-workflow');

export const tests = [
	{
		name: 'Text throws a NodeOperationError explaining the pdfjs-dist blocker (not a bare "not implemented")',
		fn: async () => {
			const pdf = await makePdf(2);
			const items = [itemWithPdf(pdf)];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'extract',
				operation: 'text',
				binaryPropertyName: 'data',
				options: {},
			});

			await assert.rejects(
				() => createPdfToolkitInstance().execute.call(mockThis),
				(error) => {
					assert.ok(error instanceof NodeOperationError, `expected a NodeOperationError, got ${error}`);
					assert.ok(
						error.message.includes('The "Text" operation is not available'),
						`expected message to name the operation and say it's unavailable (not just "not ` +
							`implemented yet"), got: ${error.message}`,
					);
					assert.ok(
						/pdfjs-dist/i.test(error.message),
						`expected message to name the blocking engine (pdfjs-dist), got: ${error.message}`,
					);
					assert.ok(
						/FINDINGS\.md/.test(error.message),
						`expected message to point at the written-up evaluation, got: ${error.message}`,
					);
					assert.equal(error.context?.itemIndex, 0, 'expected the error to carry itemIndex for continueOnFail()');
					return true;
				},
			);
		},
	},
];
