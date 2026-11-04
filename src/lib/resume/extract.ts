import "server-only";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** Text inside a PDF or DOCX, going by the file's contents. Empty when there's none, such as a scanned PDF. */
export async function extractResumeText(file: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(file);
  if (bytes.byteLength > MAX_RESUME_BYTES) return "";
  const signature = String.fromCharCode(...bytes.slice(0, 4));
  if (signature === "%PDF") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (signature.startsWith("PK")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(file) });
    return value;
  }
  return "";
}
