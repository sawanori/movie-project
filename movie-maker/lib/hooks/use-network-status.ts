'use client';

import { useSyncExternalStore } from 'react';

/** Network connection type */
export type EffectiveConnectionType = '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';

/** Network quality level */
export type NetworkQuality = 'high' | 'medium' | 'low';

interface NetworkStatus {
  /** Connection type (4g, 3g, 2g, slow-2g) */
  effectiveType: EffectiveConnectionType;
  /** Whether data saver mode is enabled */
  saveData: boolean;
  /** Estimated downlink speed (Mbps) */
  downlink: number | null;
  /** Estimated RTT (ms) */
  rtt: number | null;
  /** Network quality level (high/medium/low) */
  quality: NetworkQuality;
  /** Online status */
  isOnline: boolean;
  /** Whether initialized on client side */
  isInitialized: boolean;
}

// Network Information API type definitions (not available in standard TypeScript)
interface NetworkInformation extends EventTarget {
  effectiveType?: EffectiveConnectionType;
  saveData?: boolean;
  downlink?: number;
  rtt?: number;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

/**
 * Determine quality level from effectiveType and saveData
 */
function getQualityLevel(
  effectiveType: EffectiveConnectionType,
  saveData: boolean
): NetworkQuality {
  if (saveData) return 'low';

  switch (effectiveType) {
    case '4g':
      return 'high';
    case '3g':
      return 'medium';
    case '2g':
    case 'slow-2g':
      return 'low';
    default:
      return 'high'; // Assume high quality when unknown
  }
}

// SSR-safe default value (used for server-side rendering)
const SERVER_STATUS: NetworkStatus = {
  effectiveType: 'unknown',
  saveData: false,
  downlink: null,
  rtt: null,
  quality: 'high',
  isOnline: true,
  isInitialized: false,
};

// Cache for getNetworkSnapshot to avoid infinite loops with useSyncExternalStore
let cachedSnapshot: NetworkStatus = SERVER_STATUS;

/**
 * Get current network status from browser APIs
 * Returns cached snapshot if values haven't changed to prevent infinite re-renders
 */
function getNetworkSnapshot(): NetworkStatus {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return SERVER_STATUS;
  }

  const connection = navigator.connection ||
                     navigator.mozConnection ||
                     navigator.webkitConnection;

  const effectiveType: EffectiveConnectionType =
    connection?.effectiveType || 'unknown';
  const saveData = connection?.saveData || false;
  const downlink = connection?.downlink ?? null;
  const rtt = connection?.rtt ?? null;
  const isOnline = navigator.onLine;
  const quality = getQualityLevel(effectiveType, saveData);

  // Return cached snapshot if values haven't changed
  if (
    cachedSnapshot.isInitialized &&
    cachedSnapshot.effectiveType === effectiveType &&
    cachedSnapshot.saveData === saveData &&
    cachedSnapshot.downlink === downlink &&
    cachedSnapshot.rtt === rtt &&
    cachedSnapshot.isOnline === isOnline &&
    cachedSnapshot.quality === quality
  ) {
    return cachedSnapshot;
  }

  // Create new snapshot and cache it
  cachedSnapshot = {
    effectiveType,
    saveData,
    downlink,
    rtt,
    quality,
    isOnline,
    isInitialized: true,
  };

  return cachedSnapshot;
}

/**
 * Get server snapshot (used during SSR)
 */
function getServerSnapshot(): NetworkStatus {
  return SERVER_STATUS;
}

/**
 * Subscribe to network status changes
 */
function subscribeToNetworkStatus(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const connection = navigator.connection ||
                     navigator.mozConnection ||
                     navigator.webkitConnection;

  if (connection) {
    connection.addEventListener('change', callback);
  }

  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);

  return () => {
    if (connection) {
      connection.removeEventListener('change', callback);
    }
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/**
 * Custom hook to monitor network status using Network Information API
 *
 * Uses useSyncExternalStore for proper React 18+ integration with external stores.
 *
 * @example
 * function VideoPlayer() {
 *   const { quality, isOnline, isInitialized } = useNetworkStatus();
 *
 *   if (!isOnline) {
 *     return <div>Offline - Please check your connection</div>;
 *   }
 *
 *   const preload = getPreloadForQuality(quality, true);
 *   return <video preload={preload} src="..." />;
 * }
 */
export function useNetworkStatus(): NetworkStatus {
  return useSyncExternalStore(
    subscribeToNetworkStatus,
    getNetworkSnapshot,
    getServerSnapshot
  );
}

/**
 * Determine video preload value based on network quality
 */
export function getPreloadForQuality(
  quality: NetworkQuality,
  isAutoPlay: boolean
): 'none' | 'metadata' | 'auto' {
  if (isAutoPlay) {
    return quality === 'low' ? 'metadata' : 'auto';
  }
  return 'none';
}

/**
 * Check if connection is slow
 */
export function isSlowConnection(quality: NetworkQuality): boolean {
  return quality === 'low';
}
