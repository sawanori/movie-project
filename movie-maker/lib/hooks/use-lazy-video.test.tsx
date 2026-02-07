'use client';

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { useLazyVideo } from './use-lazy-video';

// IntersectionObserverのモック状態
let observerCallback: IntersectionObserverCallback | null = null;
let observerOptions: IntersectionObserverInit | undefined = undefined;
let observedElements: Element[] = [];
let mockDisconnect: Mock;

// IntersectionObserverのモッククラス
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string;
  readonly thresholds: ReadonlyArray<number>;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    observerCallback = callback;
    observerOptions = options;
    this.rootMargin = options?.rootMargin || '0px';
    this.thresholds = Array.isArray(options?.threshold)
      ? options.threshold
      : [options?.threshold || 0];
  }

  observe(element: Element): void {
    observedElements.push(element);
  }

  unobserve(element: Element): void {
    observedElements = observedElements.filter(el => el !== element);
  }

  disconnect(): void {
    observedElements = [];
    mockDisconnect();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// 交差を発火させるヘルパー関数
function triggerIntersection(isIntersecting: boolean) {
  if (observerCallback && observedElements.length > 0) {
    const entry = {
      isIntersecting,
      target: observedElements[0],
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: Date.now(),
    } as IntersectionObserverEntry;
    act(() => {
      observerCallback!([entry], new MockIntersectionObserver(() => {}, {}));
    });
  }
}

// テスト用コンポーネント
interface TestComponentProps {
  rootMargin?: string;
  threshold?: number;
}

function TestComponent({ rootMargin, threshold }: TestComponentProps) {
  const { videoRef, shouldLoad, isIntersecting } = useLazyVideo({ rootMargin, threshold });

  return (
    <div>
      <video
        ref={videoRef}
        data-testid="video"
        src={shouldLoad ? 'test-video.mp4' : undefined}
      />
      <span data-testid="should-load">{String(shouldLoad)}</span>
      <span data-testid="is-intersecting">{String(isIntersecting)}</span>
    </div>
  );
}

describe('useLazyVideo', () => {
  beforeEach(() => {
    // リセット
    observerCallback = null;
    observerOptions = undefined;
    observedElements = [];
    mockDisconnect = vi.fn();

    // IntersectionObserverをモックに置き換え
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('初期状態ではshouldLoadとisIntersectingがfalse', () => {
    render(<TestComponent />);

    expect(screen.getByTestId('should-load').textContent).toBe('false');
    expect(screen.getByTestId('is-intersecting').textContent).toBe('false');
  });

  it('videoRefがvideo要素に適切に接続される', () => {
    render(<TestComponent />);

    const video = screen.getByTestId('video');
    expect(video.tagName).toBe('VIDEO');
    expect(observedElements).toContain(video);
  });

  it('ビューポートに入るとshouldLoadとisIntersectingがtrueになる', async () => {
    render(<TestComponent />);

    // IntersectionObserverが作成されたことを確認
    expect(observerCallback).not.toBeNull();

    // 交差を発火
    triggerIntersection(true);

    await waitFor(() => {
      expect(screen.getByTestId('should-load').textContent).toBe('true');
      expect(screen.getByTestId('is-intersecting').textContent).toBe('true');
    });
  });

  it('shouldLoadがtrueになるとsrc属性が設定される', async () => {
    render(<TestComponent />);

    const video = screen.getByTestId('video') as HTMLVideoElement;

    // 初期状態ではsrcがない
    expect(video.getAttribute('src')).toBeNull();

    // 交差を発火
    triggerIntersection(true);

    await waitFor(() => {
      expect(video.getAttribute('src')).toBe('test-video.mp4');
    });
  });

  it('デフォルトのrootMarginは200px', () => {
    render(<TestComponent />);

    expect(observerOptions?.rootMargin).toBe('200px');
  });

  it('カスタムrootMarginを設定できる', () => {
    render(<TestComponent rootMargin="500px" />);

    expect(observerOptions?.rootMargin).toBe('500px');
  });

  it('デフォルトのthresholdは0', () => {
    render(<TestComponent />);

    expect(observerOptions?.threshold).toBe(0);
  });

  it('カスタムthresholdを設定できる', () => {
    render(<TestComponent threshold={0.5} />);

    expect(observerOptions?.threshold).toBe(0.5);
  });

  it('一度ロード開始したら状態が維持される', async () => {
    const { rerender } = render(<TestComponent />);

    // 交差を発火してshouldLoad=trueにする
    triggerIntersection(true);

    await waitFor(() => {
      expect(screen.getByTestId('should-load').textContent).toBe('true');
    });

    // 再レンダー後も状態が維持される
    rerender(<TestComponent />);

    expect(screen.getByTestId('should-load').textContent).toBe('true');
    expect(screen.getByTestId('is-intersecting').textContent).toBe('true');
  });

  it('IntersectionObserverが存在しない環境では即座にshouldLoad=true', async () => {
    // IntersectionObserverを削除（windowにIntersectionObserverがない状態をシミュレート）
    // 'in' 演算子チェックを回避するため、プロパティ自体を削除
    const originalIntersectionObserver = window.IntersectionObserver;
    // @ts-expect-error - テスト用にプロパティを削除
    delete window.IntersectionObserver;

    render(<TestComponent />);

    // SSRフォールバック: 即座にロード
    await waitFor(() => {
      expect(screen.getByTestId('should-load').textContent).toBe('true');
    });

    // クリーンアップ
    window.IntersectionObserver = originalIntersectionObserver;
  });

  it('コンポーネントがアンマウントされるとobserver.disconnectが呼ばれる', () => {
    const { unmount } = render(<TestComponent />);

    expect(observedElements.length).toBeGreaterThan(0);

    unmount();

    expect(mockDisconnect).toHaveBeenCalled();
  });
});
