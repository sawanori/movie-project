import { Font } from "@react-pdf/renderer";

let fontsRegistered = false;

/**
 * Noto Sans JP フォントを登録
 * モジュール読み込み時に1回だけ呼び出すこと
 */
export function registerFonts(): void {
  if (fontsRegistered) return;

  try {
    // Google Fonts CDN経由でNoto Sans JPを取得（TTF形式）
    // このURLはGoogle Fontsから直接取得した静的TTFファイル
    Font.register({
      family: "NotoSansJP",
      src: "https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf",
    });

    fontsRegistered = true;
    console.log("Fonts registered successfully");
  } catch (error) {
    console.error("Font registration failed:", error);
  }
}
