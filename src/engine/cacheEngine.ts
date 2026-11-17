import {
  CacheDecision,
  CacheEntry,
  CacheEnvironment,
  CacheEvent,
  CachePolicy,
  FlowNodeId,
  FlowTrace,
  FreshnessCalculation,
  HeaderInspectionResult,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  ParsedDirectiveDetail,
  PolicyComparisonInput,
  PolicyComparisonOutcome,
  PolicyStepComparison,
  RevalidationOutcome,
  SimulationResult,
  SimulationState,
} from '../types/cache';
import {
  DEFAULT_SIMULATED_TIME_MS,
  findHeaderCaseInsensitive,
  formatDuration,
  getStatusText,
  normalizeHeadersMap,
  parseHttpDate,
  toHttpDate,
} from '../utilities/httpFormatters';

const SUPPORTED_DIRECTIVES = new Set([
  'public',
  'private',
  'no-cache',
  'no-store',
  'max-age',
  's-maxage',
  'must-revalidate',
  'immutable',
  'stale-while-revalidate',
]);

const CACHEABLE_STATUS_CODES = new Set([200, 203, 204, 301, 404]);

function splitHeaderTokens(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === ',' && !inQuotes) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    tokens.push(current.trim());
  }
  return tokens;
}

function parseNonNegativeInt(raw: string | undefined, directiveName: string, warnings: string[]): number | null {
  if (raw === undefined || raw === '') {
    warnings.push(`Directive "${directiveName}" requires an integer value in seconds.`);
    return null;
  }
  const cleaned = raw.replace(/^"|"$/g, '').trim();
  if (!/^\d+$/.test(cleaned)) {
    warnings.push(`Malformed "${directiveName}" value "${raw}"; expected a non-negative integer.`);
    return null;
  }
  const num = Number.parseInt(cleaned, 10);
  if (!Number.isSafeInteger(num) || num < 0) {
    warnings.push(`Out-of-range "${directiveName}" value "${raw}".`);
    return null;
  }
  return num;
}

export function parseCacheControl(headerValue?: string): CachePolicy {
  const raw = (headerValue ?? '').trim();
  const policy: CachePolicy = {
    raw,
    isPublic: false,
    isPrivate: false,
    noCache: false,
    noStore: false,
    mustRevalidate: false,
    immutable: false,
    maxAge: null,
    sMaxage: null,
    staleWhileRevalidate: null,
    unknownDirectives: [],
    parseWarnings: [],
  };

  if (!raw) {
    return policy;
  }

  const tokens = splitHeaderTokens(raw);
  for (const token of tokens) {
    const eqIndex = token.indexOf('=');
    const name = (eqIndex === -1 ? token : token.slice(0, eqIndex)).trim().toLowerCase();
    const value = eqIndex === -1 ? undefined : token.slice(eqIndex + 1).trim();

    if (!name) {
      policy.parseWarnings.push(`Empty directive encountered in Cache-Control "${raw}".`);
      continue;
    }

    switch (name) {
      case 'public':
        if (value !== undefined) {
          policy.parseWarnings.push(`Directive "public" does not take a value (received "${value}").`);
        }
        policy.isPublic = true;
        break;
      case 'private':
        policy.isPrivate = true;
        break;
      case 'no-cache':
        policy.noCache = true;
        break;
      case 'no-store':
        if (value !== undefined) {
          policy.parseWarnings.push(`Directive "no-store" does not take a value (received "${value}").`);
        }
        policy.noStore = true;
        break;
      case 'must-revalidate':
        policy.mustRevalidate = true;
        break;
      case 'immutable':
        policy.immutable = true;
        break;
      case 'max-age':
        policy.maxAge = parseNonNegativeInt(value, 'max-age', policy.parseWarnings);
        break;
      case 's-maxage':
        policy.sMaxage = parseNonNegativeInt(value, 's-maxage', policy.parseWarnings);
        break;
      case 'stale-while-revalidate':
        policy.staleWhileRevalidate = parseNonNegativeInt(
          value,
          'stale-while-revalidate',
          policy.parseWarnings
        );
        break;
      default:
        policy.unknownDirectives.push(token);
        break;
    }
  }

  if (policy.isPublic && policy.isPrivate) {
    policy.parseWarnings.push('Conflicting directives: both "public" and "private" are present.');
  }
  if (policy.noStore && (policy.maxAge !== null || policy.sMaxage !== null || policy.isPublic)) {
    policy.parseWarnings.push(
      'Conflicting directives: "no-store" prevents storage even when freshness or "public" directives are present.'
    );
  }
  if (policy.noCache && policy.immutable) {
    policy.parseWarnings.push(
      'Conflicting directives: "no-cache" forces revalidation while "immutable" indicates the representation will not change while fresh.'
    );
  }
  if (policy.mustRevalidate && policy.staleWhileRevalidate !== null) {
    policy.parseWarnings.push(
      'Conflicting directives: "must-revalidate" forbids serving stale responses, overriding "stale-while-revalidate".'
    );
  }

  return policy;
}

export function parseVaryHeader(varyValue?: string): { headers: string[]; isWildcard: boolean } {
  const raw = (varyValue ?? '').trim();
  if (!raw) {
    return { headers: [], isWildcard: false };
  }
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.includes('*')) {
    return { headers: ['*'], isWildcard: true };
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      normalized.push(part);
    }
  }
  return { headers: normalized, isWildcard: false };
}

export function extractVaryValues(
  requestHeaders: Record<string, string>,
  varyHeaderNames: string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const headerName of varyHeaderNames) {
    const val = findHeaderCaseInsensitive(requestHeaders, headerName);
    result[headerName.toLowerCase()] = val !== undefined ? val.trim() : '';
  }
  return result;
}

export function createCacheKey(
  method: HttpMethod,
  url: string,
  varyHeaders: Record<string, string> = {}
): string {
  const normalizedMethod = method.toUpperCase();
  let normalizedUrl = url.trim();
  try {
    const parsed = new URL(normalizedUrl);
    normalizedUrl = `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname}${parsed.search}`;
  } catch {
    // Keep provided string if relative or non-standard URL
  }

  const varyEntries = Object.entries(varyHeaders)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .join('&');

  return varyEntries ? `${normalizedMethod}:${normalizedUrl}|vary:${varyEntries}` : `${normalizedMethod}:${normalizedUrl}`;
}

/**
 * Educational HTTP freshness model (subset of RFC 9111):
 * - Freshness lifetime prefers `s-maxage` in shared caches, then `max-age`, then `Expires - Date`.
 * - Initial age reads `Age` header (default 0).
 * - Resident time = floor((simulatedTimeMs - storedAtMs) / 1000).
 * - Current age = initialAge + residentTime.
 * Note: A full RFC 9111 implementation also computes apparent_age and response_delay
 * to account for clock skew and network transit latency.
 */
