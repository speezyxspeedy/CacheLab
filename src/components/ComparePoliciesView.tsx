import React, { useMemo, useState } from 'react';
import { GitCompare, Plus, Trash2 } from 'lucide-react';
import { comparePolicies } from '../engine/cacheEngine';
import { CacheEnvironment, PolicyComparisonInput, RevalidationOutcome } from '../types/cache';
import { formatDuration } from '../utilities/httpFormatters';

const POLICY_TEMPLATES: PolicyComparisonInput[] = [
  {
    id: 'short-reval',
    label: 'Short TTL + ETag (max-age=60)',
    cacheControl: 'public, max-age=60',
    etag: '"v1"',
  },
  {
    id: 'cdn-edge',
    label: 'CDN Edge Split (max-age=30, s-maxage=300)',
    cacheControl: 'public, max-age=30, s-maxage=300',
    etag: '"v1"',
  },
  {
    id: 'swr',
    label: 'Stale-While-Revalidate (60s + 30s SWR)',
    cacheControl: 'public, max-age=60, stale-while-revalidate=30',
    etag: '"v1"',
  },
  {
    id: 'no-cache',
    label: 'Always Revalidate (no-cache + ETag)',
    cacheControl: 'no-cache',
    etag: '"v1"',
  },
  {
    id: 'no-store',
    label: 'No Store (no-store)',
    cacheControl: 'no-store',
  },
  {
    id: 'private-only',
    label: 'Private User Cache (private, max-age=600)',
    cacheControl: 'private, max-age=600',
    etag: '"user-1"',
  },
];

