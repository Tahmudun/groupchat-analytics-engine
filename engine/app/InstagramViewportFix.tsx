'use client';

import { useLayoutEffect } from 'react';
import { isInstagramInAppBrowser, visibleViewportSize } from '@/lib/flix/inAppBrowser';

/**
 * Instagram's in-app browser sometimes reports CSS dynamic viewport units
 * from its layout viewport while showing a smaller visual viewport. Fullscreen
 * descendants then inherit a taller 100% box and look vertically stretched.
 *
 * Measure the visible viewport for Instagram only. CSS consumes these values
 * for Recap, MomentPlayer, login/intro, and Universe; normal browsers retain
 * their native vh/dvh behavior.
 */
export function InstagramViewportFix() {
  useLayoutEffect(() => {
    if (!isInstagramInAppBrowser(window.navigator.userAgent)) return;

    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    let animationFrame = 0;
    let settleTimer = 0;

    root.dataset.inAppBrowser = 'instagram';

    const apply = () => {
      animationFrame = 0;
      const viewport = visibleViewportSize(visualViewport, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      const width = Math.round(viewport.width * 100) / 100;
      const height = Math.round(viewport.height * 100) / 100;

      root.style.setProperty('--inapp-viewport-width', `${width}px`);
      root.style.setProperty('--inapp-viewport-height', `${height}px`);
      root.style.setProperty('--inapp-viewport-47', `${height * 0.47}px`);
      root.style.setProperty('--inapp-viewport-52', `${height * 0.52}px`);
      root.style.setProperty('--inapp-viewport-56', `${height * 0.56}px`);
      root.style.setProperty('--inapp-viewport-72', `${height * 0.72}px`);
      root.toggleAttribute('data-inapp-short', height <= 640);
      root.toggleAttribute('data-inapp-short-landscape', width > height && height <= 520);
    };

    const schedule = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(apply);
    };
    const settle = () => {
      schedule();
      window.clearTimeout(settleTimer);
      // iOS WebViews can publish one more viewport after the toolbar animation.
      settleTimer = window.setTimeout(schedule, 250);
    };

    apply();
    window.addEventListener('resize', settle);
    window.addEventListener('orientationchange', settle);
    window.addEventListener('pageshow', settle);
    visualViewport?.addEventListener('resize', schedule);
    visualViewport?.addEventListener('scroll', schedule);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', settle);
      window.removeEventListener('orientationchange', settle);
      window.removeEventListener('pageshow', settle);
      visualViewport?.removeEventListener('resize', schedule);
      visualViewport?.removeEventListener('scroll', schedule);
      delete root.dataset.inAppBrowser;
      root.removeAttribute('data-inapp-short');
      root.removeAttribute('data-inapp-short-landscape');
      for (const property of [
        '--inapp-viewport-width', '--inapp-viewport-height',
        '--inapp-viewport-47', '--inapp-viewport-52', '--inapp-viewport-56', '--inapp-viewport-72',
      ]) root.style.removeProperty(property);
    };
  }, []);

  return null;
}
