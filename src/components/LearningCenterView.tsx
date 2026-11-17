import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, Copy, Search } from 'lucide-react';
import { LEARNING_TOPICS } from '../data/learningTopics';
import { SCENARIO_PRESETS } from '../data/scenarios';
import { LearningTopic, ScenarioPreset } from '../types/cache';

interface LearningCenterViewProps {
  onOpenScenario: (preset: ScenarioPreset) => void;
}

const CATEGORIES: Array<'All' | LearningTopic['category']> = [
  'All',
  'Fundamentals',
  'Directives',
  'Validators',
  'Headers',
  'Mechanics',
];

export function LearningCenterView({ onOpenScenario }: LearningCenterViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<'All' | LearningTopic['category']>('All');
  const [query, setQuery] = useState('');
  const [copiedTopicId, setCopiedTopicId] = useState<string | null>(null);

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LEARNING_TOPICS.filter((topic) => {
      const catMatch = selectedCategory === 'All' || topic.category === selectedCategory;
      const textMatch =
        !q ||
        topic.title.toLowerCase().includes(q) ||
        topic.summary.toLowerCase().includes(q) ||
        topic.explanation.toLowerCase().includes(q) ||
        topic.exampleHeader.toLowerCase().includes(q);
      return catMatch && textMatch;
    });
  }, [selectedCategory, query]);

  const copyExample = async (topic: LearningTopic) => {
    try {
      await navigator.clipboard.writeText(topic.exampleHeader);
      setCopiedTopicId(topic.id);
      window.setTimeout(() => setCopiedTopicId(null), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              HTTP Caching Learning Center
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Clear, practical explanations of the core headers, directives, and revalidation
              mechanics simulated in CacheLab.
            </p>
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics..."
              aria-label="Search learning topics"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                selectedCategory === category
                  ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </section>

      {filteredTopics.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-8 text-center text-xs text-slate-500 dark:text-slate-400">
          No learning topics match your current filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTopics.map((topic) => {
            const linkedScenario =
              SCENARIO_PRESETS.find((s) => s.id === topic.scenarioId) ?? SCENARIO_PRESETS[0];

            return (
              <article
                key={topic.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#111827] p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <span>{topic.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{linkedScenario.title}</span>
                  </div>

                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    {topic.title}
                  </h2>
                  <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
                    {topic.summary}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {topic.explanation}
                  </p>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] p-2.5 flex items-center justify-between gap-2">
                    <code className="text-xs font-mono text-emerald-700 dark:text-emerald-300 overflow-x-auto">
                      {topic.exampleHeader}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyExample(topic)}
                      aria-label={`Copy example header for ${topic.title}`}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0"
                    >
                      {copiedTopicId === topic.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Practical use case:{' '}
                    </span>
                    {topic.useCase}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenScenario(linkedScenario)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline self-start"
                >
                  Try in Simulator ({linkedScenario.title})
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
