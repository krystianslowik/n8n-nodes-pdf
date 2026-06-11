import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

/**
 * The shape every per-operation `*Execute` function in `resources/**` has.
 * `PdfToolkit.node.ts` looks these up (by resource, then operation) in the
 * `executeMap` that each `resources/<resource>/index.ts` exports, after
 * resolving the item's binary input (if the operation needs one).
 */
export type OperationExecuteFunction = (
	this: IExecuteFunctions,
	itemIndex: number,
) => Promise<INodeExecutionData>;

/**
 * Per-resource map of operation value -> execute function.
 */
export type ExecuteMap = Record<string, OperationExecuteFunction>;

/**
 * Per-resource map of operation value -> name of the parameter that holds
 * the input binary property name (or `undefined` if the operation doesn't
 * consume a PDF binary, e.g. Generate > From Template / From Markdown, which
 * only take JSON/string parameters and produce binary output instead).
 *
 * `PdfToolkit.node.ts`'s `execute()` uses this to call
 * `this.helpers.assertBinaryData()` *before* invoking the operation's stub,
 * per the scaffold spec.
 */
export type BinaryInputParamMap = Record<string, string | undefined>;
