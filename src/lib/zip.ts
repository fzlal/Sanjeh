export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

export interface ZipArchive {
  entries: Map<string, Uint8Array>;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const MAX_ENTRY_COUNT = 65_535;
const MAX_U32 = 0xffff_ffff;
const UTF8_FLAG = 0x0800;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function dosDateTime(now: Date): { time: number; date: number } {
  const year = Math.max(1980, Math.min(2107, now.getFullYear()));
  return {
    time:
      (now.getHours() << 11) |
      (now.getMinutes() << 5) |
      Math.floor(now.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
  };
}

function assertEntryName(name: string): void {
  const segments = name.split('/');
  const invalid =
    name.length === 0 ||
    name.startsWith('/') ||
    name.includes('\\') ||
    segments.some((segment) => segment === '..' || segment === '');
  if (invalid) throw new Error(`Invalid ZIP entry name: ${name}`);
}

/**
 * Writes a plain, store-only ZIP archive. PDFs are already compressed, so no
 * deflate step is needed and every entry stays byte-for-byte inspectable.
 */
export function createZip(entries: ZipEntryInput[], now = new Date()): Uint8Array<ArrayBuffer> {
  if (entries.length === 0) throw new Error('A ZIP archive needs at least one entry.');
  if (entries.length > MAX_ENTRY_COUNT) throw new Error('Too many ZIP entries.');
  const names = new Set<string>();
  const { time, date } = dosDateTime(now);
  let localSize = 0;
  let centralSize = 0;
  const prepared = entries.map((entry) => {
    assertEntryName(entry.name);
    if (names.has(entry.name)) throw new Error(`Duplicate ZIP entry: ${entry.name}`);
    names.add(entry.name);
    if (entry.data.length > MAX_U32) throw new Error('A ZIP entry is too large.');
    const name = new TextEncoder().encode(entry.name);
    localSize += 30 + name.length + entry.data.length;
    centralSize += 46 + name.length;
    return { ...entry, name, crc: crc32(entry.data) };
  });
  const totalSize = localSize + centralSize + 22;
  if (totalSize > MAX_U32) throw new Error('The ZIP archive is too large.');

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let offset = 0;
  const offsets: number[] = [];

  for (const entry of prepared) {
    offsets.push(offset);
    view.setUint32(offset, LOCAL_SIGNATURE, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, UTF8_FLAG, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, time, true);
    view.setUint16(offset + 12, date, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.data.length, true);
    view.setUint32(offset + 22, entry.data.length, true);
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true);
    offset += 30;
    output.set(entry.name, offset);
    offset += entry.name.length;
    output.set(entry.data, offset);
    offset += entry.data.length;
  }

  const centralStart = offset;
  prepared.forEach((entry, index) => {
    view.setUint32(offset, CENTRAL_SIGNATURE, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, UTF8_FLAG, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, time, true);
    view.setUint16(offset + 14, date, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.data.length, true);
    view.setUint16(offset + 28, entry.name.length, true);
    view.setUint16(offset + 30, 0, true);
    view.setUint16(offset + 32, 0, true);
    view.setUint16(offset + 34, 0, true);
    view.setUint16(offset + 36, 0, true);
    view.setUint32(offset + 38, 0, true);
    view.setUint32(offset + 42, offsets[index], true);
    offset += 46;
    output.set(entry.name, offset);
    offset += entry.name.length;
  });

  view.setUint32(offset, END_SIGNATURE, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true);
  return output;
}

function findEndOffset(bytes: Uint8Array, view: DataView): number {
  const minimum = Math.max(0, bytes.length - 22 - 65_535);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) !== END_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === bytes.length) return offset;
  }
  throw new Error('This file is not a readable ZIP archive.');
}

export function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06)
  );
}

/** Reads a store-only ZIP archive and verifies every entry's CRC. */
export function readZip(bytes: Uint8Array): ZipArchive {
  if (bytes.length < 22) throw new Error('This file is not a readable ZIP archive.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOffset(bytes, view);
  if (
    view.getUint16(endOffset + 4, true) !== 0 ||
    view.getUint16(endOffset + 6, true) !== 0
  ) {
    throw new Error('Multi-volume ZIP archives are not supported.');
  }
  const count = view.getUint16(endOffset + 8, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (centralOffset + centralSize > bytes.length) {
    throw new Error('The ZIP central directory is out of bounds.');
  }

  const entries = new Map<string, Uint8Array>();
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error('The ZIP central directory is damaged.');
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if (flags & 0x1) throw new Error('Encrypted ZIP entries are not supported.');
    if (method !== 0) throw new Error('Only uncompressed ZIP entries are supported.');
    if (compressedSize !== size) throw new Error('A ZIP entry has inconsistent sizes.');
    if (offset + 46 + nameLength + extraLength + commentLength > bytes.length) {
      throw new Error('The ZIP central directory is damaged.');
    }
    let name: string;
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(
        bytes.subarray(offset + 46, offset + 46 + nameLength),
      );
    } catch {
      throw new Error('A ZIP entry name is not valid UTF-8.');
    }
    if (entries.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
    if (
      localOffset + 30 > bytes.length ||
      view.getUint32(localOffset, true) !== LOCAL_SIGNATURE
    ) {
      throw new Error('A ZIP entry is missing its local header.');
    }
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    if (localFlags & 0x1 || localMethod !== 0) {
      throw new Error('Only plain ZIP entries are supported.');
    }
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + size > bytes.length) {
      throw new Error('A ZIP entry is out of bounds.');
    }
    const data = bytes.subarray(dataOffset, dataOffset + size);
    if (crc32(data) !== crc) throw new Error(`ZIP entry ${name} failed its checksum.`);
    entries.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return { entries };
}
