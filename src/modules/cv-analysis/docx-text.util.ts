import { inflateRawSync } from "node:zlib";

// PB53/PB66: CVs may be Word (.docx) as well as PDF. A .docx is a ZIP archive
// whose body text lives in word/document.xml — reading just that one entry
// through the central directory needs nothing beyond node:zlib, so no new
// parsing dependency is pulled in for it.

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIR = 0x06054b50;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const DOCUMENT_ENTRY = "word/document.xml";
// Guards against a zip bomb: document.xml for even a long CV is a few hundred KB.
const MAX_INFLATED_BYTES = 20 * 1024 * 1024;

export const isZipBuffer = (buffer: Buffer): boolean =>
  buffer.length >= 4 && buffer.readUInt32LE(0) === ZIP_LOCAL_HEADER;

const findEndOfCentralDirectory = (buffer: Buffer): number => {
  // The EOCD record is 22 bytes plus an optional comment of up to 64 KB.
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === ZIP_END_OF_CENTRAL_DIR) return i;
  }
  return -1;
};

const readEntry = (buffer: Buffer, name: string): Buffer | null => {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return null;
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < entryCount; i++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== ZIP_CENTRAL_HEADER
    ) {
      return null;
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const entryName = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");

    if (entryName === name) {
      if (uncompressedSize > MAX_INFLATED_BYTES) return null;
      if (
        localOffset + 30 > buffer.length ||
        buffer.readUInt32LE(localOffset) !== ZIP_LOCAL_HEADER
      ) {
        return null;
      }
      const dataStart =
        localOffset +
        30 +
        buffer.readUInt16LE(localOffset + 26) +
        buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === METHOD_STORED) return data;
      if (method === METHOD_DEFLATE) {
        return inflateRawSync(data, { maxOutputLength: MAX_INFLATED_BYTES });
      }
      return null;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
};

const decodeXmlEntities = (text: string): string =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&");

/** Plain text of a .docx body, or null when the buffer isn't a readable .docx. */
export const extractDocxText = (buffer: Buffer): string | null => {
  let xml: string;
  try {
    const entry = readEntry(buffer, DOCUMENT_ENTRY);
    if (!entry) return null;
    xml = entry.toString("utf8");
  } catch {
    return null;
  }

  const text = xml
    // Raw newlines in the XML are formatting, not content — Word's own line
    // breaks are the paragraph/break elements handled next.
    .replace(/[\r\n]+/g, "")
    // Paragraph and line breaks become newlines, tabs stay tabs.
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:(br|cr)\b[^>]*\/>/g, "\n")
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<[^>]+>/g, "");
  return decodeXmlEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};
