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
	documentManyToOneExecuteMap,
	documentOneToManyExecuteMap,
} from './resources/document';
import {
	extractBinaryInputParamMap,
	extractDescription,
	extractExecuteMap,
} from './resources/extract';
import { formBinaryInputParamMap, formDescription, formExecuteMap } from './resources/form';
import {
	generateBinaryInputParamMap,
	generateDescription,
	generateExecuteMap,
	generateManyToOneExecuteMap,
} from './resources/generate';
import { secureBinaryInputParamMap, secureDescription, secureExecuteMap } from './resources/secure';
import { stampBinaryInputParamMap, stampDescription, stampExecuteMap } from './resources/stamp';
import type {
	BinaryInputParamMap,
	ExecuteMap,
	ManyToOneExecuteMap,
	OneToManyExecuteMap,
} from './shared/types';

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

// Many-to-one (e.g. Document > Merge: N incoming items → 1 output item, or
// Generate > From Images: N incoming image items → 1 combined multi-page PDF
// — PRD F7) and one-to-many (e.g. Document > Split: 1 incoming item → N
// output items) operations. Every resource is wired here so a future
// resource can register one without touching `execute()` again. See
// `shared/types.ts` for why itemwise per-item calls can't express either
// cardinality.
const manyToOneExecuteMaps: Record<string, ManyToOneExecuteMap> = {
	document: documentManyToOneExecuteMap,
	generate: generateManyToOneExecuteMap,
};

const oneToManyExecuteMaps: Record<string, OneToManyExecuteMap> = {
	document: documentOneToManyExecuteMap,
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

		if (items.length === 0) {
			return [returnData];
		}

		// `resource` and `operation` are plain dropdowns with `noDataExpression:
		// true` (see `resourceProperty` above and every `*Operations` property
		// in `resources/**/index.ts`), so their value can't vary per item via an
		// expression — it's safe (and the standard n8n idiom) to read them once
		// from item 0 to decide whether this execution is many-to-one, rather
		// than re-reading them on every loop iteration.
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const manyToOneExecute = manyToOneExecuteMaps[resource]?.[operation];
		if (manyToOneExecute) {
			// Many-to-one cardinality (e.g. Document > Merge — PRD: "Batch-aware:
			// ... merge N items → 1"): call once for every incoming item, not
			// once per item. There's no single failing item to blame, so on
			// error we tag every input item as the `pairedItem` source instead of
			// a single `itemIndex`.
			try {
				returnData.push(await manyToOneExecute.call(this, items));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {},
						error,
						pairedItem: items.map((_item, itemIndex) => ({ item: itemIndex })),
					});
				} else {
					throw error instanceof NodeOperationError
						? error
						: new NodeOperationError(this.getNode(), error as Error);
				}
			}
			return [returnData];
		}

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
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

				const oneToManyExecute = oneToManyExecuteMaps[resource]?.[operation];
				if (oneToManyExecute) {
					// One-to-many cardinality (e.g. Document > Split — PRD:
					// "Batch-aware: ... split 1 → N items"): still one input item
					// per call, but push every output item the call returns instead
					// of assuming exactly one.
					returnData.push(...(await oneToManyExecute.call(this, itemIndex)));
					continue;
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
