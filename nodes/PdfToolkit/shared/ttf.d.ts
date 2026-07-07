/**
 * Lets tsc accept `import bytes from '.../SomeFont.ttf'` (used by
 * `shared/fonts.ts`). At runtime this import is resolved by esbuild's
 * `loader: { '.ttf': 'binary' }` (see `scripts/esbuild-bundle.mjs`), which
 * inlines the font file's bytes into the bundle as a base64 literal decoded
 * back into a `Uint8Array` default export — no filesystem access at
 * runtime, and nothing this declaration describes is itself published (only
 * `dist/` is, per `package.json`'s `files` field).
 */
declare module '*.ttf' {
	const bytes: Uint8Array;
	export default bytes;
}
