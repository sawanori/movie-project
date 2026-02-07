/**
 * 画像URLをBase64データURLに変換
 * @react-pdf/rendererでCORS問題を回避するために使用
 *
 * R2などCORS制限のある外部URLはプロキシAPIを経由して取得
 */
export async function imageUrlToBase64(url: string): Promise<string | null> {
  if (!url) return null;

  try {
    // 既にData URLの場合はそのまま返す
    if (url.startsWith("data:")) {
      return url;
    }

    // R2ドメインの場合はプロキシAPIを使用（CORS回避）
    if (url.includes("r2.dev")) {
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        console.warn(`Proxy failed for: ${url}`, response.status);
        return null;
      }

      const data = await response.json();
      return data.dataUrl || null;
    }

    // その他のURLは直接fetch
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
    });

    if (!response.ok) {
      console.warn(`Failed to fetch image: ${url}`, response.status);
      return null;
    }

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        console.warn(`Failed to read image blob: ${url}`);
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn(`Failed to convert image to base64: ${url}`, error);
    return null;
  }
}

/**
 * 複数の画像URLを並列でBase64に変換
 */
export async function preloadImagesAsBase64(
  urls: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const validUrls = urls.filter((url): url is string => !!url);

  const promises = validUrls.map(async (url) => {
    const base64 = await imageUrlToBase64(url);
    if (base64) {
      results.set(url, base64);
    }
  });

  await Promise.all(promises);
  return results;
}
