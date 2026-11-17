import React from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FlaskConical,
  GitCompare,
  Info,
  SearchCode,
} from 'lucide-react';
import { HistoryItem, SimulationResult, SimulationState } from '../types/cache';
import { formatClockUtc } from '../utilities/httpFormatters';
import { NavSection } from './Sidebar';

interface OverviewViewProps {
  simState: SimulationState;
  lastResult: SimulationResult | null;
  history: HistoryItem[];
  onNavigate: (section: NavSection) => void;
  onStartDemoJourney: () => void;
  onReopenHistoryItem: (item: HistoryItem) => void;
}

const DEMO_STEPS = [
  'Run the initial GET request to https://api.example.com/products',
  'Observe CACHE_MISS and response storage (max-age=60, ETag "products-v1")',
  'Advance simulated time by +10s and run the same request again',
  'Observe CACHE_HIT served directly with zero origin contact',
  'Advance simulated time beyond 60s (+1m or +1h) and run again',
  'Observe CACHE_STALE expiration and conditional header preparation',
  'Click Revalidate with Origin: 304 Not Modified to refresh TTL & reuse body',
];

export function OverviewView({
  simState,
  lastResult,
  history,
  onNavigate,
  onStartDemoJourney,
  onReopenHistoryItem,
}: OverviewViewProps) {
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-cyan-600 dark:text-cyan-400">
              <span>CacheLab</span>
              <span aria-hidden="true">·</span>
              <span>HTTP Caching Simulator &amp; Inspector</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Experiment with HTTP caching decisions in deterministic simulated time
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Configure requests, origin headers, and cache environments to inspect why responses
              are stored, served fresh, marked stale, or revalidated with conditional{' '}
              <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                304 Not Modified
              </code>{' '}
              responses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onStartDemoJourney}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors whitespace-nowrap"
            >
              Launch Default Demo
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('scenarios')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Browse 9 Scenarios
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
          <Info className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Educational Scope Notice:
            </span>{' '}
            CacheLab implements a deterministic, educational subset of HTTP caching rules (freshness
            lifetime, Age, Vary, conditional ETag/Last-Modified validation, and private vs. shared
            cache visibility). It is not a full implementation of every RFC 9111 edge case such as
            heuristic freshness or clock-skew correction.
          </p>
        </div>
      </section>

      {/* Primary Workspace Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <ToolCard
          icon={Activity}
          title="Cache Simulator"
          description="Edit requests, origin headers, and simulated clock time with live SVG request flow tracing."
          actionLabel="Open Simulator"
          onClick={() => onNavigate('simulator')}
        />
        <ToolCard
          icon={SearchCode}
          title="Header Inspector"
          description="Paste raw HTTP response headers to parse directives, detect conflicts, and inspect freshness."
          actionLabel="Inspect Headers"
          onClick={() => onNavigate('inspector')}
        />
        <ToolCard
          icon={FlaskConical}
          title="Scenario Lab"
          description="Load 9 runnable presets covering miss, hit, stale, 304, 200, no-store, no-cache, and Vary."
          actionLabel="Open Scenarios"
          onClick={() => onNavigate('scenarios')}
        />
        <ToolCard
          icon={GitCompare}
          title="Compare Policies"
          description="Run two policies side by side over configurable time intervals using the real engine."
          actionLabel="Compare Policies"
          onClick={() => onNavigate('compare')}
        />
      </section>

      {/* Bottom Split: Guided Demo Journey + Live Cache & History Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Recommended Walkthrough: Miss to 304 Revalidation
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('learn')}
                className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Learning Center
              </button>
            </div>

            <ol className="space-y-2">
              {DEMO_STEPS.map((step, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300"
                >
                  <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              Current Clock: {formatClockUtc(simState.simulatedTimeMs)}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('simulator')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              Go to Simulator
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Current Workspace State
            </h2>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {simState.environment === 'private' ? 'Private Cache' : 'Shared Cache'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-3">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Stored Entries</div>
              <div className="text-lg font-mono font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {simState.entries.length}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-3">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Last Decision</div>
              <div className="text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 mt-1.5 truncate">
                {lastResult ? lastResult.decision : 'None yet'}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Recent Local Runs
            </div>
            {history.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-800 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                No simulations recorded yet. Run your first request in Cache Simulator.
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onReopenHistoryItem(item)}
                    className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] hover:border-cyan-500/40 px-3 py-2 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {item.scenarioName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {item.requestMethod} {item.requestUrl}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-cyan-600 dark:text-cyan-400 shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      {item.decision}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ToolCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 flex flex-col justify-between space-y-4">
      <div className="space-y-2">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline self-start"
      >
        {actionLabel}
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
