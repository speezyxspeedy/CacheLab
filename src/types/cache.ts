export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE';

export type CacheEnvironment = 'private' | 'shared';

export type CacheDecision =
  | 'CACHE_HIT'
  | 'CACHE_MISS'
  | 'CACHE_STALE'
  | 'REVALIDATION_REQUIRED'
  | 'CACHE_BYPASS'
  | 'CACHE_STORE_BLOCKED'
  | 'CACHE_UPDATED';

export type FreshnessStatus =
  | 'fresh'
  | 'stale'
  | 'stale-while-revalidate'
  | 'unknown'
  | 'not-cached';

export type RevalidationOutcome = '304' | '200';

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface CachePolicy {
  raw: string;
  isPublic: boolean;
  isPrivate: boolean;
  noCache: boolean;
  noStore: boolean;
  mustRevalidate: boolean;
  immutable: boolean;
  maxAge: number | null;
  sMaxage: number | null;
  staleWhileRevalidate: number | null;
  unknownDirectives: string[];
  parseWarnings: string[];
}

export interface CacheEntry {
  key: string;
  method: HttpMethod;
  url: string;
  varyHeaderNames: string[];
  varyHeaders: Record<string, string>;
  hasWildcardVary: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  storedAtMs: number;
  responseDateMs: number;
  freshnessLifetimeSeconds: number | null;
  initialAgeSeconds: number;
  policy: CachePolicy;
  etag?: string;
  lastModified?: string;
}

export interface SimulationState {
  environment: CacheEnvironment;
  simulatedTimeMs: number;
  entries: CacheEntry[];
}

export type CacheEventCategory =
  | 'request'
  | 'lookup'
  | 'freshness'
  | 'origin'
  | 'validation'
  | 'store'
  | 'decision';

export interface CacheEvent {
  step: number;
  timestampMs: number;
  title: string;
  detail: string;
  category: CacheEventCategory;
}

export type FlowNodeId =
  | 'request'
  | 'lookup'
  | 'bypass'
  | 'match'
  | 'miss'
  | 'origin'
  | 'store_check'
  | 'fresh_check'
  | 'hit'
  | 'validation_check'
  | 'conditional_request'
  | 'outcome_304'
  | 'outcome_200'
  | 'serve';

export interface FlowTrace {
  visitedNodes: FlowNodeId[];
  activeEdges: string[];
  visualState: 'hit' | 'miss' | 'stale' | 'revalidation' | 'bypass';
}

export interface FreshnessCalculation {
  freshnessLifetimeSeconds: number | null;
  lifetimeSource: 's-maxage' | 'max-age' | 'expires' | 'none';
  initialAgeSeconds: number;
  residentTimeSeconds: number;
  currentAgeSeconds: number | null;
  remainingFreshnessSeconds: number | null;
  status: FreshnessStatus;
  warnings: string[];
}

export interface SimulationResult {
  decision: CacheDecision;
  httpStatus: number;
  statusText: string;
  environment: CacheEnvironment;
  simulatedTimeMs: number;
  currentAgeSeconds: number | null;
  freshnessLifetimeSeconds: number | null;
  remainingFreshnessSeconds: number | null;
  freshnessStatus: FreshnessStatus;
  originContactRequired: boolean;
  validationRequired: boolean;
  storedInCache: boolean;
  reason: string;
  requestHeadersSent: Record<string, string>;
  responseHeadersReceived: Record<string, string>;
  responseBody: string;
  events: CacheEvent[];
  matchedEntry: CacheEntry | null;
  flowTrace: FlowTrace;
  warnings: string[];
  canRevalidate: boolean;
}

export interface ParsedDirectiveDetail {
  name: string;
  value?: string;
  supported: boolean;
  description: string;
}

export interface HeaderInspectionResult {
  valid: boolean;
  statusLine?: string;
  statusCode?: number;
  headers: Record<string, string>;
  policy: CachePolicy | null;
  directives: ParsedDirectiveDetail[];
  freshness: FreshnessCalculation | null;
  validators: {
    etag?: string;
    lastModified?: string;
    isStrongEtag?: boolean;
  };
  vary: {
    raw?: string;
    headers: string[];
    isWildcard: boolean;
  };
  warnings: string[];
  errors: string[];
}

export interface ScenarioPreset {
  id: string;
  title: string;
  concept: string;
  description: string;
  environment: CacheEnvironment;
  request: HttpRequest;
  response: HttpResponse;
  initialTimeOffsetSeconds: number;
  prepopulateCache: boolean;
  recommendedRevalidationOutcome?: RevalidationOutcome;
  learningTopicIds: string[];
}

export interface LearningTopic {
  id: string;
  title: string;
  category: 'Fundamentals' | 'Directives' | 'Validators' | 'Headers' | 'Mechanics';
  summary: string;
  explanation: string;
  exampleHeader: string;
  useCase: string;
  scenarioId: string;
}

export interface HistoryItem {
  id: string;
  scenarioName: string;
  requestMethod: HttpMethod;
  requestUrl: string;
  environment: CacheEnvironment;
  decision: CacheDecision;
  httpStatus: number;
  simulatedTimeMs: number;
  executedAtIso: string;
  request: HttpRequest;
  response: HttpResponse;
  result: SimulationResult;
}

export interface PolicyComparisonInput {
  id: string;
  label: string;
  cacheControl: string;
  etag?: string;
  lastModified?: string;
  expires?: string;
  vary?: string;
}

export interface PolicyStepComparison {
  stepIndex: number;
  elapsedSeconds: number;
  simulatedTimeMs: number;
  decision: CacheDecision;
  originContactRequired: boolean;
  validationRequired: boolean;
  freshnessStatus: FreshnessStatus;
  remainingFreshnessSeconds: number | null;
  reason: string;
}

export interface PolicyComparisonOutcome {
  policy: PolicyComparisonInput;
  parsedPolicy: CachePolicy;
  eligibleForStorage: boolean;
  storageReason: string;
  freshnessLifetimeSeconds: number | null;
  reuseBehavior: string;
  revalidationBehavior: string;
  environmentImplications: string;
  totalRequests: number;
  originRequests: number;
  cacheHits: number;
  revalidations: number;
  steps: PolicyStepComparison[];
}
