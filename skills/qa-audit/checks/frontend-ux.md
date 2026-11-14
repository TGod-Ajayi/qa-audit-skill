# Frontend UX checks: responsive, cross-browser, accessibility and performance

#### When to use this file

Use this file for `page` and `journey` units, and for cross-cutting units about devices, browsers, accessibility or speed. It covers the `responsive`, `a11y`, `performance` and `hygiene` classes, plus a basic visual and content pass.

Use `design-and-ux.md` for the `design` class (does the build match a cited Figma frame, token or style guide) and the `ux` class (is the app consistent with its own conventions, and do affordances, feedback and confirmations work). This file asks whether the page works on every device and for every user; that one asks whether it looks and behaves as designed and consistently. Use `time-and-locale.md` for RTL layout and translated text overflow, `navigation-and-search.md` for routing, and `files-and-media.md` for image processing. For deep accessibility or performance audits, use a dedicated skill (`accessibility-audit`, `performance-audit`).

## Core discipline (include in every tester prompt for this domain)

```
- Record the browser engine and version, viewport, device emulation and throttling for every check. A result without its environment can't be reproduced.
- A failure in one browser or one viewport is still a finding. Note the environment; don't discard it.
- Cite the rule: WCAG 2.2 success criterion, Google's Core Web Vitals thresholds, the target devices in architecture.md, or the spec. "Looks a bit cramped" is a suggestion.
- Label every performance number as a lab measurement. Field data (CrUX, real users) can differ, and lab numbers move between runs: take the median of 3.
- Check P0 journeys end to end at each size and in each engine. A page that renders but can't be completed is the real bug.
```

## Responsive (check classes: `responsive`)

Viewports: **375×812** (phone), **768×1024** (tablet), **1440×900** (desktop). Add **360×640** if the audience uses low-end Android phones.

**No horizontal scroll or clipping**
At each viewport, the page has no horizontal scroll and no clipped or overlapping text. A bug is content the user needs that is cut off or unreachable. A decorative element bleeding off-screen by design is not a bug.

**Navigation at every size**
The hamburger menu opens, closes and traps focus while open. Every link in the desktop nav is reachable on mobile.

**Keyboard and fixed bars**
Fixed headers and footers don't cover inputs. The on-screen keyboard doesn't hide the field being typed in or the submit button. Use WebKit mobile emulation; real-device checks are best where available.

**Tap targets and hover**
Tap targets are at least 44×44px (or 24×24 with spacing, per WCAG 2.5.8), and nothing relies on hover alone. A menu that opens only on hover is a bug on touch devices.

**Modals and images**
Modals and drawers scroll on short screens. Images are sized for the viewport, with no 4000px hero images on mobile.

## Cross-browser (check classes: `responsive`, `happy-path`)

**P0 journeys in three engines**
Run every P0 journey on Chromium, Firefox and WebKit. **WebKit on mobile is required**, because it stands in for iOS Safari.

**Known trouble spots**
Look for problems with date and time inputs, `position: sticky`, flex and grid gaps, `100vh` on mobile, autoplay rules, clipboard APIs, and third-party cookies (auth embedded in iframes). Record the result for each browser. A browser outside the documented support list is a note, not a finding.

## Accessibility basics (check classes: `a11y`)

**Keyboard only**
Every P0 journey can be completed with Tab, Shift+Tab, Enter, Space, Esc and the arrow keys. There are no keyboard traps. Focus is always visible. A P0 journey that can't be finished by keyboard is S2.

**Focus management**
Opening a modal moves focus into it; closing it returns focus to the trigger. After a route change, focus goes somewhere sensible (the main heading or content).

**Names and labels**
Every input has a label, and icon buttons have accessible names. Errors are linked to their fields (`aria-describedby`) and announced. Placeholder text is not a label.

**Colour**
Contrast is at least 4.5:1 for text (3:1 for large text and UI parts), and information is not shown by colour alone.

**Automated scan**
Inject axe-core on each page. Serious and critical violations become candidates. Moderate ones go to suggestions unless they block a P0 journey. Check each axe hit by hand before reporting; axe has false positives on custom widgets.

## Performance in the lab (check classes: `performance`)

**Core Web Vitals**
Measure LCP, INP and CLS on P0 pages, cold cache then warm. Throttle to slow 4G with a 4× CPU slowdown on mobile. Thresholds (good / needs improvement / poor): LCP ≤2.5s / ≤4s / >4s; INP ≤200ms / ≤500ms / >500ms; CLS ≤0.1 / ≤0.25 / >0.25.

**Severity**
A "poor" rating on a P0 page is S2 if it makes the journey hard to finish on the target audience's devices. Otherwise it is S3. "Needs improvement" is a suggestion unless a documented budget says otherwise.

**Network weight**
Check total transfer weight, the biggest assets, render-blocking resources, and duplicate or waterfall API calls. Duplicate calls also belong to `api-and-integrations.md`; report once.

## Visual, content and hygiene (check classes: `hygiene`)

**Broken values on screen**
No raw translation keys, `undefined`, `NaN`, `[object Object]` or `null` on screen. Any of these on a P0 page is a candidate.

**Images and meta**
No broken images, missing favicons or missing social meta images where the spec asks for them.

**Long content**
Text wraps and truncates sensibly with very long user content (a 60-character name, a 2000-character comment).

**Dark mode**
If dark mode exists, nothing is invisible or unreadable in it.

**Console and network**
No console errors or unhandled promise rejections, and no failed 4xx/5xx requests during normal use.

## Universal moves

- Run one Playwright project per engine and viewport, so a single script covers the matrix.
- Capture a screenshot and the console log at every step of a P0 journey, at every size.
- For performance, run 3 times and report the median, with the throttling settings.

## Validation rules (apply before reporting ANY candidate here)

1. State the engine, version, viewport and throttling. Show the bug persists in a clean context with no extensions.
2. For layout bugs, include a screenshot at the failing viewport and one at a passing one.
3. For a11y, cite the WCAG success criterion and give the element (selector or accessible name). Confirm axe results by hand.
4. For performance, give the median of 3 runs and label it lab data.
5. Use `confirmed` after 3/3 reproductions in the stated environment. Use `needs_validation` when only a real device or an unavailable browser can settle it (real iOS Safari, a screen reader you can't run), and name it.
