import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, SearchCode, Trash2, XCircle } from 'lucide-react';
import { inspectHeaders } from '../engine/cacheEngine';
import { CacheEnvironment } from '../types/cache';
import { DEFAULT_SIMULATED_TIME_MS, formatClockUtc, formatDuration } from '../utilities/httpFormatters';

const DEFAULT_RAW_HEADERS = `HTTP/1.1 200 OK
Date: Tue, 17 Nov 2026 10:00:00 GMT
Cache-Control: public, max-age=3600
ETag: "abc123"
Vary: Accept-Encoding`;

const SAMPLE_INPUTS: Array<{ label: string; text: string }> = [
  {
    label: 'Public + ETag',
    text: DEFAULT_RAW_HEADERS,
  },
  {
    label: 'Shared CDN + s-maxage',
    text: `HTTP/1.1 200 OK
Date: Tue, 17 Nov 2026 10:00:00 GMT
Cache-Control: public, max-age=60, s-maxage=3600, stale-while-revalidate=30
Age: 15
ETag: W/"catalog-v4"
Vary: Accept, Accept-Language`,
  },
  {
    label: 'Conflicting Directives',
    text: `HTTP/1.1 200 OK
Date: Tue, 17 Nov 2026 10:00:00 GMT
Cache-Control: public, private, no-store, max-age=300, x-edge-tag=beta
ETag: "token-1"
Vary: *`,
  },
  {
    label: 'Malformed Example',
    text: `HTTP/1.1 200 OK
Date: Not-A-Valid-Date
Cache-Control: max-age=abc
Age: -42
MissingColonHeaderLine`,
  },
];

