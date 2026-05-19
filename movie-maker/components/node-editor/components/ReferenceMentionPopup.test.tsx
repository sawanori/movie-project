import React, { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ReferenceMentionPopup,
  type ReferenceMentionPopupProps,
  type ReferenceCandidate,
  type EmptyReason,
} from './ReferenceMentionPopup';

function setup(overrides?: Partial<ReferenceMentionPopupProps>) {
  // Create an anchor element attached to the DOM so getBoundingClientRect works.
  const anchorEl = document.createElement('textarea');
  document.body.appendChild(anchorEl);
  const anchorRef = {
    current: anchorEl,
  } as React.RefObject<HTMLElement>;

  const props: ReferenceMentionPopupProps = {
    candidates: [],
    emptyReason: null,
    highlightedIndex: 0,
    listboxId: 'ref-listbox-test',
    onSelect: vi.fn(),
    onClose: vi.fn(),
    anchorRef,
    ...overrides,
  };

  const utils = render(<ReferenceMentionPopup {...props} />);
  return {
    ...utils,
    props,
    cleanup: () => {
      if (anchorEl.parentNode) anchorEl.parentNode.removeChild(anchorEl);
    },
  };
}

const sampleCandidates: ReferenceCandidate[] = [
  {
    id: '@image1',
    kind: 'image',
    index: 1,
    filename: 'character.png',
  },
  {
    id: '@video1',
    kind: 'video',
    index: 1,
    filename: 'dance.mp4',
    durationSeconds: 5,
  },
  {
    id: '@audio1',
    kind: 'audio',
    index: 1,
    filename: 'bgm.mp3',
    durationSeconds: 3.2,
  },
];