export function ComparePoliciesView() {
  const [environment, setEnvironment] = useState<CacheEnvironment>('shared');
  const [revalidationOutcome, setRevalidationOutcome] = useState<RevalidationOutcome>('304');
  const [policyA, setPolicyA] = useState<PolicyComparisonInput>(POLICY_TEMPLATES[0]);
  const [policyB, setPolicyB] = useState<PolicyComparisonInput>(POLICY_TEMPLATES[3]);
  const [intervals, setIntervals] = useState<number[]>([0, 20, 50, 75, 130]);
  const [newInterval, setNewInterval] = useState<string>('180');

  const [outcomeA, outcomeB] = useMemo(
    () =>
      comparePolicies(policyA, policyB, {
        environment,
        elapsedSecondsSequence: intervals.length > 0 ? intervals : [0],
        revalidationOutcome,
      }),
    [policyA, policyB, environment, intervals, revalidationOutcome]
  );

  const addInterval = () => {
    const parsed = Number.parseInt(newInterval, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setIntervals((prev) => Array.from(new Set([...prev, parsed])).sort((a, b) => a - b));
      setNewInterval(String(parsed + 60));
    }
  };

  const removeInterval = (sec: number) => {
    setIntervals((prev) => (prev.length > 1 ? prev.filter((item) => item !== sec) : prev));
  };

  return (
    <div className="space-y-4">
      {/* Header & Global Controls */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              Compare Caching Policies
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Side-by-side policy comparison powered directly by the CacheLab simulation engine
              across a deterministic sequence of request timestamps.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#0B0F17]">
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

            <select
              aria-label="Origin revalidation response outcome"
              value={revalidationOutcome}
              onChange={(e) => setRevalidationOutcome(e.target.value as RevalidationOutcome)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              <option value="304">Revalidation: 304 Not Modified</option>
              <option value="200">Revalidation: 200 Modified</option>
            </select>
          </div>
        </div>

        {/* Configurable Time Intervals */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 mr-1">
            Request Sequence (elapsed seconds):
          </span>
          {intervals.map((sec) => (
            <span
              key={sec}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-800 dark:text-slate-200"
            >
              t={sec}s
              {intervals.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeInterval(sec)}
                  aria-label={`Remove timestamp ${sec}s`}
                  className="text-slate-400 hover:text-red-500 ml-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}

          <div className="inline-flex items-center gap-1.5 ml-1">
            <input
              type="number"
              min={0}
              value={newInterval}
              onChange={(e) => setNewInterval(e.target.value)}
              aria-label="Add elapsed seconds timestamp"
              className="w-20 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={addInterval}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add t(s)
            </button>
          </div>
        </div>
      </section>

      {/* Policy Config Editors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PolicyEditorCard
          title="Policy A"
          policy={policyA}
          onChange={setPolicyA}
        />
        <PolicyEditorCard
          title="Policy B"
          policy={policyB}
          onChange={setPolicyB}
        />
      </div>

      {/* Side-by-Side Comparison Matrix */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Policy Behavior Comparison
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#0D1320] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5 font-medium w-48">Dimension</th>
                <th className="px-4 py-2.5 font-semibold text-cyan-700 dark:text-cyan-300">
                  Policy A: {outcomeA.policy.label}
                </th>
                <th className="px-4 py-2.5 font-semibold text-emerald-700 dark:text-emerald-300">
                  Policy B: {outcomeB.policy.label}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              <ComparisonRow
                label="Storage Eligibility"
                left={outcomeA.eligibleForStorage ? `Allowed — ${outcomeA.storageReason}` : `Blocked — ${outcomeA.storageReason}`}
                right={outcomeB.eligibleForStorage ? `Allowed — ${outcomeB.storageReason}` : `Blocked — ${outcomeB.storageReason}`}
              />
              <ComparisonRow
                label="Freshness Lifetime"
                left={formatDuration(outcomeA.freshnessLifetimeSeconds)}
                right={formatDuration(outcomeB.freshnessLifetimeSeconds)}
                mono
              />
              <ComparisonRow
                label="Cache Reuse Behavior"
                left={outcomeA.reuseBehavior}
                right={outcomeB.reuseBehavior}
              />
              <ComparisonRow
                label="Revalidation"
                left={outcomeA.revalidationBehavior}
                right={outcomeB.revalidationBehavior}
              />
              <ComparisonRow
                label="Environment Rule"
                left={outcomeA.environmentImplications}
                right={outcomeB.environmentImplications}
              />
              <ComparisonRow
                label="Origin Requests (out of N)"
                left={`${outcomeA.originRequests} / ${outcomeA.totalRequests} requests (${outcomeA.cacheHits} hits, ${outcomeA.revalidations} revalidations)`}
                right={`${outcomeB.originRequests} / ${outcomeB.totalRequests} requests (${outcomeB.cacheHits} hits, ${outcomeB.revalidations} revalidations)`}
                mono
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* Step-by-step Request Sequence Execution */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Simulated Request Sequence Trace
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#0D1320] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5 font-medium">Request #</th>
                <th className="px-4 py-2.5 font-medium">Elapsed Time</th>
                <th className="px-4 py-2.5 font-medium">Policy A Decision</th>
                <th className="px-4 py-2.5 font-medium">Policy B Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {outcomeA.steps.map((stepA, idx) => {
                const stepB = outcomeB.steps[idx];
                return (
                  <tr key={stepA.stepIndex}>
                    <td className="px-4 py-2.5 font-mono text-slate-500 dark:text-slate-400">
                      #{stepA.stepIndex}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      +{stepA.elapsedSeconds}s
                    </td>
                    <td className="px-4 py-2.5">
                      <StepCell
                        decision={stepA.decision}
                        originContact={stepA.originContactRequired}
                        remaining={stepA.remainingFreshnessSeconds}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      {stepB && (
                        <StepCell
                          decision={stepB.decision}
                          originContact={stepB.originContactRequired}
                          remaining={stepB.remainingFreshnessSeconds}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PolicyEditorCard({
  title,
  policy,
  onChange,
}: {
  title: string;
  policy: PolicyComparisonInput;
  onChange: (next: PolicyComparisonInput) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <select
          aria-label={`Load template for ${title}`}
          value={POLICY_TEMPLATES.some((t) => t.id === policy.id) ? policy.id : ''}
          onChange={(e) => {
            const tpl = POLICY_TEMPLATES.find((t) => t.id === e.target.value);
            if (tpl) onChange({ ...tpl });
          }}
          className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-xs text-slate-800 dark:text-slate-200"
        >
          <option value="" disabled>
            Select template...
          </option>
          {POLICY_TEMPLATES.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Policy Label
          </span>
          <input
            type="text"
            value={policy.label}
            onChange={(e) => onChange({ ...policy, id: 'custom', label: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-xs text-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Cache-Control
          </span>
          <input
            type="text"
            value={policy.cacheControl}
            onChange={(e) => onChange({ ...policy, id: 'custom', cacheControl: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            ETag (optional)
          </span>
          <input
            type="text"
            value={policy.etag ?? ''}
            placeholder='"v1"'
            onChange={(e) => onChange({ ...policy, etag: e.target.value || undefined })}
            className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Vary (optional)
          </span>
          <input
            type="text"
            value={policy.vary ?? ''}
            placeholder="Accept-Language"
            onChange={(e) => onChange({ ...policy, vary: e.target.value || undefined })}
            className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-900 dark:text-slate-100"
          />
        </label>
      </div>
    </section>
  );
}

function ComparisonRow({
  label,
  left,
  right,
  mono,
}: {
  label: string;
  left: string;
  right: string;
  mono?: boolean;
}) {
  return (
    <tr>
      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300 align-top">
        {label}
      </td>
      <td className={`px-4 py-3 text-slate-800 dark:text-slate-200 align-top ${mono ? 'font-mono' : ''}`}>
        {left}
      </td>
      <td className={`px-4 py-3 text-slate-800 dark:text-slate-200 align-top ${mono ? 'font-mono' : ''}`}>
        {right}
      </td>
    </tr>
  );
}

function StepCell({
  decision,
  originContact,
  remaining,
}: {
  decision: string;
  originContact: boolean;
  remaining: number | null;
}) {
  const tone =
    decision === 'CACHE_HIT' || decision === 'CACHE_UPDATED'
      ? 'text-emerald-600 dark:text-emerald-400'
      : decision === 'CACHE_MISS'
        ? 'text-cyan-600 dark:text-cyan-400'
        : decision === 'CACHE_STORE_BLOCKED' || decision === 'CACHE_BYPASS'
          ? 'text-red-600 dark:text-red-400'
          : 'text-amber-600 dark:text-amber-400';

  return (
    <div className="space-y-0.5">
      <div className={`font-mono font-semibold ${tone}`}>{decision}</div>
      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
        {originContact ? 'Origin contacted' : 'Served locally'}
        {remaining !== null ? ` · TTL rem: ${formatDuration(remaining)}` : ''}
      </div>
    </div>
  );
}
