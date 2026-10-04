/** Always-visible disclosure on the public demo: nothing here is a real person. */
export function DemoBadge({ repoUrl }: { repoUrl: string | null }) {
  return (
    <aside className="flx-demo-badge" aria-label="Demo notice">
      <span className="dot" aria-hidden="true" />
      <span><b>Demo</b> · fictional chat</span>
      {repoUrl && <a href={repoUrl} target="_blank" rel="noreferrer">Source ↗</a>}
    </aside>
  );
}
