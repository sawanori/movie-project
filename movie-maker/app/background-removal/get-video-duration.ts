const METADATA_TIMEOUT_MS = 10 * 1000;

/** 切り離した <video> 要素のメタデータ読み込みで動画の尺を取得する */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error("動画の読み込みがタイムアウトしました。別のファイルをお試しください。"));
    }, METADATA_TIMEOUT_MS);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error("動画の読み込みに失敗しました。別のファイルをお試しください。"));
    };
    video.src = url;
  });
}
