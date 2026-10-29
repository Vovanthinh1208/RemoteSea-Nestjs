import { deflateRawSync } from "node:zlib";
import { extractDocxText, isZipBuffer } from "./docx-text.util";

// Minimal ZIP writer (local headers + central directory + EOCD) — enough to
// build the .docx shape the extractor reads, without a zip dependency.
const buildZip = (
  entries: { name: string; data: string; deflate?: boolean }[],
): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const raw = Buffer.from(entry.data, "utf8");
    const body = entry.deflate === false ? raw : deflateRawSync(raw);
    const method = entry.deflate === false ? 0 : 8;
    const name = Buffer.from(entry.name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
};

const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Nguyễn Văn A</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Senior Engineer </w:t></w:r><w:r><w:t>&amp; Tech Lead</w:t></w:r></w:p>
<w:p><w:r><w:t>Skills:</w:t><w:tab/><w:t>TypeScript, Go</w:t></w:r></w:p>
</w:body></w:document>`;

describe("extractDocxText (PB53 / PB66 Word CVs)", () => {
  it("reads paragraph text from word/document.xml", () => {
    const docx = buildZip([
      { name: "[Content_Types].xml", data: "<Types/>" },
      { name: "word/document.xml", data: documentXml },
    ]);

    expect(isZipBuffer(docx)).toBe(true);
    expect(extractDocxText(docx)).toBe(
      "Nguyễn Văn A\nSenior Engineer & Tech Lead\nSkills:\tTypeScript, Go",
    );
  });

  it("also reads a stored (uncompressed) entry", () => {
    const docx = buildZip([
      { name: "word/document.xml", data: documentXml, deflate: false },
    ]);
    expect(extractDocxText(docx)).toContain("Nguyễn Văn A");
  });

  it("returns null for a ZIP without a Word body, or a non-ZIP buffer", () => {
    expect(
      extractDocxText(buildZip([{ name: "other.txt", data: "hello" }])),
    ).toBeNull();
    expect(isZipBuffer(Buffer.from("%PDF-1.7"))).toBe(false);
    expect(extractDocxText(Buffer.from("not a zip at all"))).toBeNull();
  });
});
