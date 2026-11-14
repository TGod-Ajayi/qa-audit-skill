# Time and locale checks

#### When to use this file

Use this file for any unit that stores, shows or computes dates and times, or that serves more than one language, region or currency: bookings and schedules, reports and dashboards with date ranges, billing cycles, cron jobs, countdowns, and any translated or right-to-left UI. It covers the `time-locale` class.

Use `payments-and-money.md` for whether the charged amount is right (this file covers how money is displayed), `forms-and-data.md` for date and number field validation, `api-and-integrations.md` for background jobs in general, and `frontend-ux.md` for general layout at each viewport. Translation quality (is it idiomatic) is out of scope; this file checks mechanical correctness.

## Core discipline (include in every tester prompt for this domain)

```
- Write down three timezones for every check: the browser, the server, and the stored value (UTC or local). Most bugs are a conversion done twice or not at all.
- Set the browser timezone and locale explicitly (Playwright timezoneId and locale). Never rely on the machine's settings.
- Use fixed test times near boundaries (23:30 and 00:30 local, the last day of the month, Feb 29) by setting the browser clock or seeding data. Don't change clocks on shared servers.
- The expected format comes from the spec, the locale's CLDR convention, or the app's own format used elsewhere. A format you would prefer is a suggestion.
- Compare the same instant across every place it appears: list, detail, email, export and API.
```

## Timezones (check classes: `time-locale`, `state`)

**User versus server**
Run the app with the browser in Africa/Lagos (UTC+1, no DST), UTC, and one zone far away (America/Los_Angeles or Asia/Tokyo). Create a record at a known time and read it back everywhere. A bug is the same event shown at different times on different screens, or shifted by the offset after a save and reload.

**Stored values**
Read the stored value through the API. A timestamp with no zone, or local time saved as UTC, is a lead. It is a bug only when it produces a wrong displayed or computed value.

**Date-only fields**
A birthday or due date entered as 14 March must stay 14 March in every timezone. A date that moves to 13 March for users west of UTC is a candidate.

## Boundaries (check classes: `time-locale`, `timing`)

**Midnight**
Create events at 23:30 and 00:30 local time. Check "today" lists, daily totals, streaks and "due today" badges. A bug is an event counted on the wrong day for the user's zone. Grouping by UTC day is correct only if the spec says so.

**Month and year ends**
Check reports and filters for 31 January to 1 February, 28/29 February, and 31 December to 1 January. A monthly billing date of the 31st must land on a sensible day in shorter months, as specified.

**DST**
For audiences in zones with DST (Europe, North America), check the night clocks change. A recurring 09:00 meeting must stay at 09:00 local. A one-hour shift or a duplicated hourly job is a candidate. Nigeria has no DST, so skip this when every user is in West Africa.

**Relative times and countdowns**
"5 minutes ago", "expires in 2 days" and countdowns use the right reference time. A countdown that differs between two browsers in different zones is a candidate.

**Scheduled jobs**
Daily and monthly jobs run once per period in the documented zone. A job scheduled in UTC that sends "morning" messages at 01:00 Lagos time is a candidate if the spec says morning.

## Locale formats (check classes: `time-locale`, `input`)

**Dates**
Check `en-NG` and `en-GB` (14/03/2026), `en-US` (3/14/2026), and any other supported locale. A bug is an ambiguous date like 03/04 parsed in the wrong order, or one screen using US format in an en-GB app.

**Numbers**
`1,000.50` in en-NG and en-US; `1.000,50` in de-DE and fr-FR. A typed value must parse in the same convention it is displayed in.

**Currency display**
Naira shows as ₦1,500.00 (or NGN 1,500.00, as specified), with the symbol in the right place for the locale. Check multi-currency carts show each amount with its own symbol. A display that drops kobo when the spec shows it, or shows `$` for a naira amount, is a candidate. Amount correctness lives in `payments-and-money.md`.

**Names and phone numbers**
Names with tone marks and phone numbers in local and international form display as entered.

## Translation and RTL (check classes: `time-locale`, `responsive`)

**Text changes per locale**
Switch to each supported locale. Every visible string changes. English left in a translated page is a candidate if the string exists in the translation files.

**No raw keys**
No raw translation keys (`checkout.button.pay`) or interpolation markers (`{count}`) on screen.

**Plurals and interpolation**
Check 0, 1 and 2 items. "1 items" or a wrong plural form for the locale is a candidate.

**Overflow**
Translated text is often 30–40% longer than English. Buttons, tabs and table headers must not clip or overlap. Use German or French if supported as a stress test.

**RTL layout**
For Arabic or Hebrew, the layout mirrors: text alignment, navigation, icons that show direction, and form field order. Numbers and Latin names stay left-to-right inside RTL text. Unmirrored back arrows are a candidate.

**Locale persists**
The chosen locale survives navigation, reload and login. `hreflang` tags pair locale variants if the spec requires SEO.

## Universal moves

- Run the same Playwright script with a matrix of `timezoneId` and `locale` values, and diff the screenshots and text.
- Freeze the browser clock (`page.clock`) at boundary times instead of waiting for them.
- Keep a single reference instant per run and trace it through UI, API, email and export.

## Validation rules (apply before reporting ANY candidate here)

1. State the browser timezone, locale, server timezone and the frozen or real time used.
2. Give the stored value from the API next to each displayed value.
3. For boundary bugs, show a passing case at a normal time and the failing case at the boundary.
4. For format bugs, cite the spec or the CLDR convention for that locale, or another screen in the app that does it right.
5. Use `confirmed` after 3/3 reproductions with fixed time and zone. Use `needs_validation` when the intended zone or format is undocumented (does "daily" mean UTC or Lagos?), and name who decides.