describe('ReferenceMentionPopup', () => {
  it('does not render when anchorRef.current is null', () => {
    const anchorRef = { current: null } as unknown as React.RefObject<HTMLElement>;
    render(
      <ReferenceMentionPopup
        candidates={sampleCandidates}
        emptyReason={null}
        highlightedIndex={0}
        listboxId="lb-1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />,
    );
    expect(
      document.querySelector('[data-testid="reference-mention-popup"]'),
    ).toBeNull();
  });

  it('AT-3: shows guide message when emptyReason is no-omni-ref', () => {
    const { cleanup } = setup({
      candidates: [],
      emptyReason: 'no-omni-ref',
    });
    expect(
      screen.getByText('OmniReferenceNode を接続してください'),
    ).toBeTruthy();
    cleanup();
  });

  it('AT-19: shows guide message when emptyReason is no-generate-node', () => {
    const { cleanup } = setup({
      candidates: [],
      emptyReason: 'no-generate-node',
    });
    expect(
      screen.getByText('GenerateNode に接続してください'),
    ).toBeTruthy();
    cleanup();
  });

  it('shows correct message for each EmptyReason variant', () => {
    const cases: Array<{ reason: EmptyReason; expected: string }> = [
      { reason: 'no-generate-node', expected: 'GenerateNode に接続してください' },
      { reason: 'not-seedance', expected: 'Seedance Provider に設定してください' },
      { reason: 'no-base-image', expected: 'base 画像を ImageInputNode で接続してください' },
      { reason: 'no-omni-ref', expected: 'OmniReferenceNode を接続してください' },
      {
        reason: 'all-slots-empty',
        expected: 'OmniReferenceNode にアップロードしてください',
      },
    ];
    for (const { reason, expected } of cases) {
      const { unmount, cleanup } = setup({
        candidates: [],
        emptyReason: reason,
      });
      expect(screen.getByText(expected)).toBeTruthy();
      unmount();
      cleanup();
    }
  });

  it('AT-10: displays candidate metadata (filename, duration)', () => {
    const { cleanup } = setup({ candidates: sampleCandidates });
    expect(screen.getByText('@image1')).toBeTruthy();
    expect(screen.getByText('character.png')).toBeTruthy();
    expect(screen.getByText('@video1')).toBeTruthy();
    expect(screen.getByText(/dance\.mp4/)).toBeTruthy();
    expect(screen.getAllByText(/5\.0s/).length).toBeGreaterThan(0);
    expect(screen.getByText('@audio1')).toBeTruthy();
    expect(screen.getByText(/bgm\.mp3/)).toBeTruthy();
    expect(screen.getAllByText(/3\.2s/).length).toBeGreaterThan(0);
    cleanup();
  });

  it('AT-6: calls onSelect when a candidate is clicked', () => {
    const onSelect = vi.fn();
    const { cleanup } = setup({ candidates: sampleCandidates, onSelect });
    const option = screen.getByRole('option', { name: /@video1/ });
    // Component listens to onMouseDown (to beat textarea blur).
    fireEvent.mouseDown(option);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(sampleCandidates[1]);
    cleanup();
  });

  it('AT-23: applies correct ARIA attributes (role=listbox, role=option, aria-selected)', () => {
    const { cleanup } = setup({
      candidates: sampleCandidates,
      highlightedIndex: 1,
    });
    const listbox = screen.getByRole('listbox');
    expect(listbox.getAttribute('id')).toBe('ref-listbox-test');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0].getAttribute('id')).toBe('ref-listbox-test-option-0');
    expect(options[1].getAttribute('id')).toBe('ref-listbox-test-option-1');
    expect(options[2].getAttribute('id')).toBe('ref-listbox-test-option-2');

    expect(options[0].getAttribute('aria-selected')).toBe('false');
    expect(options[1].getAttribute('aria-selected')).toBe('true');
    expect(options[2].getAttribute('aria-selected')).toBe('false');
    cleanup();
  });

  it('empty-reason guide section has role=status with aria-live=polite', () => {
    const { cleanup } = setup({
      candidates: [],
      emptyReason: 'no-omni-ref',
    });
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    cleanup();
  });

  it('shows both candidates list and small guide message when emptyReason=all-slots-empty with candidates present', () => {
    // AT-3 variant: candidates + emptyReason both present (e.g., base image only, OmniRef all slots empty)
    const baseOnly: ReferenceCandidate[] = [
      { id: '@image1', kind: 'image', index: 1, filename: 'base.png' },
    ];
    const { cleanup } = setup({
      candidates: baseOnly,
      emptyReason: 'all-slots-empty',
    });
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByRole('option', { name: /@image1/ })).toBeTruthy();
    expect(
      screen.getByText('OmniReferenceNode にアップロードしてください'),
    ).toBeTruthy();
    cleanup();
  });

  it('renders nothing when there are no candidates and no emptyReason', () => {
    const anchorEl = document.createElement('textarea');
    document.body.appendChild(anchorEl);
    const anchorRef = { current: anchorEl } as React.RefObject<HTMLElement>;
    render(
      <ReferenceMentionPopup
        candidates={[]}
        emptyReason={null}
        highlightedIndex={0}
        listboxId="lb-x"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef}
      />,
    );
    expect(
      document.querySelector('[data-testid="reference-mention-popup"]'),
    ).toBeNull();
    anchorEl.remove();
  });

  it('highlights candidate based on highlightedIndex', () => {
    const { cleanup } = setup({
      candidates: sampleCandidates,
      highlightedIndex: 2,
    });
    const options = screen.getAllByRole('option');
    expect(options[2].getAttribute('aria-selected')).toBe('true');
    expect(options[0].getAttribute('aria-selected')).toBe('false');
    expect(options[1].getAttribute('aria-selected')).toBe('false');
    cleanup();
  });

  it('works with createRef typed anchor when current is attached', () => {
    const anchorRef = createRef<HTMLTextAreaElement>();
    const anchorEl = document.createElement('textarea');
    document.body.appendChild(anchorEl);
    (anchorRef as { current: HTMLTextAreaElement }).current = anchorEl;
    render(
      <ReferenceMentionPopup
        candidates={sampleCandidates}
        emptyReason={null}
        highlightedIndex={0}
        listboxId="lb-cr"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        anchorRef={anchorRef as unknown as React.RefObject<HTMLElement>}
      />,
    );
    expect(screen.getByRole('listbox')).toBeTruthy();
    anchorEl.remove();
  });
});
