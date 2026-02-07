import { NextRequest, NextResponse } from "next/server";

/**
 * 画像プロキシAPI
 * CORS制限を回避するため、サーバーサイドで画像を取得してBase64で返す
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    // URLをデコード
    const decodedUrl = decodeURIComponent(url);

    // セキュリティ: 許可されたドメインのみ
    const allowedDomains = [
      "pub-0cca29708eec449fb17b0be4f5e43850.r2.dev",
      "r2.dev",
    ];
    const urlObj = new URL(decodedUrl);
    const isAllowed = allowedDomains.some(
      (domain) => urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      return NextResponse.json(
        { error: "Domain not allowed" },
        { status: 403 }
      );
    }

    // サーバーサイドで画像を取得
    const response = await fetch(decodedUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.status}` },
        { status: response.status }
      );
    }

    // ArrayBufferとして取得
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Content-Typeを取得
    const contentType = response.headers.get("content-type") || "image/png";

    // Base64に変換
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;

    return NextResponse.json({ dataUrl });
  } catch (error) {
    console.error("Image proxy error:", error);
    return NextResponse.json(
      { error: "Failed to proxy image" },
      { status: 500 }
    );
  }
}
