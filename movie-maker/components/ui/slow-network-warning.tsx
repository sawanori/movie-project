'use client';

import { cn } from '@/lib/utils';
import { useNetworkStatus, isSlowConnection } from '@/lib/hooks/use-network-status';

interface SlowNetworkWarningProps {
  /** Custom class name */
  className?: string;
  /** Custom message to display */
  message?: string;
  /** Whether to show offline message (default: true) */
  showOfflineMessage?: boolean;
  /** Whether the warning can be dismissed (default: false) */
  dismissible?: boolean;
  /** Callback when dismissed */
  onDismiss?: () => void;
}

/**
 * Component that displays a warning banner when network is slow or offline
 *
 * @example
 * // Basic usage
 * <SlowNetworkWarning />
 *
 * @example
 * // With custom message
 * <SlowNetworkWarning
 *   message="Video loading may be slower than usual"
 *   dismissible
 *   onDismiss={() => setShowWarning(false)}
 * />
 */
export function SlowNetworkWarning({
  className,
  message,
  showOfflineMessage = true,
  dismissible = false,
  onDismiss,
}: SlowNetworkWarningProps) {
  const { quality, isOnline, isInitialized, effectiveType, saveData } = useNetworkStatus();

  // Don't render during SSR or before initialization
  if (!isInitialized) {
    return null;
  }

  // Show offline message
  if (!isOnline && showOfflineMessage) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200',
          className
        )}
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <OfflineIcon className="h-4 w-4 flex-shrink-0" />
          <span>
            Offline - Please check your internet connection
          </span>
        </div>
      </div>
    );
  }

  // Show slow network warning
  if (isSlowConnection(quality)) {
    const defaultMessage = saveData
      ? 'Data saver mode is enabled. Video quality may be reduced.'
      : `Slow connection detected (${effectiveType}). Video loading may take longer.`;

    return (
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200',
          className
        )}
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <SlowNetworkIcon className="h-4 w-4 flex-shrink-0" />
          <span>{message || defaultMessage}</span>
        </div>
        {dismissible && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900"
            aria-label="Dismiss warning"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  // No warning needed
  return null;
}

// Simple inline icons to avoid external dependencies

function OfflineIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

function SlowNetworkIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
      <path d="M12 4v2" />
      <path d="M12 8v.01" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
