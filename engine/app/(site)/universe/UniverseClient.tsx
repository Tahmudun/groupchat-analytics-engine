'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { UniverseCluster, UniverseEdge, UniverseGraph, UniverseNode } from '@/lib/universe/types';
import { Pfp } from '../components/Avatars';
import { UniverseCanvas, type UniverseMode } from './UniverseCanvas';
import { UniverseReport } from './UniverseReport';

const fmt = (value: number) => value.toLocaleString('en-US');
const monthLabel = (month: string) => {
  const [year, number] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year!, number! - 1, 1)));
};

function isGraph(value: unknown): value is UniverseGraph {
  if (!value || typeof value !== 'object') return false;
  const graph = value as Partial<UniverseGraph>;
  return Array.isArray(graph.nodes) && Array.isArray(graph.edges) && Array.isArray(graph.clusters) && Array.isArray(graph.timeline);
}

function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} aria-pressed={active} onClick={onClick}><span aria-hidden="true">{icon}</span><b>{label}</b></button>;
}

function MemberSheet({ graph, node, cluster, onClose, onOrbit }: {
  graph: UniverseGraph;
  node: UniverseNode;
  cluster?: UniverseCluster;
  onClose: () => void;
  onOrbit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <aside className={`universe-sheet member-sheet${expanded ? ' expanded' : ''}`} aria-label={`${node.name} universe details`}>
      <div className="universe-sheet-handle" aria-hidden="true" />
      <button className="universe-sheet-close" aria-label="Close details" onClick={onClose}>×</button>
      <div className="universe-member-head"><Pfp name={node.id} size={62} /><div><span>IDENTIFIED SIGNAL</span><h2>{node.name}</h2><p>{node.role}</p></div></div>
      <p className="universe-member-quick">{fmt(node.messages)} messages <i>·</i> {fmt(node.connections)} connections</p>
      <div className="universe-member-summary">
        <span className={`universe-celestial-class ${node.celestial}`}>
          <i aria-hidden="true">{node.celestial === 'sun' ? '☀' : node.celestial === 'planet' ? '◉' : '✦'}</i>
          {node.celestial === 'sun' ? 'Stellar core' : node.celestial === 'planet' ? 'Major world' : 'Signal star'}
        </span>
        <div className="universe-role"><i style={{ background: cluster?.color }} /><span>{cluster?.name ?? 'Unclassified orbit'}</span></div>
        <dl className="universe-metrics">
          <div><dt>Connections</dt><dd>{fmt(node.connections)}</dd></div>
          <div><dt>Shared signals</dt><dd>{fmt(node.interactionTotal)}</dd></div>
          <div><dt>Messages</dt><dd>{fmt(node.messages)}</dd></div>
        </dl>
        <p className="universe-explainer">Connections represent messages exchanged within 60 seconds—not a friendship ranking.</p>
      </div>
      <div className="universe-sheet-actions">
        <button className="universe-action primary" onClick={onOrbit}>{expanded ? 'Orbit' : 'Explore orbit'}</button>
        <Link className="universe-action" prefetch={false} href={`/member/${encodeURIComponent(node.id)}`}>{expanded ? 'Profile' : 'Open profile'}</Link>
        <button className="universe-action universe-sheet-expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Close' : 'Full report'}</button>
      </div>
      {expanded && <UniverseReport graph={graph} node={node} />}
    </aside>
  );
}

