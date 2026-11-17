import React, { useEffect, useState } from 'react';
import { ComparePoliciesView } from './components/ComparePoliciesView';
import { HeaderInspectorView } from './components/HeaderInspectorView';
import { LearningCenterView } from './components/LearningCenterView';
import { OverviewView } from './components/OverviewView';
import { ScenarioLabView } from './components/ScenarioLabView';
import { NavSection, Sidebar } from './components/Sidebar';
import { SimulatorView } from './components/SimulatorView';
import { DEFAULT_DEMO_REQUEST, DEFAULT_DEMO_RESPONSE } from './data/scenarios';
import {
  createInitialSimulationState,
  revalidateCacheEntry,
  runSimulation,
} from './engine/cacheEngine';
import {
  CacheEnvironment,
  HistoryItem,
  HttpRequest,
  HttpResponse,
  RevalidationOutcome,
  ScenarioPreset,
  SimulationResult,
  SimulationState,
} from './types/cache';
import { DEFAULT_SIMULATED_TIME_MS, toHttpDate } from './utilities/httpFormatters';

const HISTORY_STORAGE_KEY = 'cachelab.history.v1';
const THEME_STORAGE_KEY = 'cachelab.theme';

function loadInitialHistory(): HistoryItem[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadInitialTheme(): 'dark' | 'light' {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('simulator');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(loadInitialTheme);

  const [simState, setSimState] = useState<SimulationState>(() =>
    createInitialSimulationState('private', DEFAULT_SIMULATED_TIME_MS)
  );
  const [request, setRequest] = useState<HttpRequest>(() => ({
    ...DEFAULT_DEMO_REQUEST,
    headers: { ...DEFAULT_DEMO_REQUEST.headers },
  }));
  const [response, setResponse] = useState<HttpResponse>(() => ({
    ...DEFAULT_DEMO_RESPONSE,
    headers: { ...DEFAULT_DEMO_RESPONSE.headers },
  }));
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [revalidationOutcome, setRevalidationOutcome] = useState<RevalidationOutcome>('304');
  const [activeScenarioTitle, setActiveScenarioTitle] = useState<string>(
    'Default Demo — GET /products (max-age=60)'
  );
  const [history, setHistory] = useState<HistoryItem[]>(loadInitialHistory);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures
    }
  }, [theme]);

  const persistHistory = (items: HistoryItem[]) => {
    setHistory(items);
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage quota errors
    }
  };

  const recordHistory = (
    scenarioName: string,
    req: HttpRequest,
    res: HttpResponse,
    simResult: SimulationResult
  ) => {
    const item: HistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      scenarioName,
      requestMethod: req.method,
      requestUrl: req.url,
      environment: simResult.environment,
      decision: simResult.decision,
      httpStatus: simResult.httpStatus,
      simulatedTimeMs: simResult.simulatedTimeMs,
      executedAtIso: new Date().toISOString(),
      request: { ...req, headers: { ...req.headers } },
      response: { ...res, headers: { ...res.headers } },
      result: simResult,
    };
    persistHistory([item, ...history].slice(0, 30));
  };

  const handleChangeEnvironment = (environment: CacheEnvironment) => {
    setSimState((prev) => ({
      ...prev,
      environment,
    }));
  };

  const handleRunSimulation = () => {
    const { result: nextResult, nextState } = runSimulation(simState, request, response);
    setSimState(nextState);
    setResult(nextResult);
    recordHistory(activeScenarioTitle, request, response, nextResult);
  };

  const handleAdvanceTime = (seconds: number) => {
    setSimState((prev) => ({
      ...prev,
      simulatedTimeMs: prev.simulatedTimeMs + seconds * 1000,
    }));
  };

  const handleRevalidate = () => {
    const updatedResponse: HttpResponse | undefined =
      revalidationOutcome === '200'
        ? {
            ...response,
            status: 200,
            statusText: 'OK',
            headers: {
              ...response.headers,
              Date: toHttpDate(simState.simulatedTimeMs),
              ETag: response.headers.ETag
                ? `${response.headers.ETag.replace(/"$/g, '')}-v2"`
                : '"products-v2"',
            },
            body: JSON.stringify(
              {
                products: [
                  { id: 'sku-101', name: 'Edge Router X2', price: 249 },
                  { id: 'sku-102', name: 'Protocol Analyzer Pro', price: 499 },
                  { id: 'sku-103', name: 'Telemetry Gateway', price: 329 },
                ],
                version: 2,
                updatedAt: toHttpDate(simState.simulatedTimeMs),
              },
              null,
              2
            ),
          }
        : {
            ...response,
            headers: {
              ...response.headers,
              Date: toHttpDate(simState.simulatedTimeMs),
            },
          };

    const { result: nextResult, nextState } = revalidateCacheEntry({
      state: simState,
      request,
      outcome: revalidationOutcome,
      newOriginResponse: updatedResponse,
    });
    setSimState(nextState);
    setResult(nextResult);
    if (revalidationOutcome === '200' && updatedResponse) {
      setResponse(updatedResponse);
    }
    recordHistory(`${activeScenarioTitle} (Revalidate ${revalidationOutcome})`, request, response, nextResult);
  };

  const handleResetSimulator = () => {
    setSimState(createInitialSimulationState('private', DEFAULT_SIMULATED_TIME_MS));
    setRequest({
      ...DEFAULT_DEMO_REQUEST,
      headers: { ...DEFAULT_DEMO_REQUEST.headers },
    });
    setResponse({
      ...DEFAULT_DEMO_RESPONSE,
      headers: { ...DEFAULT_DEMO_RESPONSE.headers },
    });
    setResult(null);
    setRevalidationOutcome('304');
    setActiveScenarioTitle('Default Demo — GET /products (max-age=60)');
  };

  const handleClearCache = () => {
    setSimState((prev) => ({ ...prev, entries: [] }));
  };

  const handleRemoveCacheEntry = (key: string) => {
    setSimState((prev) => ({
      ...prev,
      entries: prev.entries.filter((entry) => entry.key !== key),
    }));
  };

  const handleLoadScenario = (preset: ScenarioPreset) => {
    const baseTime = DEFAULT_SIMULATED_TIME_MS;
    let nextState = createInitialSimulationState(preset.environment, baseTime);

    const nextReq: HttpRequest = {
      method: preset.request.method,
      url: preset.request.url,
      headers: { ...preset.request.headers },
    };
    const nextRes: HttpResponse = {
      status: preset.response.status,
      statusText: preset.response.statusText,
      headers: { ...preset.response.headers },
      body: preset.response.body,
    };

    if (preset.prepopulateCache) {
      if (preset.id === 'vary-header') {
        const enReq: HttpRequest = {
          method: 'GET',
          url: preset.request.url,
          headers: { Accept: 'application/json', 'Accept-Language': 'en-US' },
        };
        const enRes: HttpResponse = {
          status: 200,
          statusText: 'OK',
          headers: {
            'Cache-Control': 'public, max-age=300',
            ETag: '"products-en-v1"',
            Vary: 'Accept-Language',
            Date: toHttpDate(baseTime),
          },
          body: JSON.stringify(
            { locale: 'en-US', products: [{ id: 'sku-101', name: 'Edge Router X2' }] },
            null,
            2
          ),
        };
        nextState = runSimulation(nextState, enReq, enRes).nextState;
      } else {
        nextState = runSimulation(nextState, nextReq, nextRes).nextState;
      }
    }

    nextState = {
      ...nextState,
      simulatedTimeMs: baseTime + preset.initialTimeOffsetSeconds * 1000,
    };

    const { result: simResult, nextState: finalState } = runSimulation(nextState, nextReq, nextRes);

    setSimState(finalState);
    setRequest(nextReq);
    setResponse(nextRes);
    setResult(simResult);
    setRevalidationOutcome(preset.recommendedRevalidationOutcome ?? '304');
    setActiveScenarioTitle(preset.title);
    setActiveSection('simulator');
    recordHistory(preset.title, nextReq, nextRes, simResult);
  };

  const handleReopenHistoryItem = (item: HistoryItem) => {
    const nextReq: HttpRequest = { ...item.request, headers: { ...item.request.headers } };
    const nextRes: HttpResponse = { ...item.response, headers: { ...item.response.headers } };
    const restoredState: SimulationState = {
      environment: item.environment,
      simulatedTimeMs: item.simulatedTimeMs,
      entries: item.result.matchedEntry ? [item.result.matchedEntry] : [],
    };
    setSimState(restoredState);
    setRequest(nextReq);
    setResponse(nextRes);
    setResult(item.result);
    setActiveScenarioTitle(item.scenarioName);
    setActiveSection('simulator');
  };

  const handleDeleteHistoryItem = (id: string) => {
    persistHistory(history.filter((item) => item.id !== id));
  };

  const handleClearHistory = () => {
    persistHistory([]);
  };

  const handleStartDemoJourney = () => {
    handleResetSimulator();
    setActiveSection('simulator');
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        mobileOpen={mobileMenuOpen}
        onSetMobileOpen={setMobileMenuOpen}
      />

      <main className="flex-1 min-w-0 p-4 sm:p-6 max-w-[1600px] mx-auto w-full">
        {activeSection === 'overview' && (
          <OverviewView
            simState={simState}
            lastResult={result}
            history={history}
            onNavigate={setActiveSection}
            onStartDemoJourney={handleStartDemoJourney}
            onReopenHistoryItem={handleReopenHistoryItem}
          />
        )}

        {activeSection === 'simulator' && (
          <SimulatorView
            simState={simState}
            request={request}
            response={response}
            result={result}
            revalidationOutcome={revalidationOutcome}
            activeScenarioTitle={activeScenarioTitle}
            history={history}
            onChangeEnvironment={handleChangeEnvironment}
            onChangeRequest={setRequest}
            onChangeResponse={setResponse}
            onChangeRevalidationOutcome={setRevalidationOutcome}
            onRunSimulation={handleRunSimulation}
            onAdvanceTime={handleAdvanceTime}
            onRevalidate={handleRevalidate}
            onReset={handleResetSimulator}
            onClearCache={handleClearCache}
            onRemoveCacheEntry={handleRemoveCacheEntry}
            onReopenHistoryItem={handleReopenHistoryItem}
            onDeleteHistoryItem={handleDeleteHistoryItem}
            onClearHistory={handleClearHistory}
          />
        )}

        {activeSection === 'inspector' && <HeaderInspectorView />}

        {activeSection === 'scenarios' && (
          <ScenarioLabView onLoadScenario={handleLoadScenario} />
        )}

        {activeSection === 'compare' && <ComparePoliciesView />}

        {activeSection === 'learn' && (
          <LearningCenterView onOpenScenario={handleLoadScenario} />
        )}
      </main>
    </div>
  );
}
