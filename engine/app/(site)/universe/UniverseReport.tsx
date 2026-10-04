'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ZODIAC, ZODIAC_SIGNS, astrologyReading, isZodiacSign, type ZodiacSign,
} from '@/lib/universe/astrology';
import { buildMemberInsight } from '@/lib/universe/insights';
import type { UniverseGraph, UniverseNode } from '@/lib/universe/types';

const fmt = (value: number) => value.toLocaleString('en-US');

function OrbitRow({ member, rank }: { member: NonNullable<ReturnType<typeof buildMemberInsight>>['orbit'][number]; rank: number }) {
  return (
    <Link className="universe-orbit-row" prefetch={false} href={`/member/${encodeURIComponent(member.node.id)}`}>
      <span className="universe-orbit-rank">{String(rank).padStart(2, '0')}</span>
      <span className="universe-orbit-avatar" aria-hidden="true">{member.node.name.slice(0, 1).toUpperCase()}</span>
      <span className="universe-orbit-name"><b>{member.node.name}</b><small>{member.edge.tier}</small></span>
      <strong>{fmt(member.edge.interactions)}</strong>
    </Link>
  );
}

export function UniverseReport({ graph, node }: { graph: UniverseGraph; node: UniverseNode }) {
  const insight = useMemo(() => buildMemberInsight(graph, node.id), [graph, node.id]);
  const [sun, setSun] = useState<ZodiacSign | ''>('');
  const [rising, setRising] = useState<ZodiacSign | ''>('');
  const [signsLoaded, setSignsLoaded] = useState(false);
  const storageKey = `netflixia:cosmic-profile:${node.id}`;

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as { sun?: unknown; rising?: unknown };
      setSun(isZodiacSign(stored.sun) ? stored.sun : '');
      setRising(isZodiacSign(stored.rising) ? stored.rising : '');
    } catch {
      setSun(''); setRising('');
    } finally { setSignsLoaded(true); }
  }, [storageKey]);

  useEffect(() => {
    if (!signsLoaded) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ sun: sun || null, rising: rising || null })); } catch { /* private mode/storage denial */ }
  }, [storageKey, signsLoaded, sun, rising]);

  const reading = useMemo(() => insight ? astrologyReading(insight, sun || null, rising || null) : {}, [insight, sun, rising]);
  if (!insight) return null;
  const visibleOrbit = insight.orbit.slice(0, 8);
  const remainingOrbit = insight.orbit.slice(8);
  const celestialLabel = node.celestial === 'sun' ? 'Stellar core' : node.celestial === 'planet' ? 'Major world' : 'Deep-field star';

  return (
    <div className="universe-report">
      <div className="universe-report-title">
        <span>COSMIC PROFILE</span>
        <h3>Your place in the room</h3>
        <p>Measured social position first. Symbolic interpretation second.</p>
      </div>

      <div className="universe-report-ranks">
        <span><small>Influence</small><b>#{insight.role.influenceRank}</b><i>of {fmt(insight.role.totalMembers)}</i></span>
        <span><small>Messages</small><b>#{insight.role.messageRank}</b><i>all time</i></span>
        <span><small>Class</small><b>{celestialLabel}</b><i>{node.role}</i></span>
      </div>

      <section className="universe-report-section role-report">
        <span className="universe-report-kicker">01 · YOUR ROLE</span>
        <h3>{insight.role.title}</h3>
        <p className="universe-report-lede">{insight.role.summary}</p>
        <ul>
          {insight.role.evidence.map(item => <li key={item}>{item}</li>)}
          <li>{insight.role.celestialReason}</li>
        </ul>
      </section>

      <section className="universe-report-section community-report" style={{ '--community': insight.community.color } as React.CSSProperties}>
        <span className="universe-report-kicker">02 · YOUR COMMUNITY</span>
        <div className="universe-community-heading"><span /><div><small>{insight.community.name}</small><h3>{insight.community.archetype}</h3></div></div>
        <p className="universe-report-lede">{insight.community.summary}</p>
        <div className="universe-community-balance" aria-label={`${insight.community.cohesionPercent}% internal and ${insight.community.crossPercent}% cross-community interaction weight`}>
          <div><span>Internal gravity</span><b>{insight.community.cohesionPercent}%</b></div>
          <i><span style={{ width: `${insight.community.cohesionPercent}%` }} /></i>
          <div><span>Cross-community reach</span><b>{insight.community.crossPercent}%</b></div>
        </div>
        <ul>{insight.community.evidence.map(item => <li key={item}>{item}</li>)}</ul>
        <div className="universe-community-cast"><small>Defining signals</small><div>{insight.community.notableMembers.map(member => <span key={member.id}>{member.name}</span>)}</div></div>
      </section>

      <section className="universe-report-section orbit-report">
        <span className="universe-report-kicker">03 · YOUR ORBIT</span>
        <h3>The people your signal returns to</h3>
        <p className="universe-report-lede">Ranked by adjacent-message interactions in the retained network. This is conversational rhythm, not a friendship leaderboard.</p>
        <div className="universe-orbit-list">
          {visibleOrbit.length ? visibleOrbit.map((member, index) => <OrbitRow key={member.node.id} member={member} rank={index + 1} />) : <p className="universe-report-empty">No retained orbit connections yet.</p>}
        </div>
        {remainingOrbit.length > 0 && <details className="universe-orbit-more"><summary>Show all {insight.orbit.length} orbit members</summary><div>{remainingOrbit.map((member, index) => <OrbitRow key={member.node.id} member={member} rank={index + 9} />)}</div></details>}
      </section>

      <section className="universe-report-section astrology-report">
        <span className="universe-report-kicker">04 · COSMIC LENS</span>
        <h3>Add your Sun and Rising signs</h3>
        <p className="universe-report-lede">The Sun describes the identity you grow into; the Rising sign describes how you enter experience and determines the chart ruler. Choose the Rising only if you know it—calculating it accurately requires birth time and location.</p>
        <div className="universe-sign-selectors">
          <label><span>Sun sign</span><select value={sun} onChange={event => setSun(isZodiacSign(event.target.value) ? event.target.value : '')}><option value="">Choose sign</option>{ZODIAC_SIGNS.map(sign => <option key={sign} value={sign}>{ZODIAC[sign].glyph} {ZODIAC[sign].name}</option>)}</select></label>
          <label><span>Rising sign</span><select value={rising} onChange={event => setRising(isZodiacSign(event.target.value) ? event.target.value : '')}><option value="">Choose rising</option>{ZODIAC_SIGNS.map(sign => <option key={sign} value={sign}>{ZODIAC[sign].glyph} {ZODIAC[sign].name}</option>)}</select></label>
        </div>
        {!sun && !rising && <div className="universe-cosmic-placeholder"><span>☉</span><p>Select a sign to layer traditional astrology over your measured groupchat position.</p></div>}
        {reading.sun && <article className="universe-reading"><span>{ZODIAC[sun as ZodiacSign].glyph}</span><div><small>{ZODIAC[sun as ZodiacSign].name.toUpperCase()} SUN · {reading.sun.title.toUpperCase()}</small><p>{reading.sun.body}</p><em>{reading.sun.watch}</em></div></article>}
        {reading.rising && <article className="universe-reading"><span>{ZODIAC[rising as ZodiacSign].glyph}</span><div><small>{ZODIAC[rising as ZodiacSign].name.toUpperCase()} RISING · {reading.rising.title.toUpperCase()}</small><p>{reading.rising.body}</p><em>{reading.rising.ruler}</em></div></article>}
        {reading.synthesis && <div className="universe-synthesis">
          <div className="universe-synthesis-title"><span>{ZODIAC[sun as ZodiacSign].glyph}<i>×</i>{ZODIAC[rising as ZodiacSign].glyph}</span><div><small>SUN + RISING SYNTHESIS</small><h4>{reading.synthesis.title}</h4><p>{reading.synthesis.subtitle}</p></div></div>
          <div className="universe-synthesis-tags">{reading.synthesis.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          <article><small>THE INNER–OUTER DYNAMIC</small><p>{reading.synthesis.dynamic}</p></article>
          <article><small>HOW IT LANDS HERE</small><p>{reading.synthesis.community}</p></article>
          <article><small>UNDER PRESSURE</small><p>{reading.synthesis.pressure}</p></article>
          <article><small>THE GROWTH KEY</small><p>{reading.synthesis.growth}</p></article>
          <blockquote><small>INTERPRETIVE FORECAST</small><p>{reading.synthesis.forecast}</p></blockquote>
        </div>}
        <p className="universe-astrology-note">Method: traditional sign rulers, element, modality, polarity, and the whole-sign relationship between Sun and Ascendant. Exact aspects and a full natal chart require birth date, precise time, and location. Astrology is an interpretive entertainment layer; role, community, ranks, and orbit come from the actual chat graph.</p>
      </section>
    </div>
  );
}
