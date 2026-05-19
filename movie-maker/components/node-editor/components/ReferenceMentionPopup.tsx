'use client';

import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type {
  ReferenceCandidate,
  ReferenceKind,
  EmptyReason,
} from '../hooks/useReferenceAutocomplete';

// Re-export hook types so existing consumers of this module continue to work.
export type { ReferenceCandidate, ReferenceKind, EmptyReason };

export interface ReferenceMentionPopupProps {
  candidates: ReferenceCandidate[];
  emptyReason: EmptyReason | null;
  highlightedIndex: number;
  listboxId: string;
  onSelect: (candidate: ReferenceCandidate) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const EMPTY_REASON_MESSAGES: Record<EmptyReason, string> = {
  'no-generate-node': 'GenerateNode に接続してください',
  'not-seedance': 'Seedance Provider に設定してください',
  'no-base-image': 'base 画像を ImageInputNode で接続してください',
  'no-omni-ref': 'OmniReferenceNode を接続してください',
  'all-slots-empty': 'OmniReferenceNode にアップロードしてください',
};

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export function ReferenceMentionPopup({
  candidates,
  emptyReason,
  highlightedIndex,
  listboxId,
  onSelect,
  anchorRef,
}: ReferenceMentionPopupProps) {
  // Track whether the anchor element is currently mounted, and its position.
  // We read `anchorRef.current` only inside effects (lint: react-hooks/refs).
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    setStyle({
      position: 'absolute',
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      minWidth: rect.width,
      zIndex: 1000,
    });
    // Recompute whenever candidate/emptyReason set changes (size may shift)
  }, [anchorRef, candidates.length, emptyReason]);

  // Nothing to display
  const hasCandidates = candidates.length > 0;
  const hasGuide = emptyReason !== null;
  if (!hasCandidates && !hasGuide) {
    return null;
  }

  // Style is only computed when the anchor element exists; gate on that
  // instead of touching the ref during render.
  if (style === null) {
    return null;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const content = (
    <div
      data-testid="reference-mention-popup"
      data-reference-autocomplete-popup="true"
      className={cn(
        'rounded-md border border-zinc-700 bg-zinc-900 shadow-lg',
        'text-sm text-zinc-100',
        'overflow-hidden',
      )}
      style={style}
    >
      {hasCandidates && (
        <ul
          role="listbox"
          id={listboxId}
          className="max-h-64 overflow-y-auto py-1"
        >
          {candidates.map((candidate, index) => {
            const isHighlighted = index === highlightedIndex;
            const optionId = `${listboxId}-option-${index}`;
            const durationLabel =
              candidate.durationSeconds !== undefined
                ? ` (${formatDuration(candidate.durationSeconds)})`
                : '';
            return (
              <li
                key={candidate.id}
                id={optionId}
                role="option"
                aria-selected={isHighlighted}
                aria-label={`${candidate.id} ${candidate.filename}${durationLabel}`}
                className={cn(
                  'flex items-center gap-3 px-3 py-1.5 cursor-pointer select-none',
                  'hover:bg-zinc-800',
                  isHighlighted && 'bg-zinc-700',
                )}
                // Use onMouseDown so the popup click runs before the textarea
                // blur (which would otherwise close the popup first).
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(candidate);
                }}
              >
                <span className="font-mono text-zinc-200 shrink-0 w-16">
                  {candidate.id}
                </span>
                <span className="truncate text-zinc-300">
                  {candidate.filename}
                  {candidate.durationSeconds !== undefined && (
                    <span className="text-zinc-400">
                      {' '}
                      ({formatDuration(candidate.durationSeconds)})
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {hasGuide && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'px-3 py-2 text-zinc-400',
            hasCandidates ? 'border-t border-zinc-700 text-xs' : 'text-sm',
          )}
        >
          {EMPTY_REASON_MESSAGES[emptyReason]}
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
