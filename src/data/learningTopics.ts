import { LearningTopic } from '../types/cache';

export const LEARNING_TOPICS: LearningTopic[] = [
  {
    id: 'what-is-http-caching',
    title: 'What is HTTP caching?',
    category: 'Fundamentals',
    summary: 'Storing reusable HTTP responses closer to the client to avoid redundant origin work.',
    explanation:
      'HTTP caching lets clients, proxies, and CDNs store a copy of a server response and reuse it for matching subsequent requests. When configured accurately, caching cuts latency, reduces origin compute load, and saves bandwidth while keeping data consistent.',
    exampleHeader: 'Cache-Control: public, max-age=3600',
    useCase: 'Static assets, public product catalogs, and read-heavy API responses.',
    scenarioId: 'first-request',
  },
  {
    id: 'browser-vs-shared-cache',
    title: 'Browser cache vs shared cache',
    category: 'Fundamentals',
    summary: 'Private caches serve one user; shared caches (CDNs/proxies) serve many users.',
    explanation:
      'A private cache (like a web browser) is dedicated to a single user and may store responses marked `private`. A shared cache (such as a CDN edge node or reverse proxy) serves multiple clients and must never store `private` responses.',
    exampleHeader: 'Cache-Control: private, max-age=600',
    useCase: 'Personalized user dashboards (`private`) vs public marketing pages (`public`).',
    scenarioId: 'shared-cache-restriction',
  },
  {
    id: 'cache-control',
    title: 'Cache-Control',
    category: 'Directives',
    summary: 'The primary HTTP header for specifying caching rules in requests and responses.',
    explanation:
      'Cache-Control carries comma-separated directives that control whether a response may be stored, where it may be stored (`public` or `private`), how long it stays fresh (`max-age`, `s-maxage`), and how revalidation behaves (`no-cache`, `must-revalidate`).',
    exampleHeader: 'Cache-Control: public, max-age=60, must-revalidate',
    useCase: 'Defining explicit, predictable caching semantics across browsers and CDNs.',
    scenarioId: 'first-request',
  },
  {
    id: 'max-age',
    title: 'max-age',
    category: 'Directives',
    summary: 'Defines how many seconds a stored response remains fresh after generation.',
    explanation:
      '`max-age=N` sets the freshness lifetime to N seconds relative to the response `Date` (accounting for any `Age` accumulated upstream). While `currentAge < max-age`, caches can serve the entry immediately without contacting the origin.',
    exampleHeader: 'Cache-Control: public, max-age=300',
    useCase: 'Caching API responses for 5 minutes to smooth traffic spikes.',
    scenarioId: 'fresh-cache-hit',
  },
  {
    id: 's-maxage',
    title: 's-maxage',
    category: 'Directives',
    summary: 'Overrides max-age specifically for shared caches such as CDNs and proxies.',
    explanation:
      'When both `s-maxage` and `max-age` appear, shared caches follow `s-maxage` while private browser caches ignore it and continue using `max-age`. This lets teams keep shorter browser TTLs while caching longer at the CDN edge.',
    exampleHeader: 'Cache-Control: public, max-age=60, s-maxage=3600',
    useCase: 'Purgeable CDN edge caching with short browser retention.',
    scenarioId: 'shared-cache-restriction',
  },
  {
    id: 'no-store-vs-no-cache',
    title: 'no-store vs no-cache',
    category: 'Directives',
    summary: 'no-store forbids saving anything; no-cache saves the entry but requires validation.',
    explanation:
      'Developers frequently confuse these two directives. `no-store` prevents any cache from writing the response to disk or memory. `no-cache` allows storing the response, but forbids reusing it without first validating freshness with the origin server.',
    exampleHeader: 'Cache-Control: no-cache',
    useCase: '`no-store` for banking tokens; `no-cache` for mutable JSON configs backed by ETag.',
    scenarioId: 'no-cache-policy',
  },
  {
    id: 'etag',
    title: 'ETag',
    category: 'Validators',
    summary: 'An opaque version identifier attached to a specific resource representation.',
    explanation:
      'An ETag (Entity Tag) fingerprints a representation (for example `"products-v1"` or a content hash). When the cached entry becomes stale, the cache sends `If-None-Match: "products-v1"` so the origin can quickly confirm whether the content changed.',
    exampleHeader: 'ETag: "products-v1"',
    useCase: 'Byte-accurate conditional validation without relying on 1-second clock granularity.',
    scenarioId: 'etag-revalidation',
  },
  {
    id: 'last-modified',
    title: 'Last-Modified',
    category: 'Validators',
    summary: 'A timestamp validator indicating when the origin representation last changed.',
    explanation:
      'Servers emit `Last-Modified` with an HTTP date. On revalidation, caches send `If-Modified-Since` with that timestamp. If the resource has not changed since that time, the origin responds with `304 Not Modified`.',
    exampleHeader: 'Last-Modified: Tue, 17 Nov 2026 09:00:00 GMT',
    useCase: 'Static files, CMS articles, and resources with natural modification timestamps.',
    scenarioId: 'modified-resource',
  },
  {
    id: 'not-modified-304',
    title: '304 Not Modified',
    category: 'Mechanics',
    summary: 'Lightweight validation response confirming the cached body is still valid.',
    explanation:
      'When an origin receives `If-None-Match` or `If-Modified-Since` and sees the resource is unchanged, it returns `304 Not Modified` with updated headers (`Date`, `Cache-Control`, `Expires`) and no body. The cache merges those headers and reuses its stored body.',
    exampleHeader: 'HTTP/1.1 304 Not Modified',
    useCase: 'Saving bandwidth on large payloads while enforcing strict freshness checks.',
    scenarioId: 'etag-revalidation',
  },
  {
    id: 'expires-header',
    title: 'Expires',
    category: 'Headers',
    summary: 'Legacy HTTP/1.0 absolute expiration timestamp superseded by max-age.',
    explanation:
      '`Expires` gives an absolute GMT/UTC date after which the response is stale. Modern caches compute freshness lifetime as `Expires - Date` only when neither `s-maxage` nor `max-age` is present.',
    exampleHeader: 'Expires: Tue, 17 Nov 2026 11:00:00 GMT',
    useCase: 'Compatibility with legacy HTTP/1.0 intermediaries when max-age is absent.',
    scenarioId: 'stale-cache',
  },
  {
    id: 'age-header',
    title: 'Age',
    category: 'Headers',
    summary: 'Reports how many seconds a response has already lived in upstream caches.',
    explanation:
      'Shared caches emit `Age: N` when serving a stored response so downstream caches know how much of the freshness lifetime has already elapsed. Downstream caches add resident time on top of initial `Age`.',
    exampleHeader: 'Age: 25',
    useCase: 'Multi-tier caching (Origin -> CDN -> Browser) so total lifetime is not double-counted.',
    scenarioId: 'fresh-cache-hit',
  },
  {
    id: 'vary-header',
    title: 'Vary',
    category: 'Headers',
    summary: 'Tells caches which request headers change the response representation.',
    explanation:
      'If an endpoint returns different payloads based on `Accept-Language` or `Accept`, `Vary: Accept-Language` instructs the cache to include that request header in its cache key. `Vary: *` disables normal cache reuse.',
    exampleHeader: 'Vary: Accept, Accept-Language',
    useCase: 'Localized APIs, content negotiation (JSON vs XML), and compressed encodings.',
    scenarioId: 'vary-header',
  },
  {
    id: 'fresh-vs-stale',
    title: 'Fresh vs stale responses',
    category: 'Mechanics',
    summary: 'Fresh responses serve immediately; stale responses require revalidation or refetch.',
    explanation:
      'A response is fresh when `currentAge < freshnessLifetime`. Once `currentAge >= freshnessLifetime`, it becomes stale. Stale entries are not deleted—if they carry validators, caches can revalidate them cheaply via 304.',
    exampleHeader: 'Cache-Control: public, max-age=60',
    useCase: 'Understanding TTL expiration behavior over simulated time.',
    scenarioId: 'stale-cache',
  },
  {
    id: 'cache-revalidation',
    title: 'Cache revalidation',
    category: 'Mechanics',
    summary: 'Confirming with the origin whether a stale entry can still be served.',
    explanation:
      'During revalidation, the cache sends validators (`If-None-Match`, `If-Modified-Since`) to the origin. The origin returns either `304 Not Modified` (reuse body, refresh TTL) or `200 OK` (replace stored body and headers).',
    exampleHeader: 'If-None-Match: "products-v1"',
    useCase: 'Balancing fast cache hits with strong data consistency.',
    scenarioId: 'etag-revalidation',
  },
];
