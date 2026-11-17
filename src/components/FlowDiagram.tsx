import React, { useState } from 'react';
import { FlowNodeId, SimulationResult } from '../types/cache';

interface FlowDiagramProps {
  result: SimulationResult | null;
}

interface NodeDef {
  id: FlowNodeId;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  w: number;
  h: number;
  explanation: string;
}

const NODES: NodeDef[] = [
  {
    id: 'request',
    label: 'REQUEST',
    sublabel: 'Method + URL',
    x: 20,
    y: 162,
    w: 112,
    h: 52,
    explanation: 'An incoming HTTP request enters the cache pipeline with its method, target URL, and request headers.',
  },
  {
    id: 'lookup',
    label: 'CACHE LOOKUP',
    sublabel: 'Method & Vary key',
    x: 164,
    y: 162,
    w: 126,
    h: 52,
    explanation: 'The cache checks whether the method is cacheable (GET/HEAD) and searches stored entries matching URL and Vary headers.',
  },
  {
    id: 'bypass',
    label: 'BYPASS',
    sublabel: 'Non-cacheable',
    x: 164,
    y: 44,
    w: 126,
    h: 48,
    explanation: 'Unsafe methods (POST, PUT, DELETE) or unstored HEAD misses bypass normal cache storage and forward to origin.',
  },
  {
    id: 'match',
    label: 'ENTRY FOUND?',
    sublabel: 'Key + Vary match',
    x: 322,
    y: 162,
    w: 124,
    h: 52,
    explanation: 'Evaluates whether a stored response matches the normalized URL and every header listed in the entry’s Vary header.',
  },
  {
    id: 'miss',
    label: 'CACHE MISS',
    sublabel: 'No variant match',
    x: 322,
    y: 44,
    w: 124,
    h: 48,
    explanation: 'No matching representation exists in the cache store, so the request must be sent to the origin server.',
  },
  {
    id: 'origin',
    label: 'ORIGIN SERVER',
    sublabel: 'Fetch response',
    x: 484,
    y: 44,
    w: 132,
    h: 48,
    explanation: 'The origin server processes the request and returns a full HTTP response with headers and optional representation body.',
  },
  {
    id: 'store_check',
    label: 'STORE CHECK',
    sublabel: 'Policy / private',
    x: 652,
    y: 44,
    w: 130,
    h: 48,
    explanation: 'Checks no-store, private (in shared caches), Vary: *, and status code rules before writing the entry into cache storage.',
  },
  {
    id: 'fresh_check',
    label: 'FRESH?',
    sublabel: 'age < lifetime',
    x: 484,
    y: 162,
    w: 124,
    h: 52,
    explanation: 'Compares current age (initial Age + resident time) against freshness lifetime (s-maxage, max-age, or Expires - Date), unless no-cache forces validation.',
  },
  {
    id: 'hit',
    label: 'CACHE HIT',
    sublabel: 'Fresh / SWR',
    x: 652,
    y: 136,
    w: 130,
    h: 48,
    explanation: 'The stored response is fresh (or within stale-while-revalidate) and can be served immediately without origin contact.',
  },
  {
    id: 'validation_check',
    label: 'REVALIDATE?',
    sublabel: 'Stale / no-cache',
    x: 484,
    y: 266,
    w: 132,
    h: 52,
    explanation: 'The entry is stale or marked no-cache. If ETag or Last-Modified validators exist, a conditional request can verify freshness.',
  },
  {
    id: 'conditional_request',
    label: 'CONDITIONAL',
    sublabel: 'If-None-Match / IMS',
    x: 652,
    y: 266,
    w: 134,
    h: 52,
    explanation: 'Sends If-None-Match (ETag) and/or If-Modified-Since (Last-Modified) to ask the origin if the cached body is still valid.',
  },
  {
    id: 'outcome_304',
    label: '304 REUSE',
    sublabel: 'Refresh metadata',
    x: 484,
    y: 344,
    w: 132,
    h: 44,
    explanation: 'Origin confirmed the resource did not change (304 Not Modified). Cache refreshes headers/TTL and reuses the stored body.',
  },
  {
    id: 'outcome_200',
    label: '200 REPLACE',
    sublabel: 'New payload',
    x: 652,
    y: 344,
    w: 134,
    h: 44,
    explanation: 'Origin returned a modified 200 OK representation. The cache replaces the old entry if the new response is cacheable.',
  },
  {
    id: 'serve',
    label: 'SERVE CLIENT',
    sublabel: 'Final HTTP response',
    x: 822,
    y: 162,
    w: 122,
    h: 52,
    explanation: 'Delivers the final HTTP status, headers, and body to the client.',
  },
];

interface EdgeDef {
  id: string;
  d: string;
  label?: string;
  lx?: number;
  ly?: number;
}

