import { HttpRequest, HttpResponse, ScenarioPreset } from '../types/cache';
import { DEFAULT_SIMULATED_TIME_MS, toHttpDate } from '../utilities/httpFormatters';

export const DEFAULT_DEMO_REQUEST: HttpRequest = {
  method: 'GET',
  url: 'https://api.example.com/products',
  headers: {
    Accept: 'application/json',
    'Accept-Language': 'en-US',
  },
};

export const DEFAULT_DEMO_RESPONSE: HttpResponse = {
  status: 200,
  statusText: 'OK',
  headers: {
    'Cache-Control': 'public, max-age=60',
    ETag: '"products-v1"',
    Date: toHttpDate(DEFAULT_SIMULATED_TIME_MS),
    Vary: 'Accept-Language',
  },
  body: JSON.stringify(
    {
      products: [
        { id: 'sku-101', name: 'Edge Router X2', price: 249 },
        { id: 'sku-102', name: 'Protocol Analyzer Pro', price: 499 },
      ],
      version: 1,
    },
    null,
    2
  ),
};

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'first-request',
    title: '1. First Request (Cache Miss)',
    concept: 'Cold cache lookup, origin fetch, and initial storage',
    description:
      'Starts with an empty cache. Because no matching entry exists, the simulator contacts the origin server and stores the cacheable 200 OK response with max-age=60.',
    environment: 'private',
    request: { ...DEFAULT_DEMO_REQUEST, headers: { ...DEFAULT_DEMO_REQUEST.headers } },
    response: {
      ...DEFAULT_DEMO_RESPONSE,
      headers: { ...DEFAULT_DEMO_RESPONSE.headers },
    },
    initialTimeOffsetSeconds: 0,
    prepopulateCache: false,
    learningTopicIds: ['what-is-http-caching', 'cache-control', 'max-age'],
  },
  {
    id: 'fresh-cache-hit',
    title: '2. Fresh Cache Hit',
    concept: 'Serving directly from cache while age < max-age',
    description:
      'Pre-populates the cache at t=0s with max-age=60 and advances simulated time by +10s. Since current age (10s) is under 60s, the cache serves the stored entry with zero origin requests.',
    environment: 'private',
    request: { ...DEFAULT_DEMO_REQUEST, headers: { ...DEFAULT_DEMO_REQUEST.headers } },
    response: {
      ...DEFAULT_DEMO_RESPONSE,
      headers: { ...DEFAULT_DEMO_RESPONSE.headers },
    },
    initialTimeOffsetSeconds: 10,
    prepopulateCache: true,
    learningTopicIds: ['fresh-vs-stale', 'max-age', 'age-header'],
  },
  {
    id: 'stale-cache',
    title: '3. Stale Cache Expiration',
    concept: 'Freshness lifetime exceeded after advancing time past max-age',
    description:
      'Pre-populates the cache with max-age=60 and advances time by +90s. The entry is now stale (30s past expiration) and cannot be served without revalidation.',
    environment: 'private',
    request: { ...DEFAULT_DEMO_REQUEST, headers: { ...DEFAULT_DEMO_REQUEST.headers } },
    response: {
      ...DEFAULT_DEMO_RESPONSE,
      headers: { ...DEFAULT_DEMO_RESPONSE.headers },
    },
    initialTimeOffsetSeconds: 90,
    prepopulateCache: true,
    recommendedRevalidationOutcome: '304',
    learningTopicIds: ['fresh-vs-stale', 'expires-header', 'age-header'],
  },
  {
    id: 'etag-revalidation',
    title: '4. ETag Revalidation (304 Not Modified)',
    concept: 'Conditional validation with If-None-Match returning 304',
    description:
      'Loads a stale entry carrying ETag "products-v1". Run the simulation to observe the stale state, then click Revalidate (304 Not Modified) to refresh metadata and reuse the stored body.',
    environment: 'private',
    request: { ...DEFAULT_DEMO_REQUEST, headers: { ...DEFAULT_DEMO_REQUEST.headers } },
    response: {
      ...DEFAULT_DEMO_RESPONSE,
      headers: { ...DEFAULT_DEMO_RESPONSE.headers },
    },
    initialTimeOffsetSeconds: 75,
    prepopulateCache: true,
    recommendedRevalidationOutcome: '304',
    learningTopicIds: ['etag', 'not-modified-304', 'cache-revalidation'],
  },
  {
    id: 'modified-resource',
    title: '5. Modified Resource (200 Replacement)',
    concept: 'Conditional validation when origin content has changed',
    description:
      'Loads a stale entry with both ETag and Last-Modified validators. Triggering Revalidate with outcome 200 Modified simulates a resource update that replaces the cached representation.',
    environment: 'private',
    request: { ...DEFAULT_DEMO_REQUEST, headers: { ...DEFAULT_DEMO_REQUEST.headers } },
    response: {
      status: 200,
      statusText: 'OK',
      headers: {
        'Cache-Control': 'public, max-age=60',
        ETag: '"catalog-v1"',
        'Last-Modified': toHttpDate(DEFAULT_SIMULATED_TIME_MS - 3600_000),
        Date: toHttpDate(DEFAULT_SIMULATED_TIME_MS),
      },
      body: JSON.stringify({ catalogVersion: 1, items: ['Node-A', 'Node-B'] }, null, 2),
    },
    initialTimeOffsetSeconds: 120,
    prepopulateCache: true,
    recommendedRevalidationOutcome: '200',
    learningTopicIds: ['last-modified', 'cache-revalidation', 'etag'],
  },
  {
    id: 'no-store-policy',
    title: '6. No-Store Policy',
    concept: 'Prohibiting cache storage entirely for sensitive payloads',
    description:
      'Configures Cache-Control: no-store. Even on a 200 OK GET response, the simulator blocks storage in both private and shared caches.',
    environment: 'private',
    request: {
      method: 'GET',
      url: 'https://api.example.com/account/tokens',
      headers: { Accept: 'application/json' },
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: {
        'Cache-Control': 'no-store',
        Date: toHttpDate(DEFAULT_SIMULATED_TIME_MS),
      },
      body: JSON.stringify({ sessionToken: 'redacted-ephemeral-secret' }, null, 2),
    },
    initialTimeOffsetSeconds: 0,
    prepopulateCache: false,
    learningTopicIds: ['no-store-vs-no-cache', 'cache-control'],
  },
  {
    id: 'no-cache-policy',
    title: '7. No-Cache Policy',
    concept: 'Stored in cache, but every reuse requires origin validation',
    description:
      'Pre-populates an entry with Cache-Control: no-cache and ETag. Unlike no-store, the response IS stored—but any subsequent lookup immediately triggers REVALIDATION_REQUIRED.',
    environment: 'private',
    request: { ...DEFAULT_DEMO_REQUEST, headers: { ...DEFAULT_DEMO_REQUEST.headers } },
    response: {
      status: 200,
      statusText: 'OK',
      headers: {
        'Cache-Control': 'no-cache',
        ETag: '"config-rev-9"',
        Date: toHttpDate(DEFAULT_SIMULATED_TIME_MS),
      },
      body: JSON.stringify({ featureFlags: { darkMode: true, betaRouting: false } }, null, 2),
    },
    initialTimeOffsetSeconds: 5,
    prepopulateCache: true,
    recommendedRevalidationOutcome: '304',
    learningTopicIds: ['no-store-vs-no-cache', 'cache-revalidation', 'etag'],
  },
  {
    id: 'vary-header',
    title: '8. Vary Header Variants',
    concept: 'Partitioning cache keys by Accept-Language header values',
    description:
      'Pre-populates an English (en-US) cached variant with Vary: Accept-Language, then configures the outgoing request with Accept-Language: fr-FR—resulting in a cache miss for the French variant while keeping en-US intact.',
    environment: 'shared',
    request: {
      method: 'GET',
      url: 'https://api.example.com/products',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'fr-FR',
      },
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: {
        'Cache-Control': 'public, max-age=300',
        ETag: '"products-fr-v1"',
        Vary: 'Accept-Language',
        Date: toHttpDate(DEFAULT_SIMULATED_TIME_MS),
      },
      body: JSON.stringify({ locale: 'fr-FR', products: [{ id: 'sku-101', name: 'Routeur X2' }] }, null, 2),
    },
    initialTimeOffsetSeconds: 10,
    prepopulateCache: true,
    learningTopicIds: ['vary-header', 'browser-vs-shared-cache'],
  },
  {
    id: 'shared-cache-restriction',
    title: '9. Shared Cache Restriction',
    concept: 'Comparing Cache-Control: private inside a Shared CDN/Proxy cache',
    description:
      'Sets the environment to Shared Cache and returns Cache-Control: private, max-age=600. Shared caches are forbidden from storing private responses, blocking storage even though private browser caches would store it.',
    environment: 'shared',
    request: {
      method: 'GET',
      url: 'https://api.example.com/me/profile',
      headers: { Accept: 'application/json' },
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: {
        'Cache-Control': 'private, max-age=600',
        ETag: '"user-42"',
        Date: toHttpDate(DEFAULT_SIMULATED_TIME_MS),
      },
      body: JSON.stringify({ userId: 42, tier: 'enterprise' }, null, 2),
    },
    initialTimeOffsetSeconds: 0,
    prepopulateCache: false,
    learningTopicIds: ['browser-vs-shared-cache', 's-maxage', 'cache-control'],
  },
];
