'use client';

import { useEffect, useRef, useState } from 'react';
import type { UniverseEdge, UniverseGraph } from '@/lib/universe/types';
import type { GalaxySceneHandle } from './scene/GalaxyScene';
import type { SceneState } from './scene/starAttributes';

export type UniverseMode = 'overview' | 'orbit' | 'cluster' | 'relationship';

type Props = {
  graph: UniverseGraph;
  mode: UniverseMode;
  selectedId: string | null;
  orbitRoot: string | null;
  clusterId: number | null;
  relationship: UniverseEdge | null;
  timeIndex: number;
  onSelect: (id: string) => void;
};

export function UniverseCanvas(props: Props) {
  const { graph, mode, selectedId, orbitRoot, clusterId, relationship, timeIndex, onSelect } = props;
  const glRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<GalaxySceneHandle | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const stateRef = useRef<SceneState>({ mode, selectedId, orbitRoot, clusterId, relationship, timeIndex });
  stateRef.current = { mode, selectedId, orbitRoot, clusterId, relationship, timeIndex };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    // Dynamic import keeps three out of every other route's JS.
    import('./scene/GalaxyScene')
      .then(({ createGalaxyScene }) => {
        if (disposed || !glRef.current || !labelRef.current) return;
        handleRef.current = createGalaxyScene({
          canvas: glRef.current,
          labelCanvas: labelRef.current,
          graph,
          onSelect: id => selectRef.current(id),
          onFallback: () => setFailed(true),
        });
        handleRef.current.setState(stateRef.current);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [graph]);

  useEffect(() => {
    handleRef.current?.setState({ mode, selectedId, orbitRoot, clusterId, relationship, timeIndex });
  }, [mode, selectedId, orbitRoot, clusterId, relationship, timeIndex]);

  return (
    <div className="universe-space-scene">
      <canvas ref={glRef} className="universe-space-gl" aria-hidden="true" />
      <canvas
        ref={labelRef} className="universe-canvas" tabIndex={0} role="img"
        aria-label="Interactive three-dimensional galaxy of groupchat members. Drag to orbit, pinch or scroll to fly, tap a star for details."
      />
      {failed && (
        <div className="universe-fallback" role="status">
          <b>The galaxy needs WebGL.</b>
          <span>Your browser blocked 3D rendering — search and member details above still work.</span>
        </div>
      )}
      <div className="universe-depth-vignette" aria-hidden="true" />
    </div>
  );
}