const EDGES: EdgeDef[] = [
  { id: 'request->lookup', d: 'M 132 188 L 164 188' },
  { id: 'lookup->bypass', d: 'M 227 162 L 227 92', label: 'Unsafe', lx: 233, ly: 130 },
  { id: 'bypass->origin', d: 'M 290 68 L 484 68' },
  { id: 'lookup->match', d: 'M 290 188 L 322 188' },
  { id: 'match->miss', d: 'M 384 162 L 384 92', label: 'No', lx: 392, ly: 130 },
  { id: 'miss->origin', d: 'M 446 68 L 484 68' },
  { id: 'origin->store_check', d: 'M 616 68 L 652 68' },
  { id: 'origin->serve', d: 'M 616 80 C 710 112, 790 112, 855 162' },
  { id: 'store_check->serve', d: 'M 782 68 L 883 68 L 883 162' },
  { id: 'match->fresh_check', d: 'M 446 188 L 484 188', label: 'Yes', lx: 458, ly: 180 },
  { id: 'fresh_check->hit', d: 'M 608 176 L 652 160', label: 'Yes', lx: 622, ly: 158 },
  { id: 'hit->serve', d: 'M 782 160 L 822 182' },
  { id: 'fresh_check->validation_check', d: 'M 546 214 L 546 266', label: 'No', lx: 554, ly: 244 },
  { id: 'validation_check->origin', d: 'M 484 286 L 456 286 L 456 84 L 484 84', label: 'No val', lx: 416, ly: 248 },
  { id: 'validation_check->conditional_request', d: 'M 616 292 L 652 292', label: 'Yes', lx: 626, ly: 284 },
  { id: 'conditional_request->outcome_304', d: 'M 652 310 L 616 356', label: '304', lx: 618, ly: 326 },
  { id: 'conditional_request->outcome_200', d: 'M 719 318 L 719 344', label: '200', lx: 726, ly: 335 },
  { id: 'outcome_304->serve', d: 'M 616 368 L 883 368 L 883 214' },
  { id: 'outcome_200->serve', d: 'M 786 368 L 883 368 L 883 214' },
];

export function FlowDiagram({ result }: FlowDiagramProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<FlowNodeId>('request');

  const visitedSet = new Set<FlowNodeId>(result?.flowTrace.visitedNodes ?? []);
  const activeEdgeSet = new Set<string>(result?.flowTrace.activeEdges ?? []);
  const visualState = result?.flowTrace.visualState;

  const activeStrokeColor =
    visualState === 'hit'
      ? '#10b981'
      : visualState === 'stale' || visualState === 'revalidation'
        ? '#f59e0b'
        : visualState === 'bypass'
          ? '#ef4444'
          : '#06b6d4';

  const selectedNode = NODES.find((n) => n.id === selectedNodeId) ?? NODES[0];

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Request Flow Visualization
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click any stage node to inspect its protocol rule. Path reflects the live engine trace.
          </p>
        </div>

        {/* Compact Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" aria-hidden="true" />
            Hit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" aria-hidden="true" />
            Miss / Origin
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" aria-hidden="true" />
            Stale / Revalidate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" aria-hidden="true" />
            Bypass / Blocked
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-2">
        <svg
          viewBox="0 0 964 404"
          className="w-full min-w-[680px] h-auto select-none"
          role="img"
          aria-label="HTTP caching decision flow diagram"
        >
          <defs>
            <marker
              id="arrow-muted"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" className="fill-slate-400 dark:fill-slate-600" />
            </marker>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill={activeStrokeColor} />
            </marker>
          </defs>

          {/* Inactive Edges */}
          {EDGES.filter((e) => !activeEdgeSet.has(e.id)).map((edge) => (
            <g key={edge.id}>
              <path
                d={edge.d}
                fill="none"
                strokeWidth="1.5"
                className="stroke-slate-300 dark:stroke-slate-700"
                markerEnd="url(#arrow-muted)"
              />
              {edge.label && edge.lx !== undefined && edge.ly !== undefined && (
                <text
                  x={edge.lx}
                  y={edge.ly}
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                >
                  {edge.label}
                </text>
              )}
            </g>
          ))}

          {/* Active Animated Edges */}
          {EDGES.filter((e) => activeEdgeSet.has(e.id)).map((edge) => (
            <g key={`active-${edge.id}`}>
              <path
                d={edge.d}
                fill="none"
                stroke={activeStrokeColor}
                strokeWidth="2.5"
                strokeDasharray="6 6"
                className="animate-flow-dash"
                markerEnd="url(#arrow-active)"
              />
              {edge.label && edge.lx !== undefined && edge.ly !== undefined && (
                <text
                  x={edge.lx}
                  y={edge.ly}
                  fill={activeStrokeColor}
                  className="text-[10px] font-mono font-semibold"
                >
                  {edge.label}
                </text>
              )}
            </g>
          ))}

          {/* Nodes */}
          {NODES.map((node) => {
            const isVisited = visitedSet.has(node.id);
            const isSelected = selectedNodeId === node.id;

            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedNodeId(node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedNodeId(node.id);
                  }
                }}
                className="cursor-pointer focus:outline-none"
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                  rx="8"
                  fill={isVisited ? `${activeStrokeColor}18` : undefined}
                  stroke={isVisited ? activeStrokeColor : isSelected ? '#38bdf8' : undefined}
                  strokeWidth={isVisited || isSelected ? 2 : 1.2}
                  className={
                    isVisited
                      ? ''
                      : 'fill-white dark:fill-[#131C2E] stroke-slate-300 dark:stroke-slate-700 hover:stroke-cyan-500'
                  }
                />
                <text
                  x={node.x + node.w / 2}
                  y={node.y + (node.h > 46 ? 22 : 19)}
                  textAnchor="middle"
                  className={`text-[11px] font-mono font-semibold ${
                    isVisited
                      ? 'fill-slate-900 dark:fill-white'
                      : 'fill-slate-700 dark:fill-slate-300'
                  }`}
                >
                  {node.label}
                </text>
                <text
                  x={node.x + node.w / 2}
                  y={node.y + (node.h > 46 ? 38 : 34)}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-500 dark:fill-slate-400"
                >
                  {node.sublabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Interactive Node Detail Strip */}
      <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320] px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-cyan-700 dark:text-cyan-300">
            <span>{selectedNode.label}</span>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="font-sans font-normal text-slate-500 dark:text-slate-400">
              {selectedNode.sublabel}
            </span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
            {selectedNode.explanation}
          </p>
        </div>
        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
          {result
            ? visitedSet.has(selectedNode.id)
              ? 'Visited in last run'
              : 'Not taken in last run'
            : 'Run simulation to trace'}
        </div>
      </div>
    </section>
  );
}
