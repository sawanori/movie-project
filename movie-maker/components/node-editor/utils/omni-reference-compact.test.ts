import { describe, it, expect } from 'vitest';
import { compactOmniReferences } from './omni-reference-compact';
import type {
  OmniReferenceNodeData,
  OmniReferenceSlot,
} from '@/lib/types/node-editor';

// ========== Test Helpers ==========

function makeEmptySlot(mediaType: OmniReferenceSlot['mediaType']): OmniReferenceSlot {
  return { assetId: null, mediaType };
}

function makeFilledSlot(opts: {
  assetId: string;
  mediaType: OmniReferenceSlot['mediaType'];
  filename?: string;
  durationSeconds?: number;
  url?: string;
}): OmniReferenceSlot {
  return {
    assetId: opts.assetId,
    mediaType: opts.mediaType,
    filename: opts.filename,
    durationSeconds: opts.durationSeconds,
    url: opts.url,
  };
}

function makeOmniData(opts: {
  imageSlots?: OmniReferenceSlot[];
  videoSlots?: [OmniReferenceSlot, OmniReferenceSlot, OmniReferenceSlot];
  audioSlots?: [OmniReferenceSlot, OmniReferenceSlot, OmniReferenceSlot];
}): OmniReferenceNodeData {
  return {
    type: 'omniReference',
    isValid: true,
    imageSlots:
      opts.imageSlots ??
      [
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
      ],
    videoSlots:
      opts.videoSlots ??
      [
        makeEmptySlot('video'),
        makeEmptySlot('video'),
        makeEmptySlot('video'),
      ],
    audioSlots:
      opts.audioSlots ??
      [
        makeEmptySlot('audio'),
        makeEmptySlot('audio'),
        makeEmptySlot('audio'),
      ],
    consentAccepted: true,
  };
}

// ========== Tests (AT-24) ==========

describe('compactOmniReferences', () => {
  it('全 slot 空のとき videoUrls/audioUrls/imageUrls すべて空配列を返す', () => {
    const omniData = makeOmniData({});

    const result = compactOmniReferences(omniData);

    expect(result.videoUrls).toEqual([]);
    expect(result.audioUrls).toEqual([]);
    expect(result.imageUrls).toEqual([]);
  });

  it('一部 slot 埋まり: video 2 件 / audio 1 件 / image 1 件で compact 後の配列が期待値', () => {
    const omniData = makeOmniData({
      videoSlots: [
        makeFilledSlot({ assetId: 'v1', mediaType: 'video', filename: 'a.mp4', durationSeconds: 5 }),
        makeFilledSlot({ assetId: 'v2', mediaType: 'video', filename: 'b.mp4', durationSeconds: 7 }),
        makeEmptySlot('video'),
      ],
      audioSlots: [
        makeFilledSlot({ assetId: 'a1', mediaType: 'audio', filename: 'song.mp3', durationSeconds: 10 }),
        makeEmptySlot('audio'),
        makeEmptySlot('audio'),
      ],
      imageSlots: [
        makeFilledSlot({ assetId: 'i1', mediaType: 'image', filename: 'pic.jpg' }),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
      ],
    });

    const result = compactOmniReferences(omniData);

    expect(result.videoUrls).toEqual([
      { assetId: 'v1', filename: 'a.mp4', durationSeconds: 5 },
      { assetId: 'v2', filename: 'b.mp4', durationSeconds: 7 },
    ]);
    expect(result.audioUrls).toEqual([
      { assetId: 'a1', filename: 'song.mp3', durationSeconds: 10 },
    ]);
    expect(result.imageUrls).toEqual([
      { assetId: 'i1', filename: 'pic.jpg', durationSeconds: undefined },
    ]);
  });

  it('順序保存: image slot 0/2/4 が埋まると compact 後 index 0/1/2 になる', () => {
    const omniData = makeOmniData({
      imageSlots: [
        makeFilledSlot({ assetId: 'img-0', mediaType: 'image', filename: 'first.jpg' }),
        makeEmptySlot('image'),
        makeFilledSlot({ assetId: 'img-2', mediaType: 'image', filename: 'second.jpg' }),
        makeEmptySlot('image'),
        makeFilledSlot({ assetId: 'img-4', mediaType: 'image', filename: 'third.jpg' }),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
        makeEmptySlot('image'),
      ],
    });

    const result = compactOmniReferences(omniData);

    expect(result.imageUrls).toHaveLength(3);
    expect(result.imageUrls[0].assetId).toBe('img-0');
    expect(result.imageUrls[1].assetId).toBe('img-2');
    expect(result.imageUrls[2].assetId).toBe('img-4');
  });

  it('filename が undefined の slot は "untitled" fallback で出力される', () => {
    const omniData = makeOmniData({
      videoSlots: [
        // filename を省略 (undefined)
        makeFilledSlot({ assetId: 'v-no-name', mediaType: 'video', durationSeconds: 3 }),
        makeEmptySlot('video'),
        makeEmptySlot('video'),
      ],
    });

    const result = compactOmniReferences(omniData);

    expect(result.videoUrls).toEqual([
      { assetId: 'v-no-name', filename: 'untitled', durationSeconds: 3 },
    ]);
  });

  it('durationSeconds が undefined の slot は undefined のまま維持される', () => {
    const omniData = makeOmniData({
      imageSlots: [
        makeFilledSlot({ assetId: 'i1', mediaType: 'image', filename: 'pic.jpg' }),
        ...Array.from({ length: 7 }, () => makeEmptySlot('image')),
      ],
    });

    const result = compactOmniReferences(omniData);

    expect(result.imageUrls).toHaveLength(1);
    expect(result.imageUrls[0].durationSeconds).toBeUndefined();
  });

  it('型 narrow: 戻り値の assetId が string (non-null) であること', () => {
    const omniData = makeOmniData({
      videoSlots: [
        makeFilledSlot({ assetId: 'v1', mediaType: 'video', filename: 'a.mp4', durationSeconds: 5 }),
        makeEmptySlot('video'),
        makeEmptySlot('video'),
      ],
    });

    const result = compactOmniReferences(omniData);

    // 型 narrow の検証 (compile-time): assetId は string で、null/undefined は除外されている
    // 実行時にも string であることを確認
    for (const slot of result.videoUrls) {
      const assetId: string = slot.assetId;
      expect(typeof assetId).toBe('string');
      expect(assetId.length).toBeGreaterThan(0);
    }
  });
});
