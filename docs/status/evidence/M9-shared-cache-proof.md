# M9 shared public-cache proof

Date: **2026-09-06**  
Runtime: **Next.js 16.3.0 production standalone server, Node.js runtime**  
Route: **`/en/blog`**

## Purpose

Close the shared-caching finding carried from M4: public reads named tags, but no reusable Next cache entry existed and a repeat blog render reached the API five times.

## Setup

- Built the web application with `cacheComponents: true`, database mode, and the running local API.
- Started the generated standalone production server on port 3001.
- Inserted a request-counting HTTP proxy between the web server and API. The proxy forwarded bytes unchanged and printed one line per upstream request.
- Used the signed invalidation endpoint with an isolated local proof secret; no production credential was used or recorded.

## Result

| Step                                                     | HTTP result             | Upstream observation                                                                                                                                                              |
| -------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First `/en/blog` request after a clean web-process start | `200`                   | The availability gate fetched appearance, site, and article list; the page render populated five tagged shared entries: appearance, site, article list, taxonomy, and feed index. |
| Immediate repeat of `/en/blog`                           | `200`                   | **0 upstream API requests.**                                                                                                                                                      |
| Signed invalidation for `public:articles:en`             | `200`, one tag accepted | The invalidation route expired the collective article tag.                                                                                                                        |
| First `/en/blog` request after invalidation              | `200`                   | Exactly **3** upstream requests: article list, taxonomy, and feed index. Appearance and site remained cached.                                                                     |

The post-invalidation response remained complete (`46,382` bytes in this fixture) and returned in `0.083 s` locally. The optimized production build also completed with Cache Components enabled and emitted the locale content routes as partial prerenders around the request-bound shell.

## Boundary proved

- Repeated renders reuse published DTOs instead of sending full read traffic to the API.
- The existing contract tag `public:articles:en` reaches all unbounded article-derived cache keys.
- `revalidateTag(tag, { expire: 0 })` has an observable target and does not flush unrelated site or appearance data.
- ADR-009 still holds: visitor headers/cookies are outside the shared DTO cache.
- ADR-014 still bounds outage fallback using the actual upstream validation time; retryable failures are not cached as successful results.

This is local release evidence, not a production capacity benchmark or proof of cross-instance cache sharing. A production topology with more than one web replica must provide and test a remote Cache Components handler.
