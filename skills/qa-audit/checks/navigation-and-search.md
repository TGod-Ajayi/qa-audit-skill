# Navigation and search checks

#### When to use this file

Use this file for `journey` and `page` units with routing, and for any list, catalogue, search box, filter panel, sort control or paginated table. It covers the `navigation` class and the UI side of search and listing. It applies to single-page apps, server-rendered sites and mobile web.

Use `auth-and-accounts.md` for what login itself must do, `async-and-realtime.md` for out-of-order search responses and fast filter changes, `api-and-integrations.md` for pagination and filter parameters at the API level, and `time-and-locale.md` for locale-specific URLs and sorting by date.

## Core discipline (include in every tester prompt for this domain)

```
- Record the full URL (path, query and hash) before and after every step. The URL is part of the state under test.
- Test every route by opening it directly in a fresh context, not only by clicking through. Deep links break where in-app navigation works.
- For search, define the expected results from seeded data before searching. "These results feel wrong" is not a candidate without a known correct answer.
- Relevance is a product choice. A ranking is a bug only when it breaks a documented rule or puts an exact match below unrelated items.
- Use seeded test data with known counts, so totals, pages and empty states can be checked exactly.
```

## Routing and deep links (check classes: `navigation`, `happy-path`)

**Direct open**
Open every route, including detail pages and wizard steps, directly in a fresh tab. A blank page, an endless spinner or a client-side crash is a candidate. A redirect to a sensible earlier step of a wizard is correct if the spec allows it.

**Refresh every step**
Refresh on each step of a multi-step flow. Data is kept or the user is told it was lost.

**Back and forward**
Use Back and Forward in the middle of a flow. A bug is a step that resubmits, a page showing stale data, or Back leaving the app when an in-app modal or tab was open. Back closing a modal is a common convention; whether it should is a design choice.

**Unsaved changes**
Leave a page with unsaved changes by link, Back and closing the tab. The behaviour must match the design: a warning, an autosave, or a documented loss.

**Push notification and email deep links**
Links from emails and push notifications open the right screen with the right record, also when logged out (then after login).

## 404s and redirects (check classes: `navigation`, `errors`, `auth`)

**Unknown routes and IDs**
Unknown paths, unknown record IDs and garbage IDs (`/orders/abc`, `/orders/999999`) give a proper 404 page with a way back. A 500, a crash or a blank screen is a candidate. A 404 for a record that exists but belongs to another user is correct behaviour.

**Real HTTP status**
Server-rendered 404 pages return HTTP 404, not 200. A soft 404 is a candidate when SEO or the spec matters.

**Redirect after login**
Open a protected URL while logged out. It must redirect to login, then **return to the original page** with its query string intact. A redirect that accepts any external URL as a return target is a `security_referral`; do not probe it further.

**Redirect chains and loops**
Old URLs and trailing-slash variants redirect once to the right place. A loop or a chain of more than 2 hops is a candidate.

## Search (check classes: `navigation`, `input`, `state`)

**Known-answer queries**
Search for an exact name, a partial word, a misspelling, a term with accents (`Adébáyọ̀` and `Adebayo`) and a term with different case. Compare with the expected results from the seed. A missing exact match is a candidate.

**Staleness**
Create, edit and delete a record, then search for it. A deleted record that still shows, or an edit not reflected, is a candidate. A documented indexing delay is not a bug; record the delay measured.

**Empty and odd queries**
Try an empty query, only spaces, a very long query, and special characters (`%`, `&`, `"`, `\`). A 500 or a crash is a candidate. Odd results for odd input are not.

**No-results state**
A query with no matches shows a clear empty state, not an error or the full list.

## Filters, sorting and pagination (check classes: `navigation`, `state`, `errors`)

**Filters**
Each filter narrows results correctly against the seed. Combined filters apply together. The result count matches the items shown. Clearing filters restores the full list.

**Sorting**
Each sort option orders correctly, including ties, nulls, accented names and numbers stored as text ("10" before "9" is a candidate).

**Pagination**
Check the first page, the last page, and a page number past the end typed into the URL. No item appears on two pages or is skipped. Changing a filter resets to page 1 or keeps a valid page as specified.

**Infinite scroll**
Scroll to the end. Loading stops, there are no duplicates, and Back returns to the same scroll position if the spec says so.

## URL state (check classes: `navigation`, `state`)

**Shareable URLs**
Search terms, filters, sort and page are in the URL if the spec says lists are shareable. Copy the URL to a fresh context and check it shows the same list.

**URL and UI agree**
After Back, the visible filters match the URL. A list filtered by the old URL while the controls show the new filter is a candidate.

## Universal moves

- Crawl the route list from the router config or sitemap and open each route directly in a fresh context.
- Seed a search fixture with known names, accents, duplicates and near-duplicates, and keep its expected answers in the run folder.
- Record a HAR while using Back and Forward to see which requests repeat.

## Validation rules (apply before reporting ANY candidate here)

1. Give the exact URL, and whether the page was opened directly or reached by in-app navigation.
2. For search and filter bugs, give the seeded data and the expected results, next to what was shown.
3. For staleness, give the time between the change and the search, and any documented indexing delay.
4. For redirects, list every hop with its status code.
5. Use `confirmed` after 3/3 reproductions from a fresh context. Use `needs_validation` when the expected ranking or indexing delay is undocumented, and name who owns search behaviour.
