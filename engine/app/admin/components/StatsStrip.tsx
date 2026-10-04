'use client';
import type { StatusView } from '../client';

export function StatsStrip(props: { coverage: StatusView['coverage'] | null }) {
  const cov = props.coverage;
  if (!cov) return null;
  const sentimentPct = cov.mentions > 0 ? Math.min(100, Math.floor((cov.sentiments / cov.mentions) * 100)) : 0;
  return (
    <dl className="strip">
      <div><dt>messages</dt><dd>{cov.messages.toLocaleString()}</dd></div>
      <div>
        <dt>members</dt>
        <dd>{cov.activeMembers.toLocaleString()}<small>{cov.aliasCount.toLocaleString()} aliases</small></dd>
      </div>
      <div>
        <dt>mentions</dt>
        <dd>{cov.mentions.toLocaleString()}<small>across {cov.mentionMessages.toLocaleString()} msgs</small></dd>
      </div>
      <div>
        <dt>sentiments{cov.mentions > 0 && <span className={sentimentPct >= 98 ? 'ok' : undefined}> ● {sentimentPct}%</span>}</dt>
        <dd>
          {cov.sentiments.toLocaleString()}
          <small>last {cov.sentimentsLast?.slice(0, 10) ?? 'never'} · {cov.sentimentVersions.map(v => `${v.model_version}: ${v.n.toLocaleString()}`).join(', ') || 'none'}</small>
        </dd>
      </div>
      <div>
        <dt>scores</dt>
        <dd>{cov.scoreRows.toLocaleString()}<small>through {cov.lastScoreDay?.slice(0, 10) ?? 'never'}</small></dd>
      </div>
    </dl>
  );
}
