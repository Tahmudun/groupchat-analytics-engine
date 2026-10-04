'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Netflix-style boot animation for the login gate: a white "N" settles in,
 *  then the remaining letters snap open one-by-one — stepped, staggered clip
 *  reveals so it reads segmented/choppy ("red origami"), not a smooth wipe —
 *  into the NETFLIXIA wordmark, holds, and the overlay fades to expose the
 *  password card underneath. Plays every login load; a tap skips it; reduced-
 *  motion users never see it. Kept as a pure-CSS timeline (see flix.css ›
 *  intro) — this only owns the mount/unmount timing and the letter split. */
const TOTAL_MS = 2400;
const REST = 'ETFLIXIA';

export function IntroOverlay() {
  const [done, setDone] = useState(false);
  const markRef = useRef<HTMLDivElement>(null);

  // Center the solo N exactly: the mark holds at translateX(--intro-shift)
  // until the letters unfurl, and the shift that puts the N's center on the
  // viewport center is (mark width − N width) / 2. Measure it (pre-paint)
  // instead of hardcoding an em value, and re-measure once fonts settle in
  // case the first frames rendered on the fallback font.
  useLayoutEffect(() => {
    const mark = markRef.current;
    if (!mark) return;
    const setShift = () => {
      const n = mark.querySelector<HTMLElement>('.n');
      if (!n || mark.offsetWidth === 0) return;
      mark.style.setProperty('--intro-shift', `${(mark.offsetWidth - n.offsetWidth) / 2}px`);
    };
    setShift();
    document.fonts?.ready.then(setShift).catch(() => {});
  }, []);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDone(true);
      return;
    }
    const t = setTimeout(() => setDone(true), TOTAL_MS);
    return () => clearTimeout(t);
  }, []);

  if (done) return null;

  return (
    <div className="flx-intro" aria-hidden="true" onClick={() => setDone(true)}>
      <div className="flx-intro-mark flx-display" ref={markRef}>
        <span className="n">N</span>
        <span className="rest">
          {REST.split('').map((c, i) => (
            <span key={i} className="l">{c}</span>
          ))}
        </span>
      </div>
    </div>
  );
}
