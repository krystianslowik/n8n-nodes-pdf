/**
 * Test-PDF generators, built with the bundled pdf-lib itself (same library
 * the dist build inlines — see `spike/harness.mjs`, which this generalizes).
 */
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

/** A plain N-page PDF, each page annotated with a text label. */
export async function makePdf(pageCount, label = 'Doc') {
	const pdf = await PDFDocument.create();
	const font = await pdf.embedFont('Helvetica');
	for (let i = 0; i < pageCount; i++) {
		const page = pdf.addPage([300, 200]);
		page.drawText(`${label} — page ${i + 1}/${pageCount}`, { x: 20, y: 100, size: 12, font });
	}
	return Buffer.from(await pdf.save());
}

/**
 * An N-page PDF where each page has a DIFFERENT width (100 + 10*pageNumber),
 * so a page's original 1-indexed position can be recovered from the output
 * of a page-reordering/deleting operation just by reading back its width —
 * no text-extraction library needed to verify semantics like "page order"
 * or "which pages survived a delete".
 */
export async function makeDistinguishablePdf(pageCount) {
	const pdf = await PDFDocument.create();
	for (let i = 0; i < pageCount; i++) {
		pdf.addPage([100 + (i + 1) * 10, 200]);
	}
	return Buffer.from(await pdf.save());
}

/** Reads back the 1-indexed original page number from a page's width. */
export function pageNumberFromWidth(width) {
	return Math.round((width - 100) / 10);
}

/**
 * A tiny (1x1, red) PNG, built by hand (no image-encoding library available):
 * a minimal valid PNG stream (signature + IHDR + IDAT + IEND chunks), each
 * with a real CRC32 so pdf-lib's PNG decoder (which validates chunk CRCs)
 * accepts it. Good enough for Stamp > Image Watermark tests, which only need
 * `pdf.embedPng()` to succeed and the image to be drawn — not any particular
 * visual content.
 */
export function makeTinyPng() {
	const crcTable = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		crcTable[n] = c;
	}
	function crc32(buf) {
		let crc = 0xffffffff;
		for (const byte of buf) {
			crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
		}
		return (crc ^ 0xffffffff) >>> 0;
	}

	function chunk(type, data) {
		const typeBuf = Buffer.from(type, 'ascii');
		const lengthBuf = Buffer.alloc(4);
		lengthBuf.writeUInt32BE(data.length, 0);
		const crcBuf = Buffer.alloc(4);
		crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
		return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
	}

	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

	const ihdrData = Buffer.alloc(13);
	ihdrData.writeUInt32BE(1, 0); // width
	ihdrData.writeUInt32BE(1, 4); // height
	ihdrData.writeUInt8(8, 8); // bit depth
	ihdrData.writeUInt8(2, 9); // color type: RGB
	ihdrData.writeUInt8(0, 10); // compression
	ihdrData.writeUInt8(0, 11); // filter
	ihdrData.writeUInt8(0, 12); // interlace
	const ihdr = chunk('IHDR', ihdrData);

	// One scanline: filter byte (0 = none) + 1 red pixel (R,G,B).
	const raw = Buffer.from([0, 255, 0, 0]);
	const idat = chunk('IDAT', deflateSync(raw));

	const iend = chunk('IEND', Buffer.alloc(0));

	return Buffer.concat([signature, ihdr, idat, iend]);
}

// A committed tiny (4x4) baseline JPEG fixture, per this group's task scope
// ("committed tiny fixtures where generation can't produce the needed
// feature"): unlike PNG (simple DEFLATE + CRC32, hand-built above), a
// byte-correct baseline JPEG needs a real DCT + Huffman encoder, which is
// out of scope to write from scratch here. Generated once with macOS's
// built-in `sips` (`sips -s format jpeg tiny.png --out tiny.jpg`, where
// `tiny.png` was the hand-built PNG above), then base64-inlined so this
// fixture is deterministic and has no build-time/runtime dependency on
// `sips` or any other external tool. Used by
// `tests/ops/embeddedImages.test.mjs` (DCTDecode is the one image filter
// this operation supports — see that op's module doc comment).
const TINY_JPG_BASE64 =
	'/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAABKADAAQAAAABAAAABAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgABAAEAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z';

/**
 * A small (4x4) baseline JPEG, decoded fresh from `TINY_JPG_BASE64` each
 * call. `Buffer.from(base64String, 'base64')` allocates from Node's shared
 * buffer pool for small sizes like this one — the returned `Buffer`'s
 * `byteOffset` into its underlying `ArrayBuffer` is NONZERO (verified
 * empirically). That matters here because pdf-lib's `embedJpg()` does `new
 * DataView(jpgBytes.buffer)`, which reads from byte 0 of the underlying
 * `ArrayBuffer` and completely ignores `byteOffset` — silently misreading a
 * pooled buffer's JPEG header and throwing "SOI not found in JPEG" (also
 * verified empirically). `ArrayBuffer.prototype.slice()` always copies into
 * a brand-new, standalone `ArrayBuffer` starting at 0, which is what
 * sidesteps that bug.
 */
export function makeTinyJpg() {
	const pooled = Buffer.from(TINY_JPG_BASE64, 'base64');
	return Buffer.from(pooled.buffer.slice(pooled.byteOffset, pooled.byteOffset + pooled.length));
}
