import type { ReactNode } from 'react';

/** A titled horizontal scroll-snap strip of posters. */
export function PosterRow({ title, blurb, children }: { title: string; blurb?: string; children: ReactNode }) {
  return (
    <section className="flx-section">
      <h2>{title}{blurb && <small>{blurb}</small>}</h2>
      <div className="flx-row">{children}</div>
    </section>
  );
}