export function calculateFreshness(params: {
  policy: CachePolicy;
  headers: Record<string, string>;
  environment: CacheEnvironment;
  storedAtMs: number;
  simulatedTimeMs: number;
}): FreshnessCalculation {
  const { policy, headers, environment, storedAtMs, simulatedTimeMs } = params;
  const warnings: string[] = [...policy.parseWarnings];

  const dateRaw = findHeaderCaseInsensitive(headers, 'Date');
  const parsedDateMs = parseHttpDate(dateRaw);
  if (!dateRaw) {
    warnings.push('Response is missing a Date header; using simulated storage timestamp as reference.');
  } else if (parsedDateMs === null) {
    warnings.push(`Malformed Date header "${dateRaw}"; falling back to simulated storage timestamp.`);
  }
  const referenceDateMs = parsedDateMs ?? storedAtMs;

  const expiresRaw = findHeaderCaseInsensitive(headers, 'Expires');
  const parsedExpiresMs = parseHttpDate(expiresRaw);
  if (expiresRaw && parsedExpiresMs === null) {
    warnings.push(`Malformed Expires header "${expiresRaw}"; treated as already expired (lifetime 0s).`);
  }

  const ageRaw = findHeaderCaseInsensitive(headers, 'Age');
  let initialAgeSeconds = 0;
  if (ageRaw !== undefined && ageRaw !== '') {
    if (/^\d+$/.test(ageRaw.trim())) {
      initialAgeSeconds = Number.parseInt(ageRaw.trim(), 10);
    } else {
      warnings.push(`Invalid Age header "${ageRaw}"; expected non-negative integer, defaulting initial age to 0s.`);
    }
  }

  let freshnessLifetimeSeconds: number | null = null;
  let lifetimeSource: FreshnessCalculation['lifetimeSource'] = 'none';

  if (environment === 'shared' && policy.sMaxage !== null) {
    freshnessLifetimeSeconds = policy.sMaxage;
    lifetimeSource = 's-maxage';
  } else if (policy.maxAge !== null) {
    freshnessLifetimeSeconds = policy.maxAge;
    lifetimeSource = 'max-age';
  } else if (expiresRaw !== undefined && expiresRaw !== '') {
    lifetimeSource = 'expires';
    if (parsedExpiresMs === null) {
      freshnessLifetimeSeconds = 0;
    } else {
      const diffSec = Math.floor((parsedExpiresMs - referenceDateMs) / 1000);
      freshnessLifetimeSeconds = Math.max(0, diffSec);
      if (diffSec <= 0) {
        warnings.push('Expires header is at or before the response Date (already expired).');
      }
    }
  }

  const residentTimeSeconds = Math.max(0, Math.floor((simulatedTimeMs - storedAtMs) / 1000));
  const currentAgeSeconds = initialAgeSeconds + residentTimeSeconds;
  const remainingFreshnessSeconds =
    freshnessLifetimeSeconds !== null ? freshnessLifetimeSeconds - currentAgeSeconds : null;

  let status: FreshnessCalculation['status'] = 'unknown';
  if (freshnessLifetimeSeconds === null) {
    status = 'unknown';
  } else if (remainingFreshnessSeconds !== null && remainingFreshnessSeconds > 0) {
    status = 'fresh';
  } else if (
    remainingFreshnessSeconds !== null &&
    !policy.mustRevalidate &&
    policy.staleWhileRevalidate !== null &&
    Math.abs(remainingFreshnessSeconds) < policy.staleWhileRevalidate
  ) {
    status = 'stale-while-revalidate';
  } else {
    status = 'stale';
  }

  return {
    freshnessLifetimeSeconds,
    lifetimeSource,
    initialAgeSeconds,
    residentTimeSeconds,
    currentAgeSeconds,
    remainingFreshnessSeconds,
    status,
    warnings,
  };
}

export function checkCacheability(params: {
  method: HttpMethod;
  response: HttpResponse;
  environment: CacheEnvironment;
  policy: CachePolicy;
  vary: { headers: string[]; isWildcard: boolean };
}): { cacheable: boolean; reason: string } {
  const { method, response, environment, policy, vary } = params;

  if (method !== 'GET') {
    return {
      cacheable: false,
      reason: `Method ${method} is not eligible for normal response storage in CacheLab.`,
    };
  }

  if (policy.noStore) {
    return {
      cacheable: false,
      reason: 'Response includes Cache-Control: no-store, which prohibits storing it in any cache.',
    };
  }

  if (environment === 'shared' && policy.isPrivate) {
    return {
      cacheable: false,
      reason:
        'Response includes Cache-Control: private, which permits storage only in a user’s private browser cache and blocks shared proxy/CDN caches.',
    };
  }

  if (vary.isWildcard) {
    return {
      cacheable: false,
      reason: 'Response specifies Vary: *, which prevents ordinary cache reuse across requests.',
    };
  }

  if (!CACHEABLE_STATUS_CODES.has(response.status)) {
    return {
      cacheable: false,
      reason: `HTTP ${response.status} ${response.statusText || getStatusText(response.status)} is not cacheable under simulator rules.`,
    };
  }

  const hasExplicitFreshness =
    policy.maxAge !== null ||
    (environment === 'shared' && policy.sMaxage !== null) ||
    Boolean(findHeaderCaseInsensitive(response.headers, 'Expires'));

  if (response.status === 404 && !hasExplicitFreshness && !policy.noCache && !policy.isPublic) {
    return {
      cacheable: false,
      reason:
        'HTTP 404 Not Found requires explicit freshness directives (max-age, s-maxage, Expires, or public) to be stored.',
    };
  }

  return {
    cacheable: true,
    reason: 'Response meets method, status, directive, and cache-environment storage rules.',
  };
}

export class CacheStore {
  private entries: CacheEntry[];

  constructor(initialEntries: CacheEntry[] = []) {
    this.entries = [...initialEntries];
  }

  addEntry(entry: CacheEntry): CacheEntry {
    const existingIndex = this.entries.findIndex((item) => item.key === entry.key);
    if (existingIndex >= 0) {
      this.entries[existingIndex] = entry;
    } else {
      this.entries.push(entry);
    }
    return entry;
  }

  findMatchingEntry(method: HttpMethod, url: string, requestHeaders: Record<string, string>): CacheEntry | null {
    const lookupMethod: HttpMethod = method === 'HEAD' ? 'GET' : method;
    const candidates = this.entries.filter(
      (entry) => entry.method === lookupMethod && normalizeUrl(entry.url) === normalizeUrl(url)
    );
    if (candidates.length === 0) {
      return null;
    }

    for (const candidate of candidates) {
      if (candidate.hasWildcardVary) {
        continue;
      }
      const matchesVary = candidate.varyHeaderNames.every((headerName) => {
        const lower = headerName.toLowerCase();
        const storedVal = candidate.varyHeaders[lower] ?? '';
        const incomingVal = (findHeaderCaseInsensitive(requestHeaders, headerName) ?? '').trim();
        return storedVal === incomingVal;
      });
      if (matchesVary) {
        return candidate;
      }
    }
    return null;
  }

  updateEntry(key: string, updater: (existing: CacheEntry) => CacheEntry): CacheEntry | null {
    const index = this.entries.findIndex((item) => item.key === key);
    if (index === -1) {
      return null;
    }
    const updated = updater(this.entries[index]);
    this.entries[index] = updated;
    return updated;
  }

  removeEntry(key: string): boolean {
    const next = this.entries.filter((item) => item.key !== key);
    const removed = next.length !== this.entries.length;
    this.entries = next;
    return removed;
  }

  clearCache(): void {
    this.entries = [];
  }

