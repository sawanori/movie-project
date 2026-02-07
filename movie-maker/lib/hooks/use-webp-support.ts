'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook to detect browser WebP support
 *
 * Uses optimistic initial value (true) to prevent layout shift,
 * then verifies actual support via image loading test.
 *
 * @example
 * function ImageComponent({ originalUrl, webpUrl }) {
 *   const supportsWebP = useWebPSupport();
 *   const imageUrl = getOptimizedImageUrl(originalUrl, webpUrl, supportsWebP);
 *   return <img src={imageUrl} alt="..." />;
 * }
 */
export function useWebPSupport(): boolean {
  const [supportsWebP, setSupportsWebP] = useState(true); // Optimistic default

  useEffect(() => {
    const checkWebPSupport = async () => {
      // 1x1 pixel WebP image encoded in base64
      const webpData =
        'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

      const img = new Image();
      img.onload = () => setSupportsWebP(true);
      img.onerror = () => setSupportsWebP(false);
      img.src = webpData;
    };

    checkWebPSupport();
  }, []);

  return supportsWebP;
}

/**
 * Returns WebP URL if supported and available, otherwise returns original URL
 *
 * @param originalUrl - Original image URL (PNG, JPEG, etc.)
 * @param webpUrl - WebP version of the image URL
 * @param supportsWebP - Whether browser supports WebP (from useWebPSupport)
 * @returns Optimized image URL or undefined if no URL provided
 *
 * @example
 * const supportsWebP = useWebPSupport();
 * const imageUrl = getOptimizedImageUrl(
 *   thumbnail.original_url,
 *   thumbnail.webp_url,
 *   supportsWebP
 * );
 */
export function getOptimizedImageUrl(
  originalUrl: string | null | undefined,
  webpUrl: string | null | undefined,
  supportsWebP: boolean
): string | undefined {
  if (!originalUrl) return undefined;

  if (supportsWebP && webpUrl) {
    return webpUrl;
  }

  return originalUrl;
}
