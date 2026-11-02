export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
export const MAX_DOCUMENTS = 2;
const extensions = new Set(['pdf','docx','txt','md','csv']);

export function selectDocuments(files: File[], existing=0): {valid:File[], warnings:string[]} {
  const valid:File[]=[];
  const warnings:string[]=[];
  for (const file of files) {
    const extension=file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!extensions.has(extension)) {warnings.push(`${file.name}: expected PDF, DOCX, TXT, MD or CSV.`); continue;}
    if (file.size < 1 || file.size > MAX_DOCUMENT_BYTES) {warnings.push(`${file.name}: maximum size is 12 MiB.`);continue;}
    if (existing+valid.length >= MAX_DOCUMENTS) {warnings.push('Attach at most 2 documents.');break;}
    valid.push(file);
  }
  return {valid,warnings};
}