  listEntries(): CacheEntry[] {
    return [...this.entries];
  }
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname}${parsed.search}`;
  } catch {
    return trimmed;
  }
}

export function createInitialSimulationState(
  environment: CacheEnvironment = 'private',
  simulatedTimeMs: number = DEFAULT_SIMULATED_TIME_MS
): SimulationState {
  return {
    environment,
    simulatedTimeMs,
    entries: [],
  };
}

function buildCacheEntry(params: {
  request: HttpRequest;
  response: HttpResponse;
  environment: CacheEnvironment;
  storedAtMs: number;
}): CacheEntry {
  const { request, response, environment, storedAtMs } = params;
  const headers = normalizeHeadersMap(response.headers);
  const policy = parseCacheControl(findHeaderCaseInsensitive(headers, 'Cache-Control'));
  const vary = parseVaryHeader(findHeaderCaseInsensitive(headers, 'Vary'));
  const varyHeaders = extractVaryValues(request.headers, vary.headers);
  const freshness = calculateFreshness({
    policy,
    headers,
    environment,
    storedAtMs,
    simulatedTimeMs: storedAtMs,
  });

  const dateMs = parseHttpDate(findHeaderCaseInsensitive(headers, 'Date')) ?? storedAtMs;
  const etag = findHeaderCaseInsensitive(headers, 'ETag');
  const lastModified = findHeaderCaseInsensitive(headers, 'Last-Modified');

  return {
    key: createCacheKey(request.method, request.url, varyHeaders),
    method: request.method,
    url: request.url,
    varyHeaderNames: vary.headers,
    varyHeaders,
    hasWildcardVary: vary.isWildcard,
    status: response.status,
    statusText: response.statusText || getStatusText(response.status),
    headers,
    body: response.body,
    storedAtMs,
    responseDateMs: dateMs,
    freshnessLifetimeSeconds: freshness.freshnessLifetimeSeconds,
    initialAgeSeconds: freshness.initialAgeSeconds,
    policy,
    etag,
    lastModified,
  };
}

function buildEvents(
  items: Array<Omit<CacheEvent, 'step'>>,
  timestampMs: number
): CacheEvent[] {
  return items.map((item, idx) => ({
    ...item,
    step: idx + 1,
    timestampMs,
  }));
}

function makeTrace(
  visitedNodes: FlowNodeId[],
  activeEdges: string[],
  visualState: FlowTrace['visualState']
): FlowTrace {
  return { visitedNodes, activeEdges, visualState };
}

export function runSimulation(
  state: SimulationState,
  request: HttpRequest,
  originResponse: HttpResponse
): { result: SimulationResult; nextState: SimulationState } {
  const store = new CacheStore(state.entries);
  const requestHeaders = normalizeHeadersMap(request.headers);
  const now = state.simulatedTimeMs;
  const events: Array<Omit<CacheEvent, 'step'>> = [
    {
      timestampMs: now,
      title: 'Request received',
      detail: `${request.method} ${request.url} in ${state.environment} cache environment.`,
      category: 'request',
    },
  ];

  // 1. Handle non-GET / HEAD methods
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    events.push({
      timestampMs: now,
      title: 'Cache bypassed',
      detail: `${request.method} is an unsafe/non-cacheable method; forwarded directly to origin server.`,
      category: 'origin',
    });

    const responseHeaders = normalizeHeadersMap(originResponse.headers);
    return {
      result: {
        decision: 'CACHE_BYPASS',
        httpStatus: originResponse.status,
        statusText: originResponse.statusText || getStatusText(originResponse.status),
        environment: state.environment,
        simulatedTimeMs: now,
        currentAgeSeconds: null,
        freshnessLifetimeSeconds: null,
        remainingFreshnessSeconds: null,
        freshnessStatus: 'not-cached',
        originContactRequired: true,
        validationRequired: false,
        storedInCache: false,
        reason: `HTTP ${request.method} requests bypass the cache and are sent directly to the origin server without storing the response.`,
        requestHeadersSent: requestHeaders,
        responseHeadersReceived: responseHeaders,
        responseBody: originResponse.body,
        events: buildEvents(events, now),
        matchedEntry: null,
        flowTrace: makeTrace(
          ['request', 'lookup', 'bypass', 'origin', 'serve'],
          ['request->lookup', 'lookup->bypass', 'bypass->origin', 'origin->serve'],
          'bypass'
        ),
        warnings: [],
        canRevalidate: false,
      },
      nextState: { ...state, entries: store.listEntries() },
    };
  }

  // 2. Cache lookup
  events.push({
    timestampMs: now,
    title: 'Cache lookup started',
    detail: `Searching ${state.environment} cache store for ${request.method} ${request.url} (evaluating Vary headers).`,
    category: 'lookup',
  });

  const matchedEntry = store.findMatchingEntry(request.method, request.url, requestHeaders);

  // Explicit HEAD handling
  if (request.method === 'HEAD') {
    if (matchedEntry) {
      const freshness = calculateFreshness({
        policy: matchedEntry.policy,
        headers: matchedEntry.headers,
        environment: state.environment,
        storedAtMs: matchedEntry.storedAtMs,
        simulatedTimeMs: now,
      });
      if (!matchedEntry.policy.noCache && freshness.status === 'fresh') {
        events.push({
          timestampMs: now,
          title: 'Fresh GET metadata matched for HEAD',
          detail: 'Serving cached headers with an empty body for HEAD request.',
          category: 'decision',
        });
        return {
          result: {
            decision: 'CACHE_HIT',
            httpStatus: matchedEntry.status,
            statusText: matchedEntry.statusText,
            environment: state.environment,
            simulatedTimeMs: now,
            currentAgeSeconds: freshness.currentAgeSeconds,
            freshnessLifetimeSeconds: freshness.freshnessLifetimeSeconds,
            remainingFreshnessSeconds: freshness.remainingFreshnessSeconds,
            freshnessStatus: freshness.status,
            originContactRequired: false,
            validationRequired: false,
            storedInCache: false,
            reason:
              'HEAD request satisfied from fresh cached GET entry metadata (headers returned without message body).',
            requestHeadersSent: requestHeaders,
            responseHeadersReceived: {
              ...matchedEntry.headers,
              Age: String(freshness.currentAgeSeconds ?? 0),
            },
            responseBody: '',
            events: buildEvents(events, now),
            matchedEntry,
            flowTrace: makeTrace(
              ['request', 'lookup', 'match', 'fresh_check', 'hit', 'serve'],
              ['request->lookup', 'lookup->match', 'match->fresh_check', 'fresh_check->hit', 'hit->serve'],
              'hit'
            ),
            warnings: freshness.warnings,
            canRevalidate: false,
          },
          nextState: { ...state, entries: store.listEntries() },
        };
      }
    }

    events.push({
      timestampMs: now,
      title: 'HEAD forwarded to origin',
      detail: 'No fresh reusable entry for HEAD; forwarding request to origin without storing response.',
      category: 'origin',
    });

    return {
      result: {
        decision: 'CACHE_BYPASS',
        httpStatus: originResponse.status,
        statusText: originResponse.statusText || getStatusText(originResponse.status),
        environment: state.environment,
        simulatedTimeMs: now,
        currentAgeSeconds: null,
        freshnessLifetimeSeconds: null,
        remainingFreshnessSeconds: null,
        freshnessStatus: 'not-cached',
        originContactRequired: true,
        validationRequired: false,
        storedInCache: false,
        reason:
          'HEAD requests return headers only and do not populate new full-representation cache entries in CacheLab.',
        requestHeadersSent: requestHeaders,
        responseHeadersReceived: normalizeHeadersMap(originResponse.headers),
        responseBody: '',
        events: buildEvents(events, now),
        matchedEntry: null,
        flowTrace: makeTrace(
          ['request', 'lookup', 'bypass', 'origin', 'serve'],
          ['request->lookup', 'lookup->bypass', 'bypass->origin', 'origin->serve'],
          'bypass'
        ),
        warnings: [],
        canRevalidate: false,
      },
      nextState: { ...state, entries: store.listEntries() },
    };
  }

  // 3. Cache miss path
  if (!matchedEntry) {
    events.push({
      timestampMs: now,
      title: 'No matching entry found',
      detail: 'Cache miss. Contacting origin server for the resource.',
      category: 'lookup',
    });

    const respHeaders = normalizeHeadersMap(originResponse.headers);
    const policy = parseCacheControl(findHeaderCaseInsensitive(respHeaders, 'Cache-Control'));
    const vary = parseVaryHeader(findHeaderCaseInsensitive(respHeaders, 'Vary'));

    events.push({
      timestampMs: now,
      title: 'Origin response received',
      detail: `HTTP ${originResponse.status} ${originResponse.statusText || getStatusText(originResponse.status)} returned by origin.`,
      category: 'origin',
    });

    const cacheability = checkCacheability({
      method: request.method,
      response: originResponse,
      environment: state.environment,
      policy,
      vary,
    });

    const freshness = calculateFreshness({
      policy,
      headers: respHeaders,
      environment: state.environment,
      storedAtMs: now,
      simulatedTimeMs: now,
    });

    if (!cacheability.cacheable) {
      events.push({
        timestampMs: now,
        title: 'Cache storage blocked',
        detail: cacheability.reason,
        category: 'store',
      });

      return {
        result: {
          decision: 'CACHE_STORE_BLOCKED',
          httpStatus: originResponse.status,
          statusText: originResponse.statusText || getStatusText(originResponse.status),
          environment: state.environment,
          simulatedTimeMs: now,
          currentAgeSeconds: freshness.currentAgeSeconds,
          freshnessLifetimeSeconds: freshness.freshnessLifetimeSeconds,
          remainingFreshnessSeconds: freshness.remainingFreshnessSeconds,
          freshnessStatus: 'not-cached',
          originContactRequired: true,
          validationRequired: false,
          storedInCache: false,
          reason: `Cache miss followed by blocked storage: ${cacheability.reason}`,
          requestHeadersSent: requestHeaders,
          responseHeadersReceived: respHeaders,
          responseBody: originResponse.body,
          events: buildEvents(events, now),
          matchedEntry: null,
          flowTrace: makeTrace(
            ['request', 'lookup', 'match', 'miss', 'origin', 'store_check', 'serve'],
            ['request->lookup', 'lookup->match', 'match->miss', 'miss->origin', 'origin->store_check', 'store_check->serve'],
            'bypass'
          ),
          warnings: freshness.warnings,
          canRevalidate: false,
        },
        nextState: { ...state, entries: store.listEntries() },
      };
    }

    const newEntry = buildCacheEntry({
      request,
      response: originResponse,
      environment: state.environment,
      storedAtMs: now,
    });
    store.addEntry(newEntry);

    events.push({
      timestampMs: now,
      title: 'Response stored in cache',
      detail: newEntry.policy.noCache
        ? 'Stored entry with no-cache policy (future requests must revalidate before reuse).'
        : newEntry.freshnessLifetimeSeconds !== null
          ? `Stored with freshness lifetime of ${formatDuration(newEntry.freshnessLifetimeSeconds)}.`
          : 'Stored without explicit freshness lifetime.',
      category: 'store',
    });

    return {
      result: {
        decision: 'CACHE_MISS',
        httpStatus: originResponse.status,
        statusText: originResponse.statusText || getStatusText(originResponse.status),
        environment: state.environment,
        simulatedTimeMs: now,
        currentAgeSeconds: freshness.currentAgeSeconds,
        freshnessLifetimeSeconds: freshness.freshnessLifetimeSeconds,
        remainingFreshnessSeconds: freshness.remainingFreshnessSeconds,
        freshnessStatus: freshness.status,
        originContactRequired: true,
        validationRequired: false,
        storedInCache: true,
        reason: `Cache miss: no matching entry found in ${state.environment} cache. Fetched from origin and stored response for future requests.`,
        requestHeadersSent: requestHeaders,
        responseHeadersReceived: respHeaders,
        responseBody: originResponse.body,
        events: buildEvents(events, now),
        matchedEntry: newEntry,
        flowTrace: makeTrace(
          ['request', 'lookup', 'match', 'miss', 'origin', 'store_check', 'serve'],
          ['request->lookup', 'lookup->match', 'match->miss', 'miss->origin', 'origin->store_check', 'store_check->serve'],
          'miss'
        ),
        warnings: freshness.warnings,
        canRevalidate: false,
      },
      nextState: { ...state, entries: store.listEntries() },
    };
  }

  // 4. Matching entry found -> evaluate policy & freshness
  events.push({
    timestampMs: now,
    title: 'Matching entry found',
    detail: `Matched cached entry key "${matchedEntry.key}".`,
    category: 'lookup',
  });

  const freshness = calculateFreshness({
    policy: matchedEntry.policy,
    headers: matchedEntry.headers,
    environment: state.environment,
    storedAtMs: matchedEntry.storedAtMs,
    simulatedTimeMs: now,
  });

  events.push({
    timestampMs: now,
    title: 'Freshness evaluated',
    detail:
      freshness.freshnessLifetimeSeconds !== null
        ? `Current age ${formatDuration(freshness.currentAgeSeconds)} vs lifetime ${formatDuration(freshness.freshnessLifetimeSeconds)} (${freshness.status}).`
        : `No explicit freshness lifetime configured (current age ${formatDuration(freshness.currentAgeSeconds)}).`,
    category: 'freshness',
  });

  const hasValidator = Boolean(matchedEntry.etag || matchedEntry.lastModified);

  // `no-cache` forces revalidation even if freshness lifetime has not elapsed
  if (matchedEntry.policy.noCache) {
    events.push({
      timestampMs: now,
      title: 'Revalidation required by no-cache',
      detail: hasValidator
        ? 'Entry is stored under Cache-Control: no-cache and requires conditional validation with origin before reuse.'
        : 'Entry is stored under Cache-Control: no-cache and has no validators; origin validation/fetch is required.',
      category: 'validation',
    });

    return {
      result: {
        decision: 'REVALIDATION_REQUIRED',
        httpStatus: matchedEntry.status,
        statusText: matchedEntry.statusText,
        environment: state.environment,
        simulatedTimeMs: now,
        currentAgeSeconds: freshness.currentAgeSeconds,
        freshnessLifetimeSeconds: freshness.freshnessLifetimeSeconds,
        remainingFreshnessSeconds: freshness.remainingFreshnessSeconds,
        freshnessStatus: freshness.status,
        originContactRequired: true,
        validationRequired: true,
        storedInCache: false,
        reason:
          'Cache-Control: no-cache allows storing the response, but forbids reusing it without first revalidating with the origin server.',
        requestHeadersSent: buildConditionalHeaders(requestHeaders, matchedEntry),
        responseHeadersReceived: matchedEntry.headers,
        responseBody: matchedEntry.body,
        events: buildEvents(events, now),
        matchedEntry,
        flowTrace: makeTrace(
          ['request', 'lookup', 'match', 'fresh_check', 'validation_check', 'conditional_request'],
          ['request->lookup', 'lookup->match', 'match->fresh_check', 'fresh_check->validation_check', 'validation_check->conditional_request'],
          'revalidation'
        ),
        warnings: freshness.warnings,
        canRevalidate: hasValidator,
      },
      nextState: { ...state, entries: store.listEntries() },
    };
  }

  // Fresh hit
  if (freshness.status === 'fresh') {
    events.push({
      timestampMs: now,
      title: 'Cache hit determined',
      detail: `Remaining freshness is ${formatDuration(freshness.remainingFreshnessSeconds)}.`,
      category: 'decision',
    });
    events.push({
      timestampMs: now,
      title: 'Response served from cache',
      detail: 'Origin server was not contacted.',
      category: 'decision',
    });

    return {
      result: {
        decision: 'CACHE_HIT',
        httpStatus: matchedEntry.status,
        statusText: matchedEntry.statusText,
        environment: state.environment,
        simulatedTimeMs: now,
        currentAgeSeconds: freshness.currentAgeSeconds,
        freshnessLifetimeSeconds: freshness.freshnessLifetimeSeconds,
        remainingFreshnessSeconds: freshness.remainingFreshnessSeconds,
        freshnessStatus: 'fresh',
        originContactRequired: false,
        validationRequired: false,
        storedInCache: false,
        reason: `Cache hit: entry is fresh (${formatDuration(freshness.remainingFreshnessSeconds)} remaining of ${formatDuration(freshness.freshnessLifetimeSeconds)} lifetime) and served directly from ${state.environment} cache.`,
        requestHeadersSent: requestHeaders,
        responseHeadersReceived: {
          ...matchedEntry.headers,
          Age: String(freshness.currentAgeSeconds ?? 0),
        },
        responseBody: matchedEntry.body,
        events: buildEvents(events, now),
        matchedEntry,
        flowTrace: makeTrace(
          ['request', 'lookup', 'match', 'fresh_check', 'hit', 'serve'],
          ['request->lookup', 'lookup->match', 'match->fresh_check', 'fresh_check->hit', 'hit->serve'],
          'hit'
        ),
        warnings: freshness.warnings,
        canRevalidate: false,
      },
      nextState: { ...state, entries: store.listEntries() },
    };
  }

  // Stale-while-revalidate window (when must-revalidate is not present)
  if (freshness.status === 'stale-while-revalidate') {
    events.push({
      timestampMs: now,
      title: 'Served stale within stale-while-revalidate window',
      detail: `Entry expired ${formatDuration(Math.abs(freshness.remainingFreshnessSeconds ?? 0))} ago, within stale-while-revalidate=${matchedEntry.policy.staleWhileRevalidate}s. Served immediately while asynchronous revalidation is queued.`,
      category: 'decision',
    });

    return {
      result: {
        decision: 'CACHE_HIT',
        httpStatus: matchedEntry.status,
        statusText: matchedEntry.statusText,
        environment: state.environment,
        simulatedTimeMs: now,
        currentAgeSeconds: freshness.currentAgeSeconds,
        freshnessLifetimeSeconds: freshness.freshnessLifetimeSeconds,
        remainingFreshnessSeconds: freshness.remainingFreshnessSeconds,
        freshnessStatus: 'stale-while-revalidate',
        originContactRequired: false,
        validationRequired: true,
        storedInCache: false,
        reason: `Served stale response immediately under stale-while-revalidate=${matchedEntry.policy.staleWhileRevalidate}s while triggering background revalidation.`,
        requestHeadersSent: requestHeaders,
        responseHeadersReceived: {
          ...matchedEntry.headers,
          Age: String(freshness.currentAgeSeconds ?? 0),
        },
        responseBody: matchedEntry.body,
        events: buildEvents(events, now),
        matchedEntry,
        flowTrace: makeTrace(
          ['request', 'lookup', 'match', 'fresh_check', 'hit', 'serve'],
          ['request->lookup', 'lookup->match', 'match->fresh_check', 'fresh_check->hit', 'hit->serve'],
          'stale'
        ),
        warnings: freshness.warnings,
        canRevalidate: hasValidator,
      },
      nextState: { ...state, entries: store.listEntries() },
    };
  }

  // Stale or unknown lifetime
  if (hasValidator) {
    events.push({
      timestampMs: now,
      title: 'Entry is stale — conditional validation required',
      detail: `Cached entry expired (${formatDuration(Math.abs(freshness.remainingFreshnessSeconds ?? 0))} past lifetime). Validators (${[
        matchedEntry.etag ? 'ETag' : null,
        matchedEntry.lastModified ? 'Last-Modified' : null,
      ]
        .filter(Boolean)
        .join(', ')}) allow conditional revalidation.`,
      category: 'validation',
    });

    return {
      result: {
        decision: 'CACHE_STALE',
        httpStatus: matchedEntry.status,
        statusText: matchedEntry.statusText,
        environment: state.environment,
        simulatedTimeMs: now,
        currentAgeSeconds: freshness.currentAgeSeconds,
        freshnessLifetimeSeconds: freshness.freshnessLifetimeSeconds,
        remainingFreshnessSeconds: freshness.remainingFreshnessSeconds,
        freshnessStatus: freshness.status,
        originContactRequired: true,
        validationRequired: true,
        storedInCache: false,
        reason:
          freshness.freshnessLifetimeSeconds !== null
            ? `Cached entry is stale (current age ${formatDuration(freshness.currentAgeSeconds)} exceeds ${formatDuration(freshness.freshnessLifetimeSeconds)} lifetime). Conditional revalidation with origin is required.`
            : 'Cached entry has no explicit freshness lifetime; conditional revalidation with origin is required.',
        requestHeadersSent: buildConditionalHeaders(requestHeaders, matchedEntry),
        responseHeadersReceived: matchedEntry.headers,
        responseBody: matchedEntry.body,
        events: buildEvents(events, now),
        matchedEntry,
        flowTrace: makeTrace(
          ['request', 'lookup', 'match', 'fresh_check', 'validation_check', 'conditional_request'],
          ['request->lookup', 'lookup->match', 'match->fresh_check', 'fresh_check->validation_check', 'validation_check->conditional_request'],
          'stale'
        ),
        warnings: freshness.warnings,
        canRevalidate: true,
      },
      nextState: { ...state, entries: store.listEntries() },
    };
  }

  // Stale with no validators -> must fetch full response from origin
  events.push({
    timestampMs: now,
    title: 'Entry is stale without validators',
    detail: 'No ETag or Last-Modified present on cached entry; must request a full representation from origin.',
    category: 'validation',
  });

  return {
    result: {
      decision: 'CACHE_STALE',
      httpStatus: matchedEntry.status,
      statusText: matchedEntry.statusText,
      environment: state.environment,
      simulatedTimeMs: now,
      currentAgeSeconds: freshness.currentAgeSeconds,
      freshnessLifetimeSeconds: freshness.freshnessLifetimeSeconds,
      remainingFreshnessSeconds: freshness.remainingFreshnessSeconds,
      freshnessStatus: freshness.status,
      originContactRequired: true,
      validationRequired: false,
      storedInCache: false,
      reason:
        'Cached entry is stale and lacks ETag or Last-Modified validators; the cache must fetch a full fresh response from the origin server.',
      requestHeadersSent: requestHeaders,
      responseHeadersReceived: matchedEntry.headers,
      responseBody: matchedEntry.body,
      events: buildEvents(events, now),
      matchedEntry,
      flowTrace: makeTrace(
        ['request', 'lookup', 'match', 'fresh_check', 'validation_check', 'origin'],
        ['request->lookup', 'lookup->match', 'match->fresh_check', 'fresh_check->validation_check', 'validation_check->origin'],
        'stale'
      ),
      warnings: freshness.warnings,
      canRevalidate: false,
    },
    nextState: { ...state, entries: store.listEntries() },
  };
}

function buildConditionalHeaders(
  baseHeaders: Record<string, string>,
  entry: CacheEntry
): Record<string, string> {
  const headers = { ...baseHeaders };
  if (entry.etag) {
    headers['If-None-Match'] = entry.etag;
  }
  if (entry.lastModified) {
    headers['If-Modified-Since'] = entry.lastModified;
  }
  return headers;
}

export function revalidateCacheEntry(params: {
  state: SimulationState;
  request: HttpRequest;
  outcome: RevalidationOutcome;
  newOriginResponse?: HttpResponse;
}): { result: SimulationResult; nextState: SimulationState } {
  const { state, request, outcome, newOriginResponse } = params;
  const store = new CacheStore(state.entries);
  const now = state.simulatedTimeMs;
  const baseRequestHeaders = normalizeHeadersMap(request.headers);
  const entry = store.findMatchingEntry(request.method, request.url, baseRequestHeaders);

  if (!entry) {
    // Fallback to normal simulation if no matching entry exists
    return runSimulation(
      state,
      request,
      newOriginResponse ?? {
        status: 200,
        statusText: 'OK',
        headers: {
          'Cache-Control': 'public, max-age=60',
          Date: toHttpDate(now),
        },
        body: '{"status":"ok"}',
      }
    );
  }

  const conditionalHeaders = buildConditionalHeaders(baseRequestHeaders, entry);
  const events: Array<Omit<CacheEvent, 'step'>> = [
    {
      timestampMs: now,
      title: 'Conditional request constructed',
      detail: `Attached ${[
        entry.etag ? `If-None-Match: ${entry.etag}` : null,
        entry.lastModified ? `If-Modified-Since: ${entry.lastModified}` : null,
      ]
        .filter(Boolean)
        .join(' and ') || 'conditional headers'}.`,
      category: 'validation',
    },
    {
      timestampMs: now,
      title: 'Conditional request sent to origin',
      detail: `${request.method} ${request.url} sent for validator verification.`,
      category: 'origin',
    },
  ];

  if (outcome === '304') {
    const incoming304Headers = normalizeHeadersMap(newOriginResponse?.headers ?? {});
    const mergedHeaders: Record<string, string> = {
      ...entry.headers,
      Date: toHttpDate(now),
    };
    // Update cache metadata fields if supplied by 304 response
    for (const headerName of ['Cache-Control', 'Expires', 'ETag', 'Last-Modified', 'Vary']) {
      const val = findHeaderCaseInsensitive(incoming304Headers, headerName);
      if (val !== undefined && val !== '') {
        mergedHeaders[headerName] = val;
      }
    }
    // Reset Age if origin sent new 304 without explicit Age
    const explicitAge = findHeaderCaseInsensitive(incoming304Headers, 'Age');
    if (explicitAge !== undefined && explicitAge !== '') {
      mergedHeaders.Age = explicitAge;
    } else {
      delete mergedHeaders.Age;
    }

    const updatedPolicy = parseCacheControl(findHeaderCaseInsensitive(mergedHeaders, 'Cache-Control'));
    const updatedFreshness = calculateFreshness({
      policy: updatedPolicy,
      headers: mergedHeaders,
      environment: state.environment,
      storedAtMs: now,
      simulatedTimeMs: now,
    });

    const updatedEntry: CacheEntry = {
      ...entry,
      headers: mergedHeaders,
      policy: updatedPolicy,
      storedAtMs: now,
      responseDateMs: now,
      initialAgeSeconds: updatedFreshness.initialAgeSeconds,
      freshnessLifetimeSeconds: updatedFreshness.freshnessLifetimeSeconds,
      etag: findHeaderCaseInsensitive(mergedHeaders, 'ETag') ?? entry.etag,
      lastModified: findHeaderCaseInsensitive(mergedHeaders, 'Last-Modified') ?? entry.lastModified,
    };

    store.updateEntry(entry.key, () => updatedEntry);

    events.push({
      timestampMs: now,
      title: 'Origin returned 304 Not Modified',
      detail: 'Origin confirmed validator matches current resource. No response body transferred.',
      category: 'origin',
    });
    events.push({
      timestampMs: now,
      title: 'Cached metadata updated & body reused',
      detail: `Refreshed Date/freshness (${formatDuration(updatedFreshness.freshnessLifetimeSeconds)} lifetime) and served previously stored body.`,
      category: 'store',
    });

    return {
      result: {
        decision: 'CACHE_UPDATED',
        httpStatus: 304,
        statusText: 'Not Modified',
        environment: state.environment,
        simulatedTimeMs: now,
        currentAgeSeconds: updatedFreshness.currentAgeSeconds,
        freshnessLifetimeSeconds: updatedFreshness.freshnessLifetimeSeconds,
        remainingFreshnessSeconds: updatedFreshness.remainingFreshnessSeconds,
        freshnessStatus: updatedFreshness.status,
        originContactRequired: true,
        validationRequired: true,
        storedInCache: true,
        reason:
          'Origin returned 304 Not Modified after validator match. CacheLab refreshed the stored entry metadata and reused the cached representation body.',
        requestHeadersSent: conditionalHeaders,
        responseHeadersReceived: {
          Date: mergedHeaders.Date,
          ...(mergedHeaders['Cache-Control'] ? { 'Cache-Control': mergedHeaders['Cache-Control'] } : {}),
          ...(updatedEntry.etag ? { ETag: updatedEntry.etag } : {}),
          ...(updatedEntry.lastModified ? { 'Last-Modified': updatedEntry.lastModified } : {}),
        },
        responseBody: updatedEntry.body,
        events: buildEvents(events, now),
        matchedEntry: updatedEntry,
        flowTrace: makeTrace(
          ['request', 'lookup', 'match', 'fresh_check', 'validation_check', 'conditional_request', 'outcome_304', 'serve'],
          [
            'request->lookup',
            'lookup->match',
            'match->fresh_check',
            'fresh_check->validation_check',
            'validation_check->conditional_request',
            'conditional_request->outcome_304',
            'outcome_304->serve',
          ],
          'revalidation'
        ),
        warnings: updatedFreshness.warnings,
        canRevalidate: false,
      },
      nextState: { ...state, entries: store.listEntries() },
    };
  }

  // outcome === '200' -> Modified resource returned by origin
  const replacementResponse: HttpResponse = newOriginResponse ?? {
    status: 200,
    statusText: 'OK',
    headers: {
      ...entry.headers,
      Date: toHttpDate(now),
      ETag: entry.etag ? `${entry.etag.replace(/"$/g, '')}-v2"` : '"resource-v2"',
    },
    body: JSON.stringify({ updated: true, refreshedAt: toHttpDate(now) }, null, 2),
  };

  const replacementHeaders = normalizeHeadersMap(replacementResponse.headers);
  if (!findHeaderCaseInsensitive(replacementHeaders, 'Date')) {
    replacementHeaders.Date = toHttpDate(now);
  }
  const replacementPolicy = parseCacheControl(findHeaderCaseInsensitive(replacementHeaders, 'Cache-Control'));
  const replacementVary = parseVaryHeader(findHeaderCaseInsensitive(replacementHeaders, 'Vary'));
  const cacheability = checkCacheability({
    method: request.method,
    response: replacementResponse,
    environment: state.environment,
    policy: replacementPolicy,
    vary: replacementVary,
  });

  const freshness = calculateFreshness({
    policy: replacementPolicy,
    headers: replacementHeaders,
    environment: state.environment,
    storedAtMs: now,
    simulatedTimeMs: now,
  });

  events.push({
    timestampMs: now,
    title: `Origin returned ${replacementResponse.status} ${replacementResponse.statusText || getStatusText(replacementResponse.status)}`,
    detail: 'Resource changed on origin; full updated representation received.',
    category: 'origin',
  });

  if (cacheability.cacheable) {
    const replacedEntry = buildCacheEntry({
      request,
      response: { ...replacementResponse, headers: replacementHeaders },
      environment: state.environment,
      storedAtMs: now,
    });
    store.removeEntry(entry.key);
    store.addEntry(replacedEntry);

    events.push({
      timestampMs: now,
      title: 'Cache entry replaced',
      detail: `Replaced stale representation with updated ${replacementResponse.status} response.`,
      category: 'store',
    });

    return {
      result: {
        decision: 'CACHE_UPDATED',
        httpStatus: replacementResponse.status,
        statusText: replacementResponse.statusText || getStatusText(replacementResponse.status),
        environment: state.environment,
        simulatedTimeMs: now,
        currentAgeSeconds: freshness.currentAgeSeconds,
        freshnessLifetimeSeconds: freshness.freshnessLifetimeSeconds,
        remainingFreshnessSeconds: freshness.remainingFreshnessSeconds,
        freshnessStatus: freshness.status,
        originContactRequired: true,
        validationRequired: true,
        storedInCache: true,
        reason:
          'Origin returned a new 200 OK representation because the resource changed. The old cache entry was replaced.',
        requestHeadersSent: conditionalHeaders,
        responseHeadersReceived: replacementHeaders,
        responseBody: replacementResponse.body,
        events: buildEvents(events, now),
        matchedEntry: replacedEntry,
        flowTrace: makeTrace(
          ['request', 'lookup', 'match', 'fresh_check', 'validation_check', 'conditional_request', 'outcome_200', 'serve'],
          [
            'request->lookup',
            'lookup->match',
            'match->fresh_check',
            'fresh_check->validation_check',
            'validation_check->conditional_request',
            'conditional_request->outcome_200',
            'outcome_200->serve',
          ],
          'revalidation'
        ),
        warnings: freshness.warnings,
        canRevalidate: false,
      },
      nextState: { ...state, entries: store.listEntries() },
    };
  }

  store.removeEntry(entry.key);
  events.push({
    timestampMs: now,
    title: 'Replacement response not stored',
    detail: cacheability.reason,
    category: 'store',
  });

  return {
    result: {
      decision: 'CACHE_STORE_BLOCKED',
      httpStatus: replacementResponse.status,
      statusText: replacementResponse.statusText || getStatusText(replacementResponse.status),
      environment: state.environment,
      simulatedTimeMs: now,
      currentAgeSeconds: freshness.currentAgeSeconds,
      freshnessLifetimeSeconds: freshness.freshnessLifetimeSeconds,
      remainingFreshnessSeconds: freshness.remainingFreshnessSeconds,
      freshnessStatus: 'not-cached',
      originContactRequired: true,
      validationRequired: true,
      storedInCache: false,
      reason: `Origin returned updated ${replacementResponse.status} response, but storing it was blocked: ${cacheability.reason}`,
      requestHeadersSent: conditionalHeaders,
      responseHeadersReceived: replacementHeaders,
      responseBody: replacementResponse.body,
      events: buildEvents(events, now),
      matchedEntry: null,
      flowTrace: makeTrace(
        ['request', 'lookup', 'match', 'fresh_check', 'validation_check', 'conditional_request', 'outcome_200', 'serve'],
        [
          'request->lookup',
          'lookup->match',
          'match->fresh_check',
          'fresh_check->validation_check',
          'validation_check->conditional_request',
          'conditional_request->outcome_200',
          'outcome_200->serve',
        ],
        'bypass'
      ),
      warnings: freshness.warnings,
      canRevalidate: false,
    },
    nextState: { ...state, entries: store.listEntries() },
  };
}

const DIRECTIVE_DESCRIPTIONS: Record<string, string> = {
  public: 'Allows storage by any cache (both private browser caches and shared proxies/CDNs).',
  private: 'Restricts storage to a single user’s private cache; shared caches must not store it.',
  'no-cache': 'Allows storage, but requires revalidation with the origin before every reuse.',
  'no-store': 'Prohibits storing any part of the request or response in any cache.',
  'max-age': 'Maximum time in seconds the response is considered fresh relative to response time.',
  's-maxage': 'Overrides max-age (and Expires) specifically for shared caches.',
  'must-revalidate': 'Once stale, the cache must not serve the response without successful origin revalidation.',
  immutable: 'Signals that the response body will not change during its freshness lifetime.',
  'stale-while-revalidate': 'Allows serving a stale response for N seconds while revalidating asynchronously.',
};

export function inspectHeaders(
  rawInput: string,
  simulatedTimeMs: number = DEFAULT_SIMULATED_TIME_MS,
  environment: CacheEnvironment = 'shared'
): HeaderInspectionResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      headers: {},
      policy: null,
      directives: [],
      freshness: null,
      validators: {},
      vary: { headers: [], isWildcard: false },
      warnings: [],
      errors: ['Input is empty. Paste HTTP response headers (e.g. "Cache-Control: public, max-age=3600").'],
    };
  }

  const lines = trimmed.split(/\r?\n/);
  const headers: Record<string, string> = {};
  const errors: string[] = [];
  const warnings: string[] = [];
  let statusLine: string | undefined;
  let statusCode: number | undefined;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }
    if (index === 0 && line.toUpperCase().startsWith('HTTP/')) {
      statusLine = line;
      const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s+(.*))?$/i.exec(line);
      if (match) {
        statusCode = Number.parseInt(match[1], 10);
      } else {
        errors.push(`Malformed HTTP status line on line 1: "${line}". Expected format like "HTTP/1.1 200 OK".`);
      }
      return;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      errors.push(`Line ${index + 1} ("${line}") is missing a ":" separator between header name and value.`);
      return;
    }

    const name = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (!name || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
      errors.push(`Invalid HTTP header name "${name}" on line ${index + 1}.`);
      return;
    }

    if (headers[name] !== undefined) {
      headers[name] = `${headers[name]}, ${value}`;
      warnings.push(`Duplicate header "${name}" combined with comma.`);
    } else {
      headers[name] = value;
    }
  });

  if (Object.keys(headers).length === 0 && !statusLine) {
    return {
      valid: false,
      headers,
      policy: null,
      directives: [],
      freshness: null,
      validators: {},
      vary: { headers: [], isWildcard: false },
      warnings,
      errors: errors.length ? errors : ['No valid HTTP headers could be parsed.'],
    };
  }

  const ccRaw = findHeaderCaseInsensitive(headers, 'Cache-Control');
  const policy = parseCacheControl(ccRaw);

  const directives: ParsedDirectiveDetail[] = [];
  if (ccRaw) {
    for (const token of splitHeaderTokens(ccRaw)) {
      const eq = token.indexOf('=');
      const name = (eq === -1 ? token : token.slice(0, eq)).trim().toLowerCase();
      const value = eq === -1 ? undefined : token.slice(eq + 1).trim();
      const supported = SUPPORTED_DIRECTIVES.has(name);
      directives.push({
        name,
        value,
        supported,
        description: supported
          ? DIRECTIVE_DESCRIPTIONS[name]
          : 'Not evaluated by CacheLab’s educational model (displayed for inspection only).',
      });
    }
  }

  const dateMs = parseHttpDate(findHeaderCaseInsensitive(headers, 'Date'));
  const storedAtMs = dateMs ?? simulatedTimeMs;

  const freshness = calculateFreshness({
    policy,
    headers,
    environment,
    storedAtMs,
    simulatedTimeMs,
  });

  const etag = findHeaderCaseInsensitive(headers, 'ETag');
  const lastModified = findHeaderCaseInsensitive(headers, 'Last-Modified');
  if (lastModified && parseHttpDate(lastModified) === null) {
    warnings.push(`Malformed Last-Modified date "${lastModified}".`);
  }

  const varyRaw = findHeaderCaseInsensitive(headers, 'Vary');
  const varyParsed = parseVaryHeader(varyRaw);
  if (varyParsed.isWildcard) {
    warnings.push('Vary: * disables ordinary cache reuse across requests.');
  }

  if (policy.noStore && (etag || lastModified)) {
    warnings.push('Validators (ETag/Last-Modified) are present alongside no-store; caches cannot store the entry to revalidate later.');
  }

  const allWarnings = Array.from(new Set([...warnings, ...freshness.warnings]));

  return {
    valid: errors.length === 0,
    statusLine,
    statusCode,
    headers,
    policy,
    directives,
    freshness,
    validators: {
      etag,
      lastModified,
      isStrongEtag: etag ? !etag.trim().startsWith('W/') : undefined,
    },
    vary: {
      raw: varyRaw,
      headers: varyParsed.headers,
      isWildcard: varyParsed.isWildcard,
    },
    warnings: allWarnings,
    errors,
  };
}

export function comparePolicies(
  policyA: PolicyComparisonInput,
  policyB: PolicyComparisonInput,
  options: {
    environment: CacheEnvironment;
    elapsedSecondsSequence: number[];
    revalidationOutcome?: RevalidationOutcome;
  }
): [PolicyComparisonOutcome, PolicyComparisonOutcome] {
  const { environment, elapsedSecondsSequence, revalidationOutcome = '304' } = options;

  const evaluateSingle = (input: PolicyComparisonInput): PolicyComparisonOutcome => {
    const baseTimeMs = DEFAULT_SIMULATED_TIME_MS;
    const responseHeaders: Record<string, string> = {
      Date: toHttpDate(baseTimeMs),
      'Cache-Control': input.cacheControl,
    };
    if (input.etag) responseHeaders.ETag = input.etag;
    if (input.lastModified) responseHeaders['Last-Modified'] = input.lastModified;
    if (input.expires) responseHeaders.Expires = input.expires;
    if (input.vary) responseHeaders.Vary = input.vary;

    const request: HttpRequest = {
      method: 'GET',
      url: 'https://api.example.com/products',
      headers: { Accept: 'application/json' },
    };
    const response: HttpResponse = {
      status: 200,
      statusText: 'OK',
      headers: responseHeaders,
      body: '{"items":["cachelab-item"]}',
    };

    const parsedPolicy = parseCacheControl(input.cacheControl);
    const vary = parseVaryHeader(input.vary);
    const cacheability = checkCacheability({
      method: 'GET',
      response,
      environment,
      policy: parsedPolicy,
      vary,
    });
    const baseFreshness = calculateFreshness({
      policy: parsedPolicy,
      headers: responseHeaders,
      environment,
      storedAtMs: baseTimeMs,
      simulatedTimeMs: baseTimeMs,
    });

    let simState = createInitialSimulationState(environment, baseTimeMs);
    const steps: PolicyStepComparison[] = [];
    let originRequests = 0;
    let cacheHits = 0;
    let revalidations = 0;

    const sortedElapsed = [...elapsedSecondsSequence].sort((a, b) => a - b);

    sortedElapsed.forEach((elapsedSec, index) => {
      const currentMs = baseTimeMs + elapsedSec * 1000;
      simState = { ...simState, simulatedTimeMs: currentMs };
      const originResponseAtStep: HttpResponse = {
        ...response,
        headers: {
          ...response.headers,
          Date: toHttpDate(currentMs),
        },
      };

      const { result, nextState } = runSimulation(simState, request, originResponseAtStep);
      simState = nextState;

      let finalResult = result;
      if (
        (result.decision === 'CACHE_STALE' || result.decision === 'REVALIDATION_REQUIRED') &&
        result.canRevalidate
      ) {
        revalidations += 1;
        const reval = revalidateCacheEntry({
          state: simState,
          request,
          outcome: revalidationOutcome,
          newOriginResponse: originResponseAtStep,
        });
        simState = reval.nextState;
        finalResult = reval.result;
      }

      if (finalResult.originContactRequired) {
        originRequests += 1;
      }
      if (finalResult.decision === 'CACHE_HIT') {
        cacheHits += 1;
      }

      steps.push({
        stepIndex: index + 1,
        elapsedSeconds: elapsedSec,
        simulatedTimeMs: currentMs,
        decision: finalResult.decision,
        originContactRequired: finalResult.originContactRequired,
        validationRequired: finalResult.validationRequired,
        freshnessStatus: finalResult.freshnessStatus,
        remainingFreshnessSeconds: finalResult.remainingFreshnessSeconds,
        reason: finalResult.reason,
      });
    });

    const reuseBehavior = parsedPolicy.noStore
      ? 'Never stored or reused.'
      : parsedPolicy.noCache
        ? 'Stored, but every reuse requires origin revalidation.'
        : baseFreshness.freshnessLifetimeSeconds !== null && baseFreshness.freshnessLifetimeSeconds > 0
          ? `Served directly from cache for ${formatDuration(baseFreshness.freshnessLifetimeSeconds)}.`
          : 'No positive freshness window; immediately stale.';

    const revalidationBehavior = parsedPolicy.noStore
      ? 'Not applicable (nothing stored).'
      : input.etag || input.lastModified
        ? `Supports conditional 304 validation via ${[input.etag ? 'ETag' : null, input.lastModified ? 'Last-Modified' : null].filter(Boolean).join(' & ')}.`
        : 'No validators configured; stale entries require full 200 origin fetch.';

    const environmentImplications =
      environment === 'shared'
        ? parsedPolicy.isPrivate
          ? 'Blocked in shared cache because of "private" directive.'
          : parsedPolicy.sMaxage !== null
            ? `Shared cache uses s-maxage=${parsedPolicy.sMaxage}s instead of max-age.`
            : 'Shared cache follows max-age / Expires rules.'
        : parsedPolicy.isPrivate
          ? 'Permitted in user’s private browser cache.'
          : 'Private cache uses max-age / Expires (ignores s-maxage).';

    return {
      policy: input,
      parsedPolicy,
      eligibleForStorage: cacheability.cacheable,
      storageReason: cacheability.reason,
      freshnessLifetimeSeconds: baseFreshness.freshnessLifetimeSeconds,
      reuseBehavior,
      revalidationBehavior,
      environmentImplications,
      totalRequests: steps.length,
      originRequests,
      cacheHits,
      revalidations,
      steps,
    };
  };

  return [evaluateSingle(policyA), evaluateSingle(policyB)];
}