function RelationshipSheet({ edge, a, b, onClose, onBack }: {
  edge: UniverseEdge;
  a: UniverseNode;
  b: UniverseNode;
  onClose: () => void;
  onBack: () => void;
}) {
  return (
    <aside className="universe-sheet relationship" aria-label={`${a.name} and ${b.name} connection`}>
      <div className="universe-sheet-handle" aria-hidden="true" />
      <button className="universe-sheet-close" aria-label="Close relationship" onClick={onClose}>×</button>
      <button className="universe-back" onClick={onBack}>← Back to orbit</button>
      <div className="universe-pair">
        <span><Pfp name={a.id} size={58} /><b>{a.name}</b></span><i>×</i><span><Pfp name={b.id} size={58} /><b>{b.name}</b></span>
      </div>
      <span className="universe-tier">{edge.tier}</span>
      <strong className="universe-interactions">{fmt(edge.interactions)}</strong>
      <p>adjacent-message interactions</p>
      <div className="universe-strength"><i style={{ width: `${Math.round(18 + edge.strength * 82)}%` }} /></div>
      <p className="universe-explainer">A shared signal is counted when one member speaks within 60 seconds of the other.</p>
      <div className="universe-sheet-actions">
        <Link className="universe-action primary" prefetch={false} href={`/duos?a=${encodeURIComponent(a.id)}&b=${encodeURIComponent(b.id)}`}>Open their story</Link>
      </div>
    </aside>
  );
}

function ClusterSheet({ cluster, central, onClose }: { cluster: UniverseCluster; central?: UniverseNode; onClose: () => void }) {
  return (
    <aside className="universe-sheet cluster-sheet" aria-label={`${cluster.name} cluster`}>
      <div className="universe-sheet-handle" aria-hidden="true" />
      <button className="universe-sheet-close" aria-label="Close cluster details" onClick={onClose}>×</button>
      <span className="universe-cluster-orb" style={{ background: cluster.color }} />
      <span className="eyebrow">STRUCTURAL COMMUNITY</span>
      <h2>{cluster.name}</h2>
      <p>{cluster.members} members in this region</p>
      {central && <p>Central signal: <button onClick={() => location.assign(`/member/${encodeURIComponent(central.id)}`)}>{central.name}</button></p>}
      <p className="universe-explainer">Cluster names are neutral system labels derived from connection structure, not official group names.</p>
    </aside>
  );
}

