# Design and UX checks

#### When to use this file

Use this file for `page` and `journey` units when a design source exists or when the app has enough screens to have its own conventions. It covers two classes. `design` asks whether the build matches a cited design: a Figma frame, the design system or tokens, or a style guide. `ux` asks whether the app is consistent with itself and whether its controls behave as they look.

Use `frontend-ux.md` for whether pages work at every size, in every engine, with a keyboard and fast enough (`responsive`, `a11y`, `performance`). Use `time-and-locale.md` for translated text and RTL, and `forms-and-data.md` for validation rules behind error messages. If the companion skills are installed, use `figma-compare` for design diffs and `visual-regression` for changes between builds.

## Core discipline (include in every tester prompt for this domain)

```
- Every candidate needs a cited source. For design: the Figma frame link or node ID, the token name, or the style-guide rule. For ux: the conflicting screen or component in this app, a design-system rule, a platform convention (WCAG, Apple HIG, Material), or the user's statement.
- Pure taste with none of those sources is a suggestion, not a finding. Write it to suggestions with the unit.
- Compare like with like: same viewport, same theme, same state, same content. Capture the design and the build side by side.
- Differences under about 2px, anti-aliasing and font rendering differences between OSes are not bugs. Neither is anything the design leaves unspecified.
- Check every state of a component, not just its resting state. Missing states are the most common real design bug.
```

## Design conformance (check classes: `design`)

**Spacing and layout**
Measure padding, margins and gaps against the frame or the spacing tokens. A bug is a gap that uses the wrong token (16px where the design says 24px) or a misaligned grid. Sub-2px noise is not a bug.

**Typography**
Font family, size, weight and line height match the type scale. A heading using body weight, or a fallback font loading instead of the brand font, is a candidate.

**Colour tokens**
Read computed colours and compare them with the token values. A hard-coded hex that is close to but not the token is a candidate when it is visibly different or breaks dark mode.

**Component variants**
Each button, input, card and badge uses the variant the design shows (primary, secondary, ghost; small, medium, large). A wrong variant is a candidate.

**Icons**
Icons match the design's set, size and stroke. A different icon for the same meaning is a candidate.

**Component states**
Check hover, focus, active, disabled, loading, error and empty for each interactive component on the page. A state the design defines but the build lacks (no loading state on the Pay button) is a candidate. A state the design never drew is a suggestion.

**Breakpoints**
Compare each breakpoint the design provides. Layouts between breakpoints that the design doesn't show are not graded against it.

**Dark mode**
If the design has a dark theme, compare it too. Elements that ignore the theme are candidates.

**Copy and elements**
Text matches the design copy, and nothing is missing or extra. Copy updated after the design by a newer ticket wins; cite the ticket.

## Internal consistency (check classes: `ux`)

**Same action, same label**
The same action uses the same label everywhere ("Delete" versus "Remove" for the same thing). Cite both screens.

**Same component, same style**
One component looks and behaves the same across pages. A date picker that differs between two forms is a candidate.

**Terminology**
One concept, one word ("customer" versus "client" for the same entity). Cite the screens and, if one exists, the glossary.

**Primary and destructive buttons**
Primary and destructive actions are visually distinct and in a consistent position. A red primary "Save" next to a grey "Delete", or the two swapped between dialogs, is a candidate.

## Affordances and feedback (check classes: `ux`, `a11y`)

**Looks clickable, is clickable**
Underlined text, cards with hover effects and chevrons should act. Things that act should look like they do. Cite the app's own pattern or the platform convention.

**Feedback after action**
Every action gives feedback: a toast, an inline change or a navigation. A save with no visible result is a candidate (Nielsen: visibility of system status).

**Destructive confirmation**
Destructive or irreversible actions ask for confirmation or offer undo, consistent with the rest of the app. A delete with neither, where other deletes confirm, is a candidate.

**Default focus and modals**
Dialogs put focus on a sensible element, not the destructive button. Modals can be closed with Esc and a visible close control. A modal you can't leave is S2 on a P0 journey.

**Icon and label match**
The icon matches its label and action (a trash icon on "Archive" is a candidate).

## Messages, empty states and layout (check classes: `ux`, `errors`)

**Recoverable errors**
Error messages say what happened and how to recover. "Error 500" or "Invalid input" with no next step is a candidate when a cited convention or the app's own better messages exist.

**Empty states**
Empty lists explain why and what to do next. A blank area is a candidate if other lists in the app have empty states.

**Layout shift**
Content doesn't jump when data or images load. Measured shift also counts toward CLS in `frontend-ux.md`; report once.

**Truncation**
Truncation never hides meaning: two items that look identical because their differing ends are cut off is a candidate. A tooltip or wrap fixes it.

## Universal moves

- Pull the frame with the Figma MCP, take a browser screenshot at the same size and state, and compare them side by side. Read computed styles for exact values.
- Build an inventory of buttons, labels and components across screens. Inconsistencies show up in the table, not page by page.
- Walk each journey once against Nielsen's ten heuristics as a lens, then keep only items with a citable source.

## Validation rules (apply before reporting ANY candidate here)

1. Cite the source: Figma node, token, style-guide rule, the conflicting screen in this app, a platform guideline, or the user's statement.
2. Attach the design and the build at the same viewport, theme and state, with measured values for spacing, size or colour.
3. For consistency bugs, name both screens and say which one follows the dominant pattern.
4. Severity reflects user impact: a swapped destructive button can be S2; a wrong shade is usually S4.
5. Use `confirmed` after 3/3 reproductions. Use `needs_validation` when the design file is unreachable or two design sources disagree, and name who decides. With no source at all, it is a suggestion.
