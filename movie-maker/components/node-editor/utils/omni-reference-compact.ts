import type { OmniReferenceNodeData, OmniReferenceSlot } from '@/lib/types/node-editor';

/**
 * Compact 後の単一スロット表現。
 * 元の slot index (0..7) は保持せず、compact 後の配列 index = ordinal - 1 となる。
 */
export interface CompactedSlot {
  assetId: string;
  filename: string;
  durationSeconds?: number;
}

/**
 * OmniReferenceNodeData の各 slot を空 slot を除去した連続配列で返した結果。
 */
export interface CompactedOmniReferences {
  videoUrls: CompactedSlot[];
  audioUrls: CompactedSlot[];
  imageUrls: CompactedSlot[];
}

/**
 * OmniReferenceNodeData の各 slot 配列から空 slot (assetId 未設定) を除去し、
 * 残った要素を 0-indexed の連続配列として返す。
 *
 * 戻り値の **index + 1** が、PiAPI Seedance に送信される
 * `@video{N}` / `@audio{N}` / `@image{N}` の N と一致する。
 *
 * 画像については base 画像 (ImageInputNode 由来) を呼び出し側で先頭に prepend する。
 * 本 helper は OmniRef 内 slot だけを扱う。
 */
export function compactOmniReferences(
  omniData: OmniReferenceNodeData
): CompactedOmniReferences {
  const compactSlots = (slots: OmniReferenceSlot[]): CompactedSlot[] =>
    slots
      .filter((s): s is OmniReferenceSlot & { assetId: string } => !!s.assetId)
      .map((s) => ({
        assetId: s.assetId,
        filename: s.filename ?? 'untitled',
        durationSeconds: s.durationSeconds,
      }));

  return {
    videoUrls: compactSlots(omniData.videoSlots),
    audioUrls: compactSlots(omniData.audioSlots),
    imageUrls: compactSlots(omniData.imageSlots),
  };
}
