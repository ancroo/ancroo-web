/** Upload progress display with progress bar and processing spinner. */
export function UploadProgressDisplay({
  progress,
  processing,
  fileName,
}: {
  progress: number | null;
  processing: boolean;
  fileName: string;
}) {
  return (
    <div class="text-center py-2">
      <div class="text-sm font-medium mb-1 truncate">{fileName}</div>
      {processing ? (
        <div class="text-xs text-amber-600">Processing...</div>
      ) : (
        <>
          <div class="w-full bg-gray-200 rounded-full h-2 mb-1">
            <div
              class="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
          <div class="text-xs text-gray-500">
            Uploading... {progress ?? 0}%
          </div>
        </>
      )}
    </div>
  );
}
