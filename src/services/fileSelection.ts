import { PickedFile } from './candidateServices';

/** Picker filters are hints; validate returned files without inventing a size limit. */
export function selectionProblem(file: PickedFile, images: boolean): string | undefined {
  const mime = (file.mimeType || file.file?.type || '').toLowerCase();
  const generic = !mime || mime === 'application/octet-stream';
  const allowed = images
    ? mime.startsWith('image/') ||
      (generic && /\.(png|jpe?g|gif|webp|heic|heif|avif|bmp|tiff?|svg)$/i.test(file.name))
    : /\.(pdf|docx?)$/i.test(file.name) &&
      (generic ||
        [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ].includes(mime));
  if (!allowed)
    return images
      ? 'Choose image files. Your previous selection has been kept.'
      : 'Choose a PDF, DOC or DOCX file. Your previous selection has been kept.';
  if ((file.size ?? file.file?.size) === 0) return 'This file is empty. Choose a file with content.';
  return undefined;
}
export function fileSize(file: PickedFile): string {
  const size = file.size ?? file.file?.size;
  if (size === undefined) return '';
  return size < 1024
    ? `${size} B`
    : size < 1048576
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1048576).toFixed(1)} MB`;
}
