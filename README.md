# CacheLab — HTTP Caching Simulator & Inspector

**Day 42/365 — Developer Tool**

CacheLab is an interactive, browser-based HTTP caching laboratory built to help developers inspect, simulate, and compare how private browser caches and shared proxy/CDN caches handle HTTP requests, response directives, freshness lifetimes, `Vary` variants, and conditional validation.

> **Educational Scope:** CacheLab implements a deterministic, educational subset of HTTP caching rules (selected directives and freshness/validation mechanics from RFC 9111). It is not a full specification-compliant proxy or browser cache covering every RFC edge case (such as heuristic freshness, clock-skew compensation, or response-delay adjustment).

---

## Key Features

- **Cache Simulator**
  - Configure HTTP method (`GET`, `HEAD`, `POST`, `PUT`, `DELETE`), URL, custom request headers (`Accept`, `Accept-Language`, and arbitrary headers), and cache environment (**Private Cache** vs. **Shared Cache**), with a live raw HTTP request preview.
  - Configure origin response status codes (`200`, `203`, `204`, `301`, `404`, `500`), editable response headers (`Cache-Control`, `ETag`, `Last-Modified`, `Expires`, `Date`, `Age`, `Vary`), response body, and quick policy presets.
  - Control a **deterministic simulated clock** (`+10s`, `+1m`, `+1h`, `+1d`, `Reset`, `Clear Cache`) to observe freshness decay without waiting in real time.
  - Perform **conditional revalidation** (`If-None-Match` / `If-Modified-Since`) and simulate both `304 Not Modified` (refreshing metadata and reusing cached body) and `200 OK` (replacing the stored entry).
- **Interactive SVG Request Flow**
  - Visualizes the exact decision path taken by the engine (`CACHE_HIT`, `CACHE_MISS`, `CACHE_STALE`, `REVALIDATION_REQUIRED`, `CACHE_BYPASS`, `CACHE_STORE_BLOCKED`, `CACHE_UPDATED`) with clickable nodes explaining each stage.
- **Header Inspector**
  - Parse raw HTTP response headers or edit individual header fields to break down `Cache-Control` directives (supported vs. unknown/informational), freshness lifetime, strong/weak `ETag` and `Last-Modified` validators, `Vary` keys, and conflicting or malformed headers.
- **Scenario Lab**
  - Nine runnable presets covering First Request (Miss), Fresh Cache Hit, Stale Cache Expiration, ETag Revalidation (`304`), Modified Resource (`200`), `no-store`, `no-cache`, `Vary` variants, and Shared Cache `private` restrictions.
- **Policy Comparison**
  - Compare two caching policies side by side across customizable request intervals using real engine executions, showing storage eligibility, freshness lifetime, origin request count, cache hits, and revalidations.
- **Learning Center & Local History**
  - Fourteen structured educational topics linked directly to runnable simulator scenarios.
  - Browser `localStorage` simulation history with scenario reopening, deletion, clearing, header copying, and JSON result export.

---

## Project Structure

```text
src/
├── components/
│   ├── ComparePoliciesView.tsx
│   ├── FlowDiagram.tsx
│   ├── HeaderInspectorView.tsx
│   ├── LearningCenterView.tsx
│   ├── OverviewView.tsx
│   ├── ResultPanel.tsx
│   ├── ScenarioLabView.tsx
│   ├── Sidebar.tsx
│   └── SimulatorView.tsx
├── data/
│   ├── learningTopics.ts
│   └── scenarios.ts
├── engine/
│   └── cacheEngine.ts
├── tests/
│   └── cacheEngine.test.ts
├── types/
│   └── cache.ts
├── utilities/
│   └── httpFormatters.ts
├── App.tsx
├── index.css
└── main.tsx
```

---

## Tech Stack

- **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Lucide React** icons & custom **SVG** flow diagram
- **Vite** for bundling and development
- **Vitest** for unit testing the independent caching engine

---

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start the development server**

   ```bash
   npm run dev
   ```

3. **Run unit tests**

   ```bash
   npm test
   ```

4. **Type-check and build for production**

   ```bash
   npm run lint
   npm run build
   ```
