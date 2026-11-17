import React, { useMemo, useState } from 'react';
import { FlaskConical, Play, Search } from 'lucide-react';
import { SCENARIO_PRESETS } from '../data/scenarios';
import { ScenarioPreset } from '../types/cache';

interface ScenarioLabViewProps {
  onLoadScenario: (preset: ScenarioPreset) => void;
}

export function ScenarioLabView({ onLoadScenario }: ScenarioLabViewProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SCENARIO_PRESETS;
    return SCENARIO_PRESETS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.concept.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            Scenario Lab
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Load curated HTTP caching scenarios directly into the simulator with preconfigured
            request/response headers, cache entries, and simulated clock offsets.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter scenarios..."
            aria-label="Filter scenarios"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-8 text-center text-xs text-slate-500 dark:text-slate-400">
          No scenarios match "{query}".
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((preset) => (
            <article
              key={preset.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <span>{preset.environment === 'private' ? 'Private Cache' : 'Shared Cache'}</span>
                  <span>
                    {preset.prepopulateCache
                      ? `Pre-cached · +${preset.initialTimeOffsetSeconds}s`
                      : 'Cold cache'}
                  </span>
                </div>

                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {preset.title}
                </h2>
                <div className="text-xs font-medium text-cyan-700 dark:text-cyan-400">
                  {preset.concept}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {preset.description}
                </p>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-2.5 font-mono text-[11px] space-y-1 text-slate-700 dark:text-slate-300">
                  <div className="truncate">
                    {preset.request.method} {preset.request.url}
                  </div>
                  <div className="text-cyan-700 dark:text-cyan-300 truncate">
                    Cache-Control: {preset.response.headers['Cache-Control'] || '(none)'}
                  </div>
                  {preset.response.headers.ETag && (
                    <div className="truncate">ETag: {preset.response.headers.ETag}</div>
                  )}
                  {preset.response.headers.Vary && (
                    <div className="truncate">Vary: {preset.response.headers.Vary}</div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onLoadScenario(preset)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                Load &amp; Run Scenario
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
