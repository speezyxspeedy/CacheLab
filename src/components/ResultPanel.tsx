import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { CacheDecision, SimulationResult } from '../types/cache';
import { formatClockUtc, formatDuration } from '../utilities/httpFormatters';

interface ResultPanelProps {
  result: SimulationResult | null;
  onRunFirstDemo?: () => void;
}

const DECISION_META: Record<
  CacheDecision,
  {
    label: string;
    toneClass: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  CACHE_HIT: {
    label: 'Cache Hit',
    toneClass:
      'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  CACHE_MISS: {
    label: 'Cache Miss',
    toneClass: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-700 dark:text-cyan-300',
    icon: RefreshCw,
  },
  CACHE_STALE: {
    label: 'Cache Stale',
    toneClass: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300',
    icon: Clock,
  },
  REVALIDATION_REQUIRED: {
    label: 'Revalidation Required',
    toneClass: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300',
    icon: AlertTriangle,
  },
  CACHE_UPDATED: {
    label: 'Cache Updated',
    toneClass:
      'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  CACHE_BYPASS: {
    label: 'Cache Bypass',
    toneClass: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300',
    icon: XCircle,
  },
  CACHE_STORE_BLOCKED: {
    label: 'Storage Blocked',
    toneClass: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300',
    icon: ShieldAlert,
  },
};

export function ResultPanel({ result, onRunFirstDemo }: ResultPanelProps) {
  const [activeTab, setActiveTab] = useState<'events' | 'headers' | 'body'>('events');
  const [copiedType, setCopiedType] = useState<'req' | 'res' | null>(null);

  if (!result) {
    return (
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-6 text-center">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Simulation Result Panel
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
          Configure your HTTP request and origin response headers, then click{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">Run Simulation</span>{' '}
          to inspect cacheability, freshness math, and event logs.
        </p>
        {onRunFirstDemo && (
          <button
            type="button"
            onClick={onRunFirstDemo}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
          >
            Run Initial Request
          </button>
        )}
      </section>
    );
  }

  const meta = DECISION_META[result.decision];
  const DecisionIcon = meta.icon;

  const copyHeaders = async (headers: Record<string, string>, type: 'req' | 'res') => {
    const text = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      window.setTimeout(() => setCopiedType(null), 1600);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cachelab-${result.decision.toLowerCase()}-${result.simulatedTimeMs}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-4">
      {/* Decision Banner */}
      <div className={`rounded-lg border p-3.5 ${meta.toneClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <DecisionIcon className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-semibold">
                <span>{result.decision}</span>
                <span aria-hidden="true">·</span>
                <span>{meta.label}</span>
                <span aria-hidden="true">·</span>
                <span>
                  HTTP {result.httpStatus} {result.statusText}
                </span>
              </div>
              <p className="text-xs mt-1 leading-relaxed text-slate-800 dark:text-slate-100">
                {result.reason}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={exportJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white/80 dark:bg-slate-900/70 border border-current/20 hover:bg-white dark:hover:bg-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
        </div>
      </div>

      {/* Warnings if any */}
      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Header &amp; Freshness Notes</span>
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {result.warnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Telemetry Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <MetricCell
          label="Environment"
          value={result.environment === 'private' ? 'Private Cache' : 'Shared Cache'}
        />
        <MetricCell label="Simulated Time" value={formatClockUtc(result.simulatedTimeMs)} mono />
        <MetricCell
          label="Current Age"
          value={formatDuration(result.currentAgeSeconds)}
          mono
        />
        <MetricCell
          label="Freshness Lifetime"
          value={formatDuration(result.freshnessLifetimeSeconds)}
          mono
        />
        <MetricCell
          label="Remaining Freshness"
          value={formatDuration(result.remainingFreshnessSeconds)}
          mono
          highlight={
            result.remainingFreshnessSeconds !== null
              ? result.remainingFreshnessSeconds > 0
                ? 'positive'
                : 'negative'
              : undefined
          }
        />
        <MetricCell
          label="Origin Contact"
          value={result.originContactRequired ? 'Required' : 'Not Required'}
        />
        <MetricCell
          label="Validation"
          value={result.validationRequired ? 'Required' : 'Not Required'}
        />
        <MetricCell
          label="Stored in Cache"
          value={result.storedInCache ? 'Yes' : 'No'}
        />
      </div>

      {/* Tabs for Events / Headers / Body */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-1">
            <TabButton
              active={activeTab === 'events'}
              onClick={() => setActiveTab('events')}
              label={`Cache Events (${result.events.length})`}
            />
            <TabButton
              active={activeTab === 'headers'}
              onClick={() => setActiveTab('headers')}
              label="Headers Sent & Received"
            />
            <TabButton
              active={activeTab === 'body'}
              onClick={() => setActiveTab('body')}
              label="Response Body"
            />
          </div>

          {activeTab === 'headers' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => copyHeaders(result.requestHeadersSent, 'req')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                {copiedType === 'req' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                Copy Request Headers
              </button>
              <button
                type="button"
                onClick={() => copyHeaders(result.responseHeadersReceived, 'res')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                {copiedType === 'res' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                Copy Response Headers
              </button>
            </div>
          )}
        </div>

        {activeTab === 'events' && (
          <ol className="mt-3 space-y-2">
            {result.events.map((ev) => (
              <li
                key={ev.step}
                className="flex items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#0D1320] px-3 py-2"
              >
                <span className="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                  {ev.step}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {ev.title}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {formatClockUtc(ev.timestampMs)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                    {ev.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {activeTab === 'headers' && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320] p-3">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Request Headers Sent
              </div>
              {Object.keys(result.requestHeadersSent).length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">No request headers</div>
              ) : (
                <dl className="space-y-1 font-mono text-[11px]">
                  {Object.entries(result.requestHeadersSent).map(([k, v]) => (
                    <div key={k} className="flex gap-2 break-all">
                      <dt className="text-cyan-700 dark:text-cyan-400 shrink-0">{k}:</dt>
                      <dd className="text-slate-700 dark:text-slate-300">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320] p-3">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Response Headers Received
              </div>
              {Object.keys(result.responseHeadersReceived).length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">No response headers</div>
              ) : (
                <dl className="space-y-1 font-mono text-[11px]">
                  {Object.entries(result.responseHeadersReceived).map(([k, v]) => (
                    <div key={k} className="flex gap-2 break-all">
                      <dt className="text-emerald-700 dark:text-emerald-400 shrink-0">{k}:</dt>
                      <dd className="text-slate-700 dark:text-slate-300">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        )}

        {activeTab === 'body' && (
          <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-3">
            {result.responseBody ? (
              <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto whitespace-pre-wrap break-words">
                {result.responseBody}
              </pre>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Empty response body (expected for 204 No Content, 304 Not Modified metadata, or HEAD requests).
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function MetricCell({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: 'positive' | 'negative';
}) {
  const colorClass =
    highlight === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : highlight === 'negative'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-900 dark:text-slate-100';

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#0D1320] px-3 py-2">
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-xs font-semibold mt-0.5 truncate ${mono ? 'font-mono tabular-nums' : ''} ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
        active
          ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
      }`}
    >
      {label}
    </button>
  );
}
