# Frontend UX: responsive, cross-browser, accessibility and performance

## Responsive

Viewports: **375×812** (phone), **768×1024** (tablet), **1440×900** (desktop). Add **360×640** if the audience uses low-end Android phones.

- No horizontal scroll and no clipped or overlapping text.
- Navigation works at every size (the hamburger menu opens, closes and traps focus).
- Fixed headers and footers don't cover inputs. The on-screen keyboard doesn't hide the field being typed in or the submit button.
- Tap targets are at least 44×44px, and nothing relies on hover alone.
- Modals and drawers scroll properly on short screens.
- Images are sized for the viewport, with no 4000px hero images on mobile.

## Cross-browser

- Run every P0 journey on Chromium, Firefox and WebKit. **WebKit on mobile is required**, because it stands in for iOS Safari.
- Look for problems with date and time inputs, `position: sticky`, flex and grid gaps, `100vh` on mobile, autoplay rules, clipboard APIs, and third-party cookies (auth embedded in iframes).
- Record the result for each browser. A failure in one browser only is still a finding, with the environment noted.

## Accessibility (basics; deep audits → a dedicated a11y skill)

- **Keyboard only:** every P0 journey can be completed with Tab, Shift+Tab, Enter, Space, Esc and the arrow keys. There are no keyboard traps. Focus is always visible.
- **Focus management:** opening a modal moves focus into it; closing the modal returns focus. After a route change, focus goes somewhere sensible.
- **Names and labels:** every input has a label, and icon buttons have accessible names. Errors are linked to their fields (`aria-describedby`) and announced.
- **Colour:** contrast is at least 4.5:1 for text, and information is not shown by colour alone.
- **Automated:** inject axe-core on each page. Serious and critical violations become candidates. Moderate ones go to suggestions unless they block a P0 journey.

## Performance (lab)

- Measure LCP, INP and CLS on P0 pages, first with a cold cache and then warm. Throttle to slow 4G with a 4× CPU slowdown on mobile.
- Thresholds (good / needs improvement / poor): LCP ≤2.5s / ≤4s / >4s; INP ≤200ms / ≤500ms / >500ms; CLS ≤0.1 / ≤0.25 / >0.25.
- Always label these as **lab** measurements. Field data (CrUX or real users) can differ.
- Network: total transfer weight, the biggest assets, render-blocking resources, and duplicate or waterfall API calls.
- A "poor" rating on a P0 page is S2 if it makes the journey hard to finish on the target audience's devices. Otherwise it is S3.

## Visual and content

- No raw translation keys, `undefined`, `NaN`, `[object Object]` or `null` on screen.
- Broken images and missing favicons or meta images.
- Text wraps and truncates sensibly with very long user content.
- Dark mode, if it exists: nothing is invisible or unreadable.
