import { inflateSync } from "node:zlib";

/**
 * Reads and checks a PNG or JPEG before it is used as an invoice logo (lib/invoice-settings-services.ts).
 *
 * The check is strict for a reason: pdfkit decodes a PNG that has transparency or interlacing asynchronously and
 * throws from inside that callback when the data is damaged, which would take the server process down instead of
 * failing one request. So a PNG is accepted only once its chunks, its checksums, its compressed data and the filter
 * byte of every scanline have been verified here; pdfkit then has nothing left to trip over. A JPEG is embedded as
 * it is, so its header is enough.
 */
export interface ImageInfo { type: "png" | "jpeg"; width: number; height: number }

/** Each side at most this many pixels: plenty for a logo, and it bounds the memory a PNG may expand to. */
export const MAX_IMAGE_SIDE = 2000;

export class ImageError extends Error {}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let crcTable: Uint32Array | undefined;
function crc32(buf: Buffer, start: number, end: number): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Bit depths allowed for each PNG colour type, and its number of channels. */
const PNG_TYPES: Record<number, { depths: number[]; channels: number }> = {
  0: { depths: [1, 2, 4, 8, 16], channels: 1 }, 2: { depths: [8, 16], channels: 3 }, 3: { depths: [1, 2, 4, 8], channels: 1 },
  4: { depths: [8, 16], channels: 2 }, 6: { depths: [8, 16], channels: 4 },
};
/** Adam7 passes: first column, first row, column step, row step. */
const ADAM7: ReadonlyArray<[number, number, number, number]> = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

function sideCheck(width: number, height: number) {
  if (!(width > 0) || !(height > 0)) throw new ImageError("The image has no size.");
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) throw new ImageError(`The image is ${width} × ${height} pixels; a logo may be at most ${MAX_IMAGE_SIDE} × ${MAX_IMAGE_SIDE}. Resize it and upload it again.`);
}

function readPng(buf: Buffer): ImageInfo {
  const damaged = () => new ImageError("This PNG file is damaged or incomplete. Save it again from an image editor and upload it.");
  let pos = PNG_SIGNATURE.length;
  let header: { width: number; height: number; depth: number; colorType: number; interlace: number } | undefined;
  let palette = false, ended = false;
  const data: Buffer[] = [];
  while (pos < buf.length) {
    if (pos + 12 > buf.length) throw damaged();
    const length = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const start = pos + 8, end = start + length;
    if (end + 4 > buf.length) throw damaged();
    if (crc32(buf, pos + 4, end) !== buf.readUInt32BE(end)) throw damaged();
    if (!header && type !== "IHDR") throw damaged();
    if (type === "IHDR") {
      if (header || length !== 13) throw damaged();
      header = { width: buf.readUInt32BE(start), height: buf.readUInt32BE(start + 4), depth: buf[start + 8], colorType: buf[start + 9], interlace: buf[start + 12] };
      const kind = PNG_TYPES[header.colorType];
      if (!kind || !kind.depths.includes(header.depth) || buf[start + 10] !== 0 || buf[start + 11] !== 0 || header.interlace > 1) throw damaged();
      sideCheck(header.width, header.height);
    } else if (type === "PLTE") {
      if (length === 0 || length % 3 !== 0 || length > 768) throw damaged();
      palette = true;
    } else if (type === "IDAT") {
      data.push(buf.subarray(start, end));
    } else if (type === "IEND") {
      ended = true;
      break;
    }
    pos = end + 4;
  }
  if (!header || !ended || data.length === 0) throw damaged();
  if (header.colorType === 3 && !palette) throw damaged();
  const bitsPerPixel = PNG_TYPES[header.colorType].channels * header.depth;
  const rowBytes = (w: number) => Math.ceil((w * bitsPerPixel) / 8);
  // Scanlines as (count, bytes each); every one is preceded by its filter byte.
  const passes: Array<[number, number]> = [];
  if (header.interlace === 0) passes.push([header.height, rowBytes(header.width)]);
  else {
    for (const [x0, y0, dx, dy] of ADAM7) {
      const w = Math.ceil((header.width - x0) / dx), h = Math.ceil((header.height - y0) / dy);
      if (w > 0 && h > 0) passes.push([h, rowBytes(w)]);
    }
  }
  const expected = passes.reduce((s, [rows, bytes]) => s + rows * (1 + bytes), 0);
  let raw: Buffer;
  try { raw = inflateSync(Buffer.concat(data), { maxOutputLength: expected + 1 }); } catch { throw damaged(); }
  if (raw.length !== expected) throw damaged();
  let at = 0;
  for (const [rows, bytes] of passes) {
    for (let r = 0; r < rows; r++) {
      if (raw[at] > 4) throw damaged();
      at += 1 + bytes;
    }
  }
  return { type: "png", width: header.width, height: header.height };
}

function readJpeg(buf: Buffer): ImageInfo {
  const damaged = () => new ImageError("This JPG file is damaged or incomplete. Save it again from an image editor and upload it.");
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) throw damaged();
    const marker = buf[pos + 1];
    if (marker === 0xff) { pos++; continue; } // fill byte
    if (marker === 0xd9 || marker === 0xda) break; // end of image, or the scan starts before any frame header
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; } // markers without a length
    const length = buf.readUInt16BE(pos + 2);
    if (length < 2 || pos + 2 + length > buf.length) throw damaged();
    // Start of frame: every SOFn except the tables that share the range (DHT C4, JPG C8, DAC CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (length < 8) throw damaged();
      const height = buf.readUInt16BE(pos + 5), width = buf.readUInt16BE(pos + 7), channels = buf[pos + 9];
      if (![1, 3, 4].includes(channels)) throw damaged();
      sideCheck(width, height);
      return { type: "jpeg", width, height };
    }
    pos += 2 + length;
  }
  throw damaged();
}

/** The format and pixel size of a PNG or JPEG; throws `ImageError` with a message for the user when the file is neither, is damaged, or is too large. */
export function readImageInfo(buf: Buffer): ImageInfo {
  if (buf.length >= PNG_SIGNATURE.length && buf.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return readPng(buf);
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) return readJpeg(buf);
  throw new ImageError("The logo must be a PNG or JPG image.");
}
