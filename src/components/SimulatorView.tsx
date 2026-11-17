import React, { useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Database,
  History,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { calculateFreshness } from '../engine/cacheEngine';
import {
  CacheEnvironment,
  HistoryItem,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  RevalidationOutcome,
  SimulationResult,
  SimulationState,
} from '../types/cache';
import {
  DEFAULT_SIMULATED_TIME_MS,
  formatClockUtc,
  formatDuration,
  formatHttpRequestRaw,
  getStatusText,
  toHttpDate,
} from '../utilities/httpFormatters';
import { FlowDiagram } from './FlowDiagram';
import { ResultPanel } from './ResultPanel';

interface SimulatorViewProps {
  simState: SimulationState;
  request: HttpRequest;
  response: HttpResponse;
  result: SimulationResult | null;
  revalidationOutcome: RevalidationOutcome;
  activeScenarioTitle: string;
  history: HistoryItem[];
  onChangeEnvironment: (env: CacheEnvironment) => void;
  onChangeRequest: (req: HttpRequest) => void;
  onChangeResponse: (res: HttpResponse) => void;
  onChangeRevalidationOutcome: (outcome: RevalidationOutcome) => void;
  onRunSimulation: () => void;
  onAdvanceTime: (seconds: number) => void;
  onRevalidate: () => void;
  onReset: () => void;
  onClearCache: () => void;
  onRemoveCacheEntry: (key: string) => void;
  onReopenHistoryItem: (item: HistoryItem) => void;
  onDeleteHistoryItem: (id: string) => void;
  onClearHistory: () => void;
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'];

const STATUS_OPTIONS: Array<{ code: number; label: string }> = [
  { code: 200, label: '200 OK' },
  { code: 203, label: '203 Non-Authoritative Information' },
  { code: 204, label: '204 No Content' },
  { code: 301, label: '301 Moved Permanently' },
  { code: 404, label: '404 Not Found' },
  { code: 500, label: '500 Internal Server Error' },
];

const RESPONSE_PRESETS: Array<{ label: string; cacheControl: string }> = [
  { label: 'Public, max-age=3600', cacheControl: 'public, max-age=3600' },
  { label: 'Private, max-age=600', cacheControl: 'private, max-age=600' },
  { label: 'No-store', cacheControl: 'no-store' },
  { label: 'No-cache', cacheControl: 'no-cache' },
  { label: 'Must-revalidate', cacheControl: 'public, max-age=60, must-revalidate' },
  {
    label: 'Public, max-age=60, stale-while-revalidate=30',
    cacheControl: 'public, max-age=60, stale-while-revalidate=30',
  },
];

const STANDARD_RESPONSE_HEADERS = [
  'Cache-Control',
  'ETag',
  'Last-Modified',
  'Expires',
  'Date',
  'Age',
  'Vary',
];

export function SimulatorView({
  simState,
  request,
  response,
  result,
  revalidationOutcome,
  activeScenarioTitle,
  history,
  onChangeEnvironment,
  onChangeRequest,
  onChangeResponse,
  onChangeRevalidationOutcome,
  onRunSimulation,
  onAdvanceTime,
  onRevalidate,
  onReset,
  onClearCache,
  onRemoveCacheEntry,
  onReopenHistoryItem,
  onDeleteHistoryItem,
  onClearHistory,
}: SimulatorViewProps) {
  const [newReqHeaderKey, setNewReqHeaderKey] = useState('');
  const [newReqHeaderVal, setNewReqHeaderVal] = useState('');
  const [newResHeaderKey, setNewResHeaderKey] = useState('');
  const [newResHeaderVal, setNewResHeaderVal] = useState('');
  const [copiedRawReq, setCopiedRawReq] = useState(false);
  const [bottomPanelTab, setBottomPanelTab] = useState<'store' | 'history'>('store');

  const rawRequestPreview = useMemo(() => formatHttpRequestRaw(request), [request]);
  const elapsedFromDefaultSec = Math.round(
    (simState.simulatedTimeMs - DEFAULT_SIMULATED_TIME_MS) / 1000
  );

  const canRevalidateNow = Boolean(
    result?.canRevalidate ||
      simState.entries.some((e) => Boolean(e.etag || e.lastModified))
  );

  const updateRequestHeader = (oldKey: string, newKey: string, newValue: string) => {
    const entries = Object.entries(request.headers);
    const updated: Record<string, string> = {};
    for (const [k, v] of entries) {
      if (k === oldKey) {
        if (newKey.trim()) {
          updated[newKey] = newValue;
        }
      } else {
        updated[k] = v;
      }
    }
    onChangeRequest({ ...request, headers: updated });
  };

  const removeRequestHeader = (keyToRemove: string) => {
    const updated = { ...request.headers };
    delete updated[keyToRemove];
    onChangeRequest({ ...request, headers: updated });
  };

  const addRequestHeader = () => {
    const key = newReqHeaderKey.trim();
    if (!key) return;
    onChangeRequest({
      ...request,
      headers: { ...request.headers, [key]: newReqHeaderVal },
    });
    setNewReqHeaderKey('');
    setNewReqHeaderVal('');
  };

  const updateResponseHeader = (key: string, value: string) => {
    onChangeResponse({
      ...response,
      headers: { ...response.headers, [key]: value },
    });
  };

  const removeResponseHeader = (keyToRemove: string) => {
    const updated = { ...response.headers };
    delete updated[keyToRemove];
    onChangeResponse({ ...response, headers: updated });
  };

  const addResponseHeader = () => {
    const key = newResHeaderKey.trim();
    if (!key) return;
    onChangeResponse({
      ...response,
      headers: { ...response.headers, [key]: newResHeaderVal },
    });
    setNewResHeaderKey('');
    setNewResHeaderVal('');
  };

  const applyPreset = (cacheControlValue: string) => {
    onChangeResponse({
      ...response,
      headers: {
        ...response.headers,
        'Cache-Control': cacheControlValue,
        Date: response.headers.Date || toHttpDate(simState.simulatedTimeMs),
      },
    });
  };

  const copyRawRequest = async () => {
    try {
      await navigator.clipboard.writeText(rawRequestPreview);
      setCopiedRawReq(true);
      window.setTimeout(() => setCopiedRawReq(false), 1500);
    } catch {
      // Ignore clipboard permission denial
    }
  };

  const responseHeaderKeys = useMemo(() => {
    const keys = new Set<string>([
      ...STANDARD_RESPONSE_HEADERS,
      ...Object.keys(response.headers),
    ]);
    return Array.from(keys);
  }, [response.headers]);

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Simulated Clock & Simulation Controls */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Left: Context & Clock */}
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Active Configuration
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeScenarioTitle}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] px-3 py-1.5 flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Simulated Clock
                </div>
                <div className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatClockUtc(simState.simulatedTimeMs)}{' '}
                  <span className="text-cyan-600 dark:text-cyan-400">
                    ({elapsedFromDefaultSec >= 0 ? `+${elapsedFromDefaultSec}s` : `${elapsedFromDefaultSec}s`})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRunSimulation}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              Run Simulation
            </button>

            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-0.5">
              {[
                { label: '+10s', seconds: 10 },
                { label: '+1m', seconds: 60 },
                { label: '+1h', seconds: 3600 },
                { label: '+1d', seconds: 86400 },
              ].map((step) => (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => onAdvanceTime(step.seconds)}
                  className="px-2.5 py-1.5 rounded-md text-xs font-mono font-medium text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  {step.label}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2 py-1">
              <select
                aria-label="Simulated origin revalidation outcome"
                value={revalidationOutcome}
                onChange={(e) =>
                  onChangeRevalidationOutcome(e.target.value as RevalidationOutcome)
                }
                className="bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none pr-1"
              >
                <option value="304" className="bg-white dark:bg-slate-900">
                  Origin: 304 Not Modified
                </option>
                <option value="200" className="bg-white dark:bg-slate-900">
                  Origin: 200 Modified
                </option>
              </select>
              <button
                type="button"
                onClick={onRevalidate}
                disabled={!canRevalidateNow}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-3 h-3" />
                Revalidate
              </button>
            </div>

            <button
              type="button"
              onClick={onClearCache}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Cache ({simState.entries.length})
            </button>

            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>
      </section>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left Column: Request Editor + Response Configuration */}
        <div className="xl:col-span-5 space-y-4">
          {/* A. Request Editor */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Request Editor
              </h2>

              {/* Cache Environment Toggle */}
              <div
                role="group"
                aria-label="Cache environment"
                className="inline-flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#0B0F17]"
              >
                {(['private', 'shared'] as CacheEnvironment[]).map((env) => (
                  <button
                    key={env}
                    type="button"
                    onClick={() => onChangeEnvironment(env)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      simState.environment === env
                        ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {env === 'private' ? 'Private Cache' : 'Shared Cache'}
                  </button>
                ))}
              </div>
            </div>

            {/* Method + URL */}
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                aria-label="HTTP request method"
                value={request.method}
                onChange={(e) =>
                  onChangeRequest({ ...request, method: e.target.value as HttpMethod })
                }
                className="sm:w-28 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {HTTP_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>

              <input
                type="url"
                aria-label="Request URL"
                value={request.url}
                onChange={(e) => onChangeRequest({ ...request, url: e.target.value })}
                placeholder="https://api.example.com/products"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Request Headers */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Request Headers
              </div>
              <div className="space-y-1.5">
                {Object.entries(request.headers).map(([key, value], index) => (
                  <div key={`${key}-${index}`} className="flex items-center gap-2">
                    <input
                      type="text"
                      aria-label={`Request header name ${key}`}
                      value={key}
                      onChange={(e) => updateRequestHeader(key, e.target.value, value)}
                      className="w-2/5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-cyan-700 dark:text-cyan-300 focus:outline-none focus:border-cyan-500"
                    />
                    <input
                      type="text"
                      aria-label={`Request header value for ${key}`}
                      value={value}
                      onChange={(e) => updateRequestHeader(key, key, e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeRequestHeader(key)}
                      aria-label={`Remove ${key} header`}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Custom Request Header */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newReqHeaderKey}
                  onChange={(e) => setNewReqHeaderKey(e.target.value)}
                  placeholder="Header name (e.g. Accept-Encoding)"
                  className="w-2/5 px-2.5 py-1.5 rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                />
                <input
                  type="text"
                  value={newReqHeaderVal}
                  onChange={(e) => setNewReqHeaderVal(e.target.value)}
                  placeholder="Value"
                  className="flex-1 px-2.5 py-1.5 rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={addRequestHeader}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            </div>

            {/* Code-Editor-Style Request Preview */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/60 border-b border-slate-800 text-[11px] font-mono text-slate-400">
                <span>HTTP Request Preview</span>
                <button
                  type="button"
                  onClick={copyRawRequest}
                  className="inline-flex items-center gap-1 text-slate-300 hover:text-white transition-colors"
                >
                  {copiedRawReq ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copiedRawReq ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="p-3 text-xs font-mono leading-relaxed overflow-x-auto text-cyan-200">
                {rawRequestPreview}
              </pre>
            </div>
          </section>

          {/* B. Response Configuration */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Origin Response Configuration
              </h2>

              <select
                aria-label="Origin HTTP status code"
                value={response.status}
                onChange={(e) => {
                  const code = Number.parseInt(e.target.value, 10);
                  onChangeResponse({
                    ...response,
                    status: code,
                    statusText: getStatusText(code),
                  });
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Policy Presets */}
            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Quick Policy Presets
              </div>
              <div className="flex flex-wrap gap-1.5">
                {RESPONSE_PRESETS.map((preset) => {
                  const active = response.headers['Cache-Control'] === preset.cacheControl;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset.cacheControl)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono border transition-colors ${
                        active
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-700 dark:text-cyan-300'
                          : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-cyan-500/40'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Editable Response Headers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Response Headers
                </span>
                <button
                  type="button"
                  onClick={() => updateResponseHeader('Date', toHttpDate(simState.simulatedTimeMs))}
                  className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  Sync Date to Simulated Clock
                </button>
              </div>

              <div className="space-y-1.5">
                {responseHeaderKeys.map((key) => {
                  const value = response.headers[key] ?? '';
                  const isStandard = STANDARD_RESPONSE_HEADERS.includes(key);
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-32 shrink-0 text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
                        {key}
                      </span>
                      <input
                        type="text"
                        aria-label={`Response header ${key}`}
                        value={value}
                        placeholder={isStandard ? '(unset)' : ''}
                        onChange={(e) => updateResponseHeader(key, e.target.value)}
                        className="flex-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                      {value !== '' && (
                        <button
                          type="button"
                          onClick={() => removeResponseHeader(key)}
                          aria-label={`Clear ${key} header`}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add Custom Response Header */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newResHeaderKey}
                  onChange={(e) => setNewResHeaderKey(e.target.value)}
                  placeholder="Custom header name"
                  className="w-32 shrink-0 px-2.5 py-1.5 rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                />
                <input
                  type="text"
                  value={newResHeaderVal}
                  onChange={(e) => setNewResHeaderVal(e.target.value)}
                  placeholder="Value"
                  className="flex-1 px-2.5 py-1.5 rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={addResponseHeader}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            </div>

            {/* Simulated Origin Response Body */}
            <div className="space-y-1.5">
              <label
                htmlFor="origin-body-editor"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Simulated Origin Payload Body
              </label>
              <textarea
                id="origin-body-editor"
                rows={4}
                value={response.body}
                onChange={(e) => onChangeResponse({ ...response, body: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </section>
        </div>

        {/* Right Column: Flow Visualization, Result Panel, Cache Store & History */}
        <div className="xl:col-span-7 space-y-4">
          <FlowDiagram result={result} />

          <ResultPanel result={result} onRunFirstDemo={onRunSimulation} />

          {/* In-Memory Cache Store & Simulation History */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBottomPanelTab('store')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    bottomPanelTab === 'store'
                      ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  In-Memory Cache Store ({simState.entries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBottomPanelTab('history')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    bottomPanelTab === 'history'
                      ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  Simulation History ({history.length})
                </button>
              </div>

              {bottomPanelTab === 'history' && history.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                >
                  Clear History
                </button>
              )}
            </div>

            {bottomPanelTab === 'store' ? (
              simState.entries.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Cache store is currently empty. Run a cacheable GET request to store an entry.
                </div>
              ) : (
                <div className="space-y-2">
                  {simState.entries.map((entry) => {
                    const liveFreshness = calculateFreshness({
                      policy: entry.policy,
                      headers: entry.headers,
                      environment: simState.environment,
                      storedAtMs: entry.storedAtMs,
                      simulatedTimeMs: simState.simulatedTimeMs,
                    });
                    const isFresh = liveFreshness.status === 'fresh';
                    return (
                      <div
                        key={entry.key}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                            <span className="font-semibold text-slate-900 dark:text-slate-100 break-all">
                              {entry.key}
                            </span>
                            <span aria-hidden="true" className="text-slate-400">
                              ·
                            </span>
                            <span
                              className={
                                entry.policy.noCache
                                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                  : isFresh
                                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                    : 'text-amber-600 dark:text-amber-400 font-semibold'
                              }
                            >
                              {entry.policy.noCache
                                ? 'Revalidate on use'
                                : liveFreshness.status}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            <span>HTTP {entry.status}</span>
                            <span aria-hidden="true">·</span>
                            <span>Age: {formatDuration(liveFreshness.currentAgeSeconds)}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              TTL: {formatDuration(liveFreshness.freshnessLifetimeSeconds)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Remaining: {formatDuration(liveFreshness.remainingFreshnessSeconds)}
                            </span>
                            {entry.etag && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>ETag: {entry.etag}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveCacheEntry(entry.key)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-500 hover:border-red-500/40 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Evict
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : history.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No runs recorded yet. Simulations are saved locally in your browser.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                        <span>{item.scenarioName}</span>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="font-mono text-cyan-600 dark:text-cyan-400">
                          {item.decision}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        <span>
                          {item.requestMethod} {item.requestUrl}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Sim: {formatClockUtc(item.simulatedTimeMs)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onReopenHistoryItem(item)}
                        className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors whitespace-nowrap"
                      >
                        Reopen
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteHistoryItem(item.id)}
                        aria-label="Delete history item"
                        className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