export function HeaderInspectorView() {
  const [rawInput, setRawInput] = useState(DEFAULT_RAW_HEADERS);
  const [environment, setEnvironment] = useState<CacheEnvironment>('shared');
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const inspection = useMemo(
    () => inspectHeaders(rawInput, DEFAULT_SIMULATED_TIME_MS, environment),
    [rawInput, environment]
  );

  const rebuildRawInput = (
    statusLine: string | undefined,
    updatedHeaders: Record<string, string>
  ) => {
    const lines: string[] = [];
    if (statusLine) {
      lines.push(statusLine);
    }
    for (const [k, v] of Object.entries(updatedHeaders)) {
      if (k.trim()) {
        lines.push(`${k}: ${v}`);
      }
    }
    setRawInput(lines.join('\n'));
  };

  const handleHeaderEdit = (key: string, nextValue: string) => {
    const updated = { ...inspection.headers, [key]: nextValue };
    rebuildRawInput(inspection.statusLine, updated);
  };

  const handleRemoveHeader = (key: string) => {
    const updated = { ...inspection.headers };
    delete updated[key];
    rebuildRawInput(inspection.statusLine, updated);
  };

  const handleAddHeader = () => {
    if (!newKey.trim()) return;
    const updated = { ...inspection.headers, [newKey.trim()]: newVal.trim() };
    rebuildRawInput(inspection.statusLine, updated);
    setNewKey('');
    setNewVal('');
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <SearchCode className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            Header Inspector
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Paste raw HTTP response headers or edit fields individually to break down directives,
            freshness calculations, validators, and potential conflicts. Evaluated at{' '}
            <span className="font-mono">{formatClockUtc(DEFAULT_SIMULATED_TIME_MS)}</span>.
          </p>
        </div>

        <div
          role="group"
          aria-label="Inspector cache environment"
          className="inline-flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#0B0F17] self-start"
        >
          {(['private', 'shared'] as CacheEnvironment[]).map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => setEnvironment(env)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                environment === env
                  ? 'bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {env === 'private' ? 'Private Cache' : 'Shared Cache'}
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left: Raw Input + Individual Header Editor */}
        <div className="xl:col-span-5 space-y-4">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Raw HTTP Response Headers
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_INPUTS.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    onClick={() => setRawInput(sample.text)}
                    className="px-2 py-1 rounded text-[11px] font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-cyan-500/40 hover:text-cyan-600 dark:hover:text-cyan-300 transition-colors"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              aria-label="Raw HTTP response headers input"
              rows={8}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="HTTP/1.1 200 OK&#10;Cache-Control: public, max-age=3600"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Edit Individual Headers
            </h2>
            {Object.keys(inspection.headers).length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No valid headers parsed yet. Add a header below or paste raw headers above.
              </p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(inspection.headers).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-xs font-mono text-cyan-700 dark:text-cyan-300 truncate">
                      {key}
                    </span>
                    <input
                      type="text"
                      value={value}
                      aria-label={`Edit header ${key}`}
                      onChange={(e) => handleHeaderEdit(key, e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveHeader(key)}
                      aria-label={`Remove header ${key}`}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Header name"
                className="w-32 shrink-0 px-2.5 py-1.5 rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              />
              <input
                type="text"
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                placeholder="Header value"
                className="flex-1 px-2.5 py-1.5 rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={handleAddHeader}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          </section>
        </div>

        {/* Right: Structured Breakdown */}
        <div className="xl:col-span-7 space-y-4">
          {/* Parse Errors */}
          {inspection.errors.length > 0 && (
            <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300">
                <XCircle className="w-4 h-4 shrink-0" />
                Parse Errors Detected
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-red-800 dark:text-red-200">
                {inspection.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Warnings & Conflicts */}
          {inspection.warnings.length > 0 && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Configuration Warnings &amp; Conflicts
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800 dark:text-amber-200">
                {inspection.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Cache-Control Directives Breakdown */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Cache-Control Directive Breakdown
              </h2>
              {inspection.statusLine && (
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {inspection.statusLine}
                </span>
              )}
            </div>

            {inspection.directives.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No Cache-Control directives found in the input.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                {inspection.directives.map((dir, idx) => (
                  <div
                    key={`${dir.name}-${idx}`}
                    className="p-3 bg-slate-50 dark:bg-[#0D1320] flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100">
                        <span>{dir.value !== undefined ? `${dir.name}=${dir.value}` : dir.name}</span>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span
                          className={
                            dir.supported
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {dir.supported ? 'Supported by simulator' : 'Informational / Unsupported'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {dir.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Freshness, Validators, Vary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-2">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Freshness Calculation
              </h3>
              {inspection.freshness ? (
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Lifetime:</dt>
                    <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {formatDuration(inspection.freshness.freshnessLifetimeSeconds)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Source:</dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">
                      {inspection.freshness.lifetimeSource}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Initial Age:</dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">
                      {formatDuration(inspection.freshness.initialAgeSeconds)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Status:</dt>
                    <dd className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                      {inspection.freshness.status}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">Insufficient data.</p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-2">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Validators
              </h3>
              <dl className="space-y-1.5 text-xs">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">ETag:</dt>
                  <dd className="font-mono text-slate-900 dark:text-slate-100 break-all mt-0.5">
                    {inspection.validators.etag ? (
                      <>
                        {inspection.validators.etag}{' '}
                        <span className="text-slate-500 dark:text-slate-400">
                          ({inspection.validators.isStrongEtag ? 'Strong' : 'Weak'})
                        </span>
                      </>
                    ) : (
                      'None'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Last-Modified:</dt>
                  <dd className="font-mono text-slate-900 dark:text-slate-100 break-all mt-0.5">
                    {inspection.validators.lastModified || 'None'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-2">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Vary Partitioning
              </h3>
              {inspection.vary.isWildcard ? (
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                  Vary: * prevents ordinary cache reuse across requests.
                </p>
              ) : inspection.vary.headers.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Cache key varies by:
                  </div>
                  <div className="font-mono text-xs text-cyan-700 dark:text-cyan-300">
                    {inspection.vary.headers.join(', ')}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No Vary header; single shared representation per URL.
                </p>
              )}
            </section>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] px-3.5 py-2.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <span>
              Note: Header Inspector validates the selected directives supported by CacheLab and does
              not claim to verify every header syntax rule across all HTTP RFCs.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