export function UniverseClient() {
  const [graph, setGraph] = useState<UniverseGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<UniverseMode>('overview');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orbitRoot, setOrbitRoot] = useState<string | null>(null);
  const [clusterId, setClusterId] = useState<number | null>(null);
  const [relationship, setRelationship] = useState<UniverseEdge | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [timeValue, setTimeValue] = useState(-1);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [intro, setIntro] = useState(false);
  const [findingSelf, setFindingSelf] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add('universe-lock');
    return () => document.body.classList.remove('universe-lock');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch('/api/flix/universe', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Universe request failed (${response.status})`);
        const body: unknown = await response.json();
        const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : null;
        if (!isGraph(data)) throw new Error('Universe returned an invalid graph');
        setGraph(data);
        setTimeValue(-1);
        const viewer = localStorage.getItem('flix_profile_username');
        if (viewer && data.nodes.some(node => node.id === viewer)) {
          setSelectedId(viewer); setOrbitRoot(viewer); setMode('orbit');
        }
        const seen = localStorage.getItem('netflixia_universe_seen');
        if (!seen) { setIntro(true); localStorage.setItem('netflixia_universe_seen', '1'); }
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The universe could not be loaded.'); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!intro) return;
    const timer = window.setTimeout(() => setIntro(false), 2800);
    return () => window.clearTimeout(timer);
  }, [intro]);

  useEffect(() => {
    if (!playing || !graph || graph.timeline.length === 0) return;
    const timer = window.setInterval(() => setTimeValue(value => {
      if (value < 0) return 0;
      if (value >= graph.timeline.length - 1) { setPlaying(false); return -1; }
      return value + 1;
    }), 900);
    return () => window.clearInterval(timer);
  }, [playing, graph]);

  const nodeById = useMemo(() => new Map(graph?.nodes.map(node => [node.id, node]) ?? []), [graph]);
  const clusterById = useMemo(() => new Map(graph?.clusters.map(cluster => [cluster.id, cluster]) ?? []), [graph]);
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const activeCluster = clusterId != null ? clusterById.get(clusterId) ?? null : null;
  const results = useMemo(() => {
    if (!graph || !query.trim()) return [];
    const term = query.trim().toLocaleLowerCase();
    return graph.nodes.filter(node => node.name.toLocaleLowerCase().includes(term) || node.id.toLocaleLowerCase().includes(term)).slice(0, 8);
  }, [graph, query]);

  const selectNode = (id: string) => {
    if (!graph) return;
    setTimelineOpen(false); setPlaying(false); setTimeValue(-1);
    if (mode === 'orbit' && orbitRoot && id !== orbitRoot) {
      const edge = graph.edges.find(item => (item.a === orbitRoot && item.b === id) || (item.b === orbitRoot && item.a === id));
      if (edge) { setRelationship(edge); setSelectedId(id); setMode('relationship'); return; }
    }
    setRelationship(null); setSelectedId(id); setClusterId(null);
  };

  const chooseSearch = (node: UniverseNode) => {
    searchRef.current?.blur();
    setQuery(''); setSearchOpen(false); setTimelineOpen(false); setPlaying(false); setTimeValue(-1);
    setRelationship(null); setSelectedId(node.id); setClusterId(null);
    if (findingSelf) {
      localStorage.setItem('flix_profile_username', node.id);
      localStorage.setItem('flix_profile', node.name.slice(0, 1).toUpperCase());
      window.dispatchEvent(new Event('flix-profile-change'));
      setFindingSelf(false); setOrbitRoot(node.id); setMode('orbit');
    } else setMode('overview');
  };

  const showOverview = () => {
    setTimelineOpen(false); setPlaying(false); setTimeValue(-1); setMode('overview');
    setRelationship(null); setOrbitRoot(null); setClusterId(null);
  };
  const showOrbit = (id?: string) => {
    const root = id ?? selectedId ?? localStorage.getItem('flix_profile_username');
    if (!root || !nodeById.has(root)) { setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); return; }
    setTimelineOpen(false); setPlaying(false); setTimeValue(-1); setSelectedId(root); setOrbitRoot(root);
    setRelationship(null); setClusterId(null); setMode('orbit');
  };
  const showClusters = () => {
    const id = selected?.cluster ?? clusterId ?? 0;
    setTimelineOpen(false); setPlaying(false); setTimeValue(-1); setClusterId(id); setRelationship(null); setMode('cluster');
  };
  const toggleTimeline = () => {
    if (timelineOpen) { setTimelineOpen(false); setPlaying(false); setTimeValue(-1); return; }
    setTimelineOpen(true); setPlaying(false); setMode('overview'); setRelationship(null);
    setSelectedId(null); setOrbitRoot(null); setClusterId(null);
  };
  const findMe = () => {
    const viewer = localStorage.getItem('flix_profile_username');
    if (viewer && nodeById.has(viewer)) showOrbit(viewer);
    else { setFindingSelf(true); setSearchOpen(true); setQuery(''); requestAnimationFrame(() => searchRef.current?.focus()); }
  };

  if (error) return <div className="universe-state"><span className="universe-state-orb error" /><h1>Signal lost</h1><p>{error}</p><button onClick={() => setAttempt(value => value + 1)}>Reconnect</button></div>;
  if (!graph) return <div className="universe-state" aria-busy="true"><span className="universe-state-orb" /><h1>Mapping the universe</h1><p>Resolving members, connections and timelines…</p></div>;

  const relationA = relationship ? nodeById.get(relationship.a) : null;
  const relationB = relationship ? nodeById.get(relationship.b) : null;
  const timeLabel = timeValue < 0 ? 'Current universe' : monthLabel(graph.timeline[timeValue]!);
  const planetCount = graph.nodes.filter(node => node.celestial === 'planet').length;
  const hasSheet = Boolean(relationship || (mode === 'cluster' && activeCluster) || selected);

  return (
    <section className={`universe-page${intro ? ' intro-active' : ''}${hasSheet ? ' has-sheet' : ''}`}>
      {intro && <button className="universe-intro" onClick={() => setIntro(false)} aria-label="Skip universe introduction"><span>NETFLIXIA</span><b>CINEMATIC UNIVERSE</b><i>ENTERING THE NETWORK</i></button>}
      <UniverseCanvas graph={graph} mode={mode} selectedId={selectedId} orbitRoot={orbitRoot} clusterId={clusterId}
        relationship={relationship} timeIndex={timeValue} onSelect={selectNode} />

      <header className="universe-hud">
        <div className="universe-brand"><span>NETFLIXIA</span><b>UNIVERSE</b><small>{fmt(graph.stats.members)} signals · {fmt(graph.stats.connections)} connections</small>
          <div className="universe-celestial-legend" aria-label={`One sun, ${planetCount} planets, and the deep field`}>
            <span className="sun">☀ 1 SUN</span><span>◉ {planetCount} PLANETS</span><span>✦ DEEP FIELD</span>
          </div>
        </div>
        <div className={`universe-search${searchOpen ? ' open' : ''}`}>
          <button aria-label="Search the universe" onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }}>⌕</button>
          <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} onFocus={() => setSearchOpen(true)}
            placeholder={findingSelf ? 'Choose your signal…' : 'Find anyone…'} aria-label={findingSelf ? 'Choose your profile' : 'Find a member'} />
          {searchOpen && <button className="close" aria-label="Close search" onClick={() => { setSearchOpen(false); setFindingSelf(false); setQuery(''); }}>×</button>}
          {searchOpen && query && <div className="universe-results">
            {results.length ? results.map(node => <button key={node.id} onClick={() => chooseSearch(node)}><Pfp name={node.id} size={34} /><span><b>{node.name}</b><small>{node.role}</small></span></button>) : <p>No matching signal.</p>}
          </div>}
        </div>
        <button className="universe-find" onClick={findMe}>◎ <span>Find me</span></button>
      </header>

      <nav className="universe-modes" aria-label="Universe views">
        <ModeButton active={mode === 'overview'} icon="✦" label="Overview" onClick={showOverview} />
        <ModeButton active={mode === 'orbit' || mode === 'relationship'} icon="◎" label="My Orbit" onClick={() => showOrbit()} />
        <ModeButton active={mode === 'cluster'} icon="◉" label="Clusters" onClick={showClusters} />
        <ModeButton active={timelineOpen} icon="⌁" label="Time" onClick={toggleTimeline} />
      </nav>

      {mode === 'cluster' && <div className="universe-cluster-picker" aria-label="Choose a cluster">
        {graph.clusters.map(cluster => <button key={cluster.id} className={cluster.id === clusterId ? 'active' : ''}
          style={{ '--cluster': cluster.color } as React.CSSProperties} onClick={() => setClusterId(cluster.id)}>{cluster.name}<small>{cluster.members}</small></button>)}
      </div>}

      {timelineOpen && <div className="universe-timeline">
        <button aria-label={playing ? 'Pause time travel' : 'Play time travel'} onClick={() => setPlaying(value => !value)}>{playing ? 'Ⅱ' : '▶'}</button>
        <div><span>TIME STATE</span><b>{timeLabel}</b><input aria-label="Universe month" type="range" min="0" max={graph.timeline.length}
          value={timeValue < 0 ? graph.timeline.length : timeValue}
          onChange={event => { setPlaying(false); const value = Number(event.target.value); setTimeValue(value === graph.timeline.length ? -1 : value); }} /></div>
      </div>}

      {relationship && relationA && relationB
        ? <RelationshipSheet edge={relationship} a={relationA} b={relationB} onClose={showOverview} onBack={() => showOrbit(orbitRoot ?? relationA.id)} />
        : mode === 'cluster' && activeCluster
          ? <ClusterSheet cluster={activeCluster} central={nodeById.get(activeCluster.centralMember)} onClose={showOverview} />
          : selected && <MemberSheet key={selected.id} graph={graph} node={selected} cluster={clusterById.get(selected.cluster)} onClose={() => setSelectedId(null)} onOrbit={() => showOrbit(selected.id)} />}

      <p className="universe-help"><span>Drag to orbit · pinch or scroll to fly · tap a star</span><b>Drag sideways to explore · pinch to fly · tap a world</b></p>
      <div className="universe-sr" aria-live="polite">{relationship && relationA && relationB ? `${relationA.name} and ${relationB.name}: ${relationship.interactions} adjacent-message interactions.` : selected ? `${selected.name}. ${selected.role}. ${selected.connections} connections.` : 'Universe overview.'}</div>
    </section>
  );
}
