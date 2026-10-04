/** Instagram's iOS and Android in-app browsers identify themselves in one of
 * these forms. Keep this intentionally narrow: the measured-viewport fallback
 * is for Instagram's WebView chrome, not ordinary Safari/Chrome. */
export function isInstagramInAppBrowser(userAgent: string): boolean {
  return /(?:\bInstagram(?:\s|\/)|FBAN\/Instagram|FB_IAB\/Instagram)/i.test(userAgent);
}

type ViewportLike = { width: number; height: number } | null | undefined;

/** Prefer the actually visible viewport over the WebView's layout viewport.
 * Instagram can leave those at different sizes while its browser chrome is
 * opening/closing, which is what stretches 100%-height fullscreen children. */
export function visibleViewportSize(
  visualViewport: ViewportLike,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  const width = visualViewport?.width;
  const height = visualViewport?.height;
  return {
    width: Number.isFinite(width) && width! > 0 ? width! : fallback.width,
    height: Number.isFinite(height) && height! > 0 ? height! : fallback.height,
  };
}
