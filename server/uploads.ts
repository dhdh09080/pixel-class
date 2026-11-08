export class UploadError extends Error {}
export const fileTypes: Record<string, string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  txt: 'text/plain',
  md: 'text/markdown',
};
export function validateUpload(fileName: string, encoded: string, office = false) {
  if (/[\x00-\x1f\x7f/\\]/.test(fileName))
    throw new UploadError('파일 이름에 경로나 제어 문자를 넣을 수 없어요.');
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (!fileTypes[extension] || (!office && ['pptx', 'docx', 'xlsx'].includes(extension)))
    throw new UploadError('지원하는 이미지, PDF 또는 문서 파일을 선택해 주세요.');
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new UploadError(
      '파일 내용을 읽지 못했어요. 빈 파일이 아닌지 확인하고 다시 선택해 주세요.',
    );
  const content = Buffer.from(encoded, 'base64');
  if (!content.length || content.toString('base64') !== encoded)
    throw new UploadError('파일 데이터가 올바르지 않아요. 다시 선택해 주세요.');
  if (content.length > 5 * 1024 * 1024) throw new UploadError('파일은 5MB 이하여야 해요.');
  const starts = (bytes: number[]) => bytes.every((byte, i) => content[i] === byte);
  let valid = true;
  if (extension === 'png') valid = starts([137, 80, 78, 71, 13, 10, 26, 10]);
  if (['jpg', 'jpeg'].includes(extension)) valid = starts([255, 216, 255]);
  if (extension === 'pdf') valid = content.subarray(0, 5).toString() === '%PDF-';
  if (extension === 'webp')
    valid =
      content.subarray(0, 4).toString() === 'RIFF' && content.subarray(8, 12).toString() === 'WEBP';
  if (['pptx', 'docx', 'xlsx'].includes(extension)) valid = starts([80, 75, 3, 4]);
  if (['txt', 'md'].includes(extension)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(content);
      valid = !content.includes(0);
    } catch {
      valid = false;
    }
  }
  if (!valid)
    throw new UploadError('확장자와 실제 파일 내용이 달라요. 원본 파일을 다시 확인해 주세요.');
  return { content, mime: fileTypes[extension] };
}
