import { describe, expect, it } from 'vitest';
import {
  CacheStore,
  calculateFreshness,
  comparePolicies,
  createInitialSimulationState,
  inspectHeaders,
  parseCacheControl,
  revalidateCacheEntry,
  runSimulation,
} from '../engine/cacheEngine';
import { HttpRequest, HttpResponse } from '../types/cache';
import { DEFAULT_SIMULATED_TIME_MS, toHttpDate } from '../utilities/httpFormatters';

const BASE_TIME = DEFAULT_SIMULATED_TIME_MS;

function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: 'GET',
    url: 'https://api.example.com/products',
    headers: { Accept: 'application/json' },
    ...overrides,
  };
}

function makeResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: {
      'Cache-Control': 'public, max-age=60',
      ETag: '"products-v1"',
      Date: toHttpDate(BASE_TIME),
    },
    body: '{"ok":true}',
    ...overrides,
  };
}

describe('CacheLab Engine', () => {
  it('parses supported Cache-Control directives and flags unknown directives', () => {
    const policy = parseCacheControl(
      'public, max-age=3600, s-maxage=7200, stale-while-revalidate=30, immutable, x-custom-edge=foo'
    );
    expect(policy.isPublic).toBe(true);
    expect(policy.maxAge).toBe(3600);
    expect(policy.sMaxage).toBe(7200);
    expect(policy.staleWhileRevalidate).toBe(30);
    expect(policy.immutable).toBe(true);
    expect(policy.unknownDirectives).toEqual(['x-custom-edge=foo']);
    expect(policy.parseWarnings).toHaveLength(0);
  });

  it('handles malformed max-age, invalid Age, missing Date, and expired Expires', () => {
    const policy = parseCacheControl('public, max-age=abc');
    expect(policy.maxAge).toBeNull();
    expect(policy.parseWarnings.some((w) => w.includes('Malformed "max-age"'))).toBe(true);

    const freshness = calculateFreshness({
      policy: parseCacheControl('public'),
      headers: {
        Age: 'not-a-number',
        Expires: toHttpDate(BASE_TIME - 60_000),
      },
      environment: 'private',
      storedAtMs: BASE_TIME,
      simulatedTimeMs: BASE_TIME,
    });
    expect(freshness.initialAgeSeconds).toBe(0);
    expect(freshness.freshnessLifetimeSeconds).toBe(0);
    expect(freshness.status).toBe('stale');
    expect(freshness.warnings.some((w) => w.includes('missing a Date header'))).toBe(true);
    expect(freshness.warnings.some((w) => w.includes('Invalid Age header'))).toBe(true);
    expect(freshness.warnings.some((w) => w.includes('Expires header is at or before'))).toBe(true);
  });

  it('detects conflicting Cache-Control directives', () => {
    const policy = parseCacheControl('public, private, no-store, max-age=60, no-cache, immutable');
    expect(policy.parseWarnings.length).toBeGreaterThanOrEqual(3);
    expect(policy.parseWarnings.some((w) => w.includes('"public" and "private"'))).toBe(true);
    expect(policy.parseWarnings.some((w) => w.includes('"no-store"'))).toBe(true);
    expect(policy.parseWarnings.some((w) => w.includes('"no-cache"'))).toBe(true);
  });

  it('executes complete demo journey: miss -> store -> hit -> stale -> 304 revalidation -> hit', () => {
    let state = createInitialSimulationState('private', BASE_TIME);
    const req = makeRequest();
    const res = makeResponse();

    // 1. First request -> CACHE_MISS & stored
    const step1 = runSimulation(state, req, res);
    expect(step1.result.decision).toBe('CACHE_MISS');
    expect(step1.result.storedInCache).toBe(true);
    expect(step1.result.originContactRequired).toBe(true);
    state = step1.nextState;
    expect(state.entries).toHaveLength(1);

    // 2. Advance +10s -> CACHE_HIT
    state = { ...state, simulatedTimeMs: BASE_TIME + 10_000 };
    const step2 = runSimulation(state, req, res);
    expect(step2.result.decision).toBe('CACHE_HIT');
    expect(step2.result.originContactRequired).toBe(false);
    expect(step2.result.currentAgeSeconds).toBe(10);
    expect(step2.result.remainingFreshnessSeconds).toBe(50);
    state = step2.nextState;

    // 3. Advance beyond 60s (+65s total) -> CACHE_STALE
    state = { ...state, simulatedTimeMs: BASE_TIME + 65_000 };
    const step3 = runSimulation(state, req, res);
    expect(step3.result.decision).toBe('CACHE_STALE');
    expect(step3.result.validationRequired).toBe(true);
    expect(step3.result.canRevalidate).toBe(true);
    expect(step3.result.requestHeadersSent['If-None-Match']).toBe('"products-v1"');
    state = step3.nextState;

    // 4. Revalidate with 304 Not Modified -> CACHE_UPDATED & body reused
    const step4 = revalidateCacheEntry({
      state,
      request: req,
      outcome: '304',
    });
    expect(step4.result.decision).toBe('CACHE_UPDATED');
    expect(step4.result.httpStatus).toBe(304);
    expect(step4.result.responseBody).toBe('{"ok":true}');
    expect(step4.result.remainingFreshnessSeconds).toBe(60);
    state = step4.nextState;

    // 5. Subsequent request at +10s after 304 -> CACHE_HIT
    state = { ...state, simulatedTimeMs: state.simulatedTimeMs + 10_000 };
    const step5 = runSimulation(state, req, res);
    expect(step5.result.decision).toBe('CACHE_HIT');
    expect(step5.result.remainingFreshnessSeconds).toBe(50);
  });

  it('uses s-maxage in shared cache and max-age in private cache', () => {
    const req = makeRequest();
    const res = makeResponse({
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=120',
        Date: toHttpDate(BASE_TIME),
      },
    });

    // Private cache expires after 30s
    let priv = createInitialSimulationState('private', BASE_TIME);
    priv = runSimulation(priv, req, res).nextState;
    priv = { ...priv, simulatedTimeMs: BASE_TIME + 45_000 };
    expect(runSimulation(priv, req, res).result.decision).toBe('CACHE_STALE');

    // Shared cache remains fresh at 45s
    let shared = createInitialSimulationState('shared', BASE_TIME);
    shared = runSimulation(shared, req, res).nextState;
    shared = { ...shared, simulatedTimeMs: BASE_TIME + 45_000 };
    const sharedHit = runSimulation(shared, req, res).result;
    expect(sharedHit.decision).toBe('CACHE_HIT');
    expect(sharedHit.freshnessLifetimeSeconds).toBe(120);
  });

  it('blocks storage on no-store and on private in shared cache', () => {
    const req = makeRequest();

    const noStoreState = createInitialSimulationState('private', BASE_TIME);
    const noStoreRes = makeResponse({
      headers: { 'Cache-Control': 'no-store', Date: toHttpDate(BASE_TIME) },
    });
    const noStoreOut = runSimulation(noStoreState, req, noStoreRes);
    expect(noStoreOut.result.decision).toBe('CACHE_STORE_BLOCKED');
    expect(noStoreOut.nextState.entries).toHaveLength(0);

    const sharedState = createInitialSimulationState('shared', BASE_TIME);
    const privateRes = makeResponse({
      headers: { 'Cache-Control': 'private, max-age=600', Date: toHttpDate(BASE_TIME) },
    });
    const sharedOut = runSimulation(sharedState, req, privateRes);
    expect(sharedOut.result.decision).toBe('CACHE_STORE_BLOCKED');
    expect(sharedOut.nextState.entries).toHaveLength(0);
  });

  it('stores no-cache responses but requires revalidation on every reuse', () => {
    let state = createInitialSimulationState('private', BASE_TIME);
    const req = makeRequest();
    const res = makeResponse({
      headers: {
        'Cache-Control': 'no-cache',
        ETag: '"cfg-1"',
        Date: toHttpDate(BASE_TIME),
      },
    });

    const first = runSimulation(state, req, res);
    expect(first.result.decision).toBe('CACHE_MISS');
    expect(first.result.storedInCache).toBe(true);
    state = first.nextState;

    // Even at +1s, no-cache requires revalidation
    state = { ...state, simulatedTimeMs: BASE_TIME + 1_000 };
    const second = runSimulation(state, req, res);
    expect(second.result.decision).toBe('REVALIDATION_REQUIRED');
    expect(second.result.validationRequired).toBe(true);
    expect(second.result.requestHeadersSent['If-None-Match']).toBe('"cfg-1"');
  });

  it('handles GET vs HEAD vs POST/PUT/DELETE methods appropriately', () => {
    let state = createInitialSimulationState('private', BASE_TIME);
    const res = makeResponse();

    const postOut = runSimulation(state, makeRequest({ method: 'POST' }), res);
    expect(postOut.result.decision).toBe('CACHE_BYPASS');
    expect(postOut.nextState.entries).toHaveLength(0);

    const putOut = runSimulation(state, makeRequest({ method: 'PUT' }), res);
    expect(putOut.result.decision).toBe('CACHE_BYPASS');

    const delOut = runSimulation(state, makeRequest({ method: 'DELETE' }), res);
    expect(delOut.result.decision).toBe('CACHE_BYPASS');

    // HEAD miss bypasses storage
    const headMiss = runSimulation(state, makeRequest({ method: 'HEAD' }), res);
    expect(headMiss.result.decision).toBe('CACHE_BYPASS');
    expect(headMiss.result.responseBody).toBe('');

    // GET populates, then HEAD hits metadata with empty body
    state = runSimulation(state, makeRequest({ method: 'GET' }), res).nextState;
    const headHit = runSimulation(state, makeRequest({ method: 'HEAD' }), res);
    expect(headHit.result.decision).toBe('CACHE_HIT');
    expect(headHit.result.responseBody).toBe('');
  });

  it('supports Last-Modified validation and 200 replacement', () => {
    const lastMod = toHttpDate(BASE_TIME - 3600_000);
    let state = createInitialSimulationState('private', BASE_TIME);
    const req = makeRequest();
    const res = makeResponse({
      headers: {
        'Cache-Control': 'public, max-age=10',
        'Last-Modified': lastMod,
        Date: toHttpDate(BASE_TIME),
      },
      body: '{"v":1}',
    });

    state = runSimulation(state, req, res).nextState;
    state = { ...state, simulatedTimeMs: BASE_TIME + 20_000 };

    const staleCheck = runSimulation(state, req, res);
    expect(staleCheck.result.decision).toBe('CACHE_STALE');
    expect(staleCheck.result.requestHeadersSent['If-Modified-Since']).toBe(lastMod);

    const replaced = revalidateCacheEntry({
      state: staleCheck.nextState,
      request: req,
      outcome: '200',
      newOriginResponse: makeResponse({
        headers: {
          'Cache-Control': 'public, max-age=60',
          'Last-Modified': toHttpDate(BASE_TIME + 20_000),
          Date: toHttpDate(BASE_TIME + 20_000),
        },
        body: '{"v":2}',
      }),
    });

    expect(replaced.result.decision).toBe('CACHE_UPDATED');
    expect(replaced.result.httpStatus).toBe(200);
    expect(replaced.result.responseBody).toBe('{"v":2}');
    expect(replaced.nextState.entries[0].body).toBe('{"v":2}');
  });

  it('partitions cache entries by Vary headers and blocks Vary: *', () => {
    let state = createInitialSimulationState('shared', BASE_TIME);
    const enReq = makeRequest({ headers: { Accept: 'application/json', 'Accept-Language': 'en-US' } });
    const frReq = makeRequest({ headers: { Accept: 'application/json', 'Accept-Language': 'fr-FR' } });
    const enRes = makeResponse({
      headers: { 'Cache-Control': 'public, max-age=120', Vary: 'Accept-Language', Date: toHttpDate(BASE_TIME) },
      body: '{"lang":"en"}',
    });
    const frRes = makeResponse({
      headers: { 'Cache-Control': 'public, max-age=120', Vary: 'Accept-Language', Date: toHttpDate(BASE_TIME) },
      body: '{"lang":"fr"}',
    });

    state = runSimulation(state, enReq, enRes).nextState;
    const frMiss = runSimulation(state, frReq, frRes);
    expect(frMiss.result.decision).toBe('CACHE_MISS');
    state = frMiss.nextState;
    expect(state.entries).toHaveLength(2);

    expect(runSimulation(state, enReq, enRes).result.responseBody).toBe('{"lang":"en"}');
    expect(runSimulation(state, frReq, frRes).result.responseBody).toBe('{"lang":"fr"}');

    // Vary: * blocks storage & reuse
    const wildcardRes = makeResponse({
      headers: { 'Cache-Control': 'public, max-age=120', Vary: '*', Date: toHttpDate(BASE_TIME) },
    });
    const wildcardOut = runSimulation(createInitialSimulationState('shared', BASE_TIME), enReq, wildcardRes);
    expect(wildcardOut.result.decision).toBe('CACHE_STORE_BLOCKED');
  });

  it('clears cache via CacheStore', () => {
    const store = new CacheStore();
    const state = runSimulation(createInitialSimulationState('private', BASE_TIME), makeRequest(), makeResponse()).nextState;
    store.addEntry(state.entries[0]);
    expect(store.listEntries()).toHaveLength(1);
    store.clearCache();
    expect(store.listEntries()).toHaveLength(0);
  });

  it('inspects valid and malformed raw headers cleanly without throwing', () => {
    const good = inspectHeaders(
      `HTTP/1.1 200 OK\nDate: ${toHttpDate(BASE_TIME)}\nCache-Control: public, max-age=3600\nETag: "abc123"\nVary: Accept-Encoding`,
      BASE_TIME,
      'shared'
    );
    expect(good.valid).toBe(true);
    expect(good.statusCode).toBe(200);
    expect(good.freshness?.freshnessLifetimeSeconds).toBe(3600);
    expect(good.validators.etag).toBe('"abc123"');
    expect(good.vary.headers).toEqual(['Accept-Encoding']);

    const malformed = inspectHeaders('NotAValidHeaderLine\nCache-Control: max-age=xyz', BASE_TIME);
    expect(malformed.valid).toBe(false);
    expect(malformed.errors.length).toBeGreaterThan(0);
  });

  it('compares two caching policies using real engine executions', () => {
    const [a, b] = comparePolicies(
      { id: 'a', label: 'max-age=60', cacheControl: 'public, max-age=60', etag: '"v1"' },
      { id: 'b', label: 'no-store', cacheControl: 'no-store' },
      { environment: 'shared', elapsedSecondsSequence: [0, 30, 90] }
    );
    expect(a.eligibleForStorage).toBe(true);
    expect(a.cacheHits).toBe(1);
    expect(a.originRequests).toBe(2); // miss at 0s, revalidation at 90s
    expect(b.eligibleForStorage).toBe(false);
    expect(b.originRequests).toBe(3);
  });

  it('handles stale-while-revalidate, must-revalidate, Age accumulation, and 500 status blocking', () => {
    const req = makeRequest();

    // 500 response blocked from storage
    const errRes = makeResponse({ status: 500, statusText: 'Internal Server Error' });
    const errOut = runSimulation(createInitialSimulationState('private', BASE_TIME), req, errRes);
    expect(errOut.result.decision).toBe('CACHE_STORE_BLOCKED');

    // Age: 20 with max-age=60 leaves 40s remaining; at +45s it is stale
    let ageState = createInitialSimulationState('private', BASE_TIME);
    const ageRes = makeResponse({
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
        Age: '20',
        ETag: '"swr-1"',
        Date: toHttpDate(BASE_TIME),
      },
    });
    ageState = runSimulation(ageState, req, ageRes).nextState;
    ageState = { ...ageState, simulatedTimeMs: BASE_TIME + 45_000 }; // currentAge = 20 + 45 = 65s (5s past 60s, inside 30s SWR)
    const swrOut = runSimulation(ageState, req, ageRes);
    expect(swrOut.result.decision).toBe('CACHE_HIT');
    expect(swrOut.result.freshnessStatus).toBe('stale-while-revalidate');

    // must-revalidate blocks stale-while-revalidate serving
    let mrState = createInitialSimulationState('private', BASE_TIME);
    const mrRes = makeResponse({
      headers: {
        'Cache-Control': 'public, max-age=60, must-revalidate, stale-while-revalidate=30',
        Age: '20',
        ETag: '"mr-1"',
        Date: toHttpDate(BASE_TIME),
      },
    });
    mrState = runSimulation(mrState, req, mrRes).nextState;
    mrState = { ...mrState, simulatedTimeMs: BASE_TIME + 45_000 };
    const mrOut = runSimulation(mrState, req, mrRes);
    expect(mrOut.result.decision).toBe('CACHE_STALE');
  });
});
