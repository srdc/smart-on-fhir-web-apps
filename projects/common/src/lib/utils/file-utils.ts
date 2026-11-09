/**
 * Browser file download helpers
 */
export class FileUtils {

  /** Save the given content as a file in the browser */
  public static download(content: string | Blob, fileName: string, mimeType = 'application/octet-stream') {
    const blob = content instanceof Blob ? content : new Blob([content], {type: mimeType});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Save the given object as a pretty-printed JSON file */
  public static downloadJson(data: unknown, fileName: string, mimeType = 'application/json') {
    FileUtils.download(JSON.stringify(data, null, 2), fileName, mimeType);
  }
}
