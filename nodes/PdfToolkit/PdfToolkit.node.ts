import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	documentBinaryInputParamMap,
	documentDescription,
	documentExecuteMap,
} from './resources/document';
import { extractBinaryInputParamMap, extractDescription, extractExecuteMap } from './resources/extract';
import { formBinaryInputParamMap, formDescription, formExecuteMap } from './resources/form';
import {
	generateBinaryInputParamMap,
	generateDescription,
	generateExecuteMap,
} from './resources/generate';
import { secureBinaryInputParamMap, secureDescription, secureExecuteMap } from './resources/secure';
import { stampBinaryInputParamMap, stampDescription, stampExecuteMap } from './resources/stamp';
import type { BinaryInputParamMap, ExecuteMap } from './shared/types';

const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Document', value: 'document' },
		{ name: 'Extract', value: 'extract' },
		{ name: 'Form', value: 'form' },
		{ name: 'Generate', value: 'generate' },
		{ name: 'Secure', value: 'secure' },
		{ name: 'Stamp', value: 'stamp' },
	],
	default: 'document',
};

// One execute map / binary-input map per resource. Keeping these next to the
// node class (rather than inside each `resources/<resource>/index.ts`) would
// also work, but centralizing the resource -> map wiring here keeps
// `execute()` the single place that needs to know about all six resources.
const executeMaps: Record<string, ExecuteMap> = {
	document: documentExecuteMap,
	generate: generateExecuteMap,
	form: formExecuteMap,
	stamp: stampExecuteMap,
	extract: extractExecuteMap,
	secure: secureExecuteMap,
};

const binaryInputParamMaps: Record<string, BinaryInputParamMap> = {
	document: documentBinaryInputParamMap,
	generate: generateBinaryInputParamMap,
	form: formBinaryInputParamMap,
	stamp: stampBinaryInputParamMap,
	extract: extractBinaryInputParamMap,
	secure: secureBinaryInputParamMap,
};

export class PdfToolkit implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PDF Toolkit',
		name: 'pdfToolkit',
		icon: { light: 'file:pdfToolkit.svg', dark: 'file:pdfToolkit.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Merge, split, generate, fill, stamp, extract from, and secure PDF files — entirely in-process, no external services',
		defaults: {
			name: 'PDF Toolkit',
		},
		// Note: this node works heavily with binary data (PDF files), which AI
		// Agent tools generally don't support well. `usableAsTool: true` is set
		// per n8n's community-nodes lint rule default recommendation; revisit
		// once real PDF logic (and thus real limitations) exist.
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			resourceProperty,
			...documentDescription,
			...generateDescription,
			...formDescription,
			...stampDescription,
			...extractDescription,
			...secureDescription,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				// Resolve (and validate) the binary input BEFORE calling the
				// operation's stub, per the scaffold spec. This throws a clear,
				// operation-naming error if the configured binary field is missing
				// on this item, instead of letting a stub fail later with a less
				// helpful message.
				const binaryParamName = binaryInputParamMaps[resource]?.[operation];
				if (binaryParamName) {
					const binaryPropertyName = this.getNodeParameter(
						binaryParamName,
						itemIndex,
						'data',
					) as string;
					this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
				}

				const executeOperation = executeMaps[resource]?.[operation];
				if (!executeOperation) {
					throw new NodeOperationError(
						this.getNode(),
						`Unknown operation "${operation}" for resource "${resource}"`,
						{ itemIndex },
					);
				}

				returnData.push(await executeOperation.call(this, itemIndex));
			} catch (error) {
				// Every operation body in this scaffold is a stub (see
				// `resources/**`), so this branch is expected to run for every
				// item until the operations are implemented (PRD open question O1).
				if (this.continueOnFail()) {
					returnData.push({
						json: this.getInputData(itemIndex)[0].json,
						error,
						pairedItem: itemIndex,
					});
					continue;
				}

				// Always re-wrap in a NodeOperationError (rather than re-throwing a
				// raw error) so downstream error-workflows get a consistent,
				// itemIndex-tagged n8n error shape.
				throw new NodeOperationError(this.getNode(), error, {
					itemIndex,
				});
			}
		}

		return [returnData];
	}
}
