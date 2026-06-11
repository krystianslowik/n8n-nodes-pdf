import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

/**
 * The shape every per-operation `*Execute` function in `resources/**` has for
 * the common **itemwise** case: exactly one input item in, exactly one output
 * item out. `PdfToolkit.node.ts` looks these up (by resource, then operation)
 * in the `executeMap` that each `resources/<resource>/index.ts` exports,
 * after resolving the item's binary input (if the operation needs one).
 */
export type OperationExecuteFunction = (
	this: IExecuteFunctions,
	itemIndex: number,
) => Promise<INodeExecutionData>;

/**
 * Per-resource map of operation value -> itemwise execute function.
 */
export type ExecuteMap = Record<string, OperationExecuteFunction>;

/**
 * Execute function shape for operations with **many-to-one** cardinality:
 * they consume ALL incoming items in a single call (not one call per item)
 * and produce exactly one output item. This is what Document > Merge needs
 * (PRD §5 UX principles: "Batch-aware: ... merge N items → 1") — a per-item
 * loop cannot express "combine every item into one output", so
 * `PdfToolkit.node.ts` dispatches operations registered in a
 * `ManyToOneExecuteMap` once per node execution, before the itemwise loop,
 * instead of once per item.
 */
export type ManyToOneExecuteFunction = (
	this: IExecuteFunctions,
	items: INodeExecutionData[],
) => Promise<INodeExecutionData>;

/**
 * Per-resource map of operation value -> many-to-one execute function.
 */
export type ManyToOneExecuteMap = Record<string, ManyToOneExecuteFunction>;

/**
 * Execute function shape for operations with **one-to-many** cardinality:
 * each call still consumes exactly one input item (so the normal per-item
 * binary-assertion pre-check still applies), but produces zero or more
 * output items instead of exactly one. This is what Document > Split needs
 * (PRD §5 UX principles: "Batch-aware: ... split 1 → N items") —
 * `PdfToolkit.node.ts` dispatches operations registered in a
 * `OneToManyExecuteMap` inside the itemwise loop, pushing every item the
 * call returns (instead of assuming exactly one).
 */
export type OneToManyExecuteFunction = (
	this: IExecuteFunctions,
	itemIndex: number,
) => Promise<INodeExecutionData[]>;

/**
 * Per-resource map of operation value -> one-to-many execute function.
 */
export type OneToManyExecuteMap = Record<string, OneToManyExecuteFunction>;

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
