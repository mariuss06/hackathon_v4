/**
 * Minimal ZIP reader for RO e-Factura archives (SPV "descărcare": <id>.xml + semnatura_<id>.xml).
 * Reads the central directory, supports "stored" (0) and "deflate" (8) entries. The raw-deflate
 * decoder is injected so the same code runs in the browser (DecompressionStream) and on the
 * server (zlib.inflateRawSync).
 */

export type InflateRaw = (data: Uint8Array) => Promise<Uint8Array>;

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const SIG_EOCD = 0x06054b50;
const SIG_CD = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export async function readZip(bytes: Uint8Array, inflateRaw: InflateRaw): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Fișierul nu este o arhivă ZIP validă.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== SIG_CD) throw new Error("Arhivă ZIP coruptă (director central).");
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (view.getUint32(local, true) !== SIG_LOCAL) throw new Error(`Arhivă ZIP coruptă (${name}).`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + compSize);
    if (method === 0) entries.push({ name, data: raw });
    else if (method === 8) entries.push({ name, data: await inflateRaw(raw) });
    else throw new Error(`Metodă de compresie nesuportată (${method}) pentru ${name}.`);
  }
  return entries;
}

/** Browser raw-deflate via the native DecompressionStream. */
export const browserInflateRaw: InflateRaw = async (data) => {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** The invoice XML files of an e-Factura archive (signature files `semnatura_*.xml` are skipped). */
export async function invoiceXmlFromZip(bytes: Uint8Array, inflateRaw: InflateRaw, zipName = "arhiva.zip") {
  const decoder = new TextDecoder();
  const out: { name: string; xml: string }[] = [];
  for (const e of await readZip(bytes, inflateRaw)) {
    const base = e.name.split("/").pop() ?? e.name;
    const lower = base.toLowerCase();
    // SPV web downloads one ZIP per invoice: an archive of archives is read recursively.
    if (lower.endsWith(".zip")) {
      out.push(...(await invoiceXmlFromZip(e.data, inflateRaw, base)));
      continue;
    }
    if (!lower.endsWith(".xml") || lower.startsWith("semnatura")) continue;
    out.push({ name: `${zipName.replace(/\.zip$/i, "")}/${base}`, xml: decoder.decode(e.data) });
  }
  return out;
}
