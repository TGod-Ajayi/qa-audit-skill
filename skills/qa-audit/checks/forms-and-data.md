# Forms and data checks

#### When to use this file

Use this file for `form` and `entity` units, and for any journey that creates, edits or deletes records: sign-up and profile forms, admin panels, wizards, settings pages, imports, and any CRUD screen. It covers the `input` and `state` classes in depth.

Use `CHECK-CLASSES.md` for the short core lists. Use `files-and-media.md` for upload fields, `time-and-locale.md` for date, number and currency formats, `async-and-realtime.md` for double submits and two users editing at once, and `auth-and-accounts.md` for who may see or change a record.

## Core discipline (include in every tester prompt for this domain)

```
- Name the field, the exact value sent (copy it, including spaces and hidden characters) and where the rule comes from: UI copy, schema, validation code, type, or spec.
- A wrong accept or a wrong reject is a candidate only when a cited rule says otherwise. A rule you would prefer is a suggestion.
- Check the stored result, not just the screen. Reload, read the detail view or call the API, and compare it byte for byte with what was entered.
- Send the same bad value straight to the API. A rule enforced only in the browser is a candidate; a server rule the UI does not mirror is a UX gap, not data corruption.
- Use test accounts and seeded data only. Delete every record you create and note any you could not delete.
```

## Field input (check classes: `input`)

For each field, try the rows that fit its type. Record any value that is accepted but shouldn't be, or rejected but shouldn't be.

| Type | Values to try |
|---|---|
| Text / name | `""`, `"   "`, `" Ada "`, `O'Brien`, `Adébáyọ̀`, `李雷`, `مريم`, `😀`, 1 char, max, max+1, 10 000 chars |
| Email | `a@b.co`, `A@B.CO` (case handling), `a+tag@b.co`, `a@b`, `a@@b.co`, a trailing space, a duplicate of an existing user's email in different case |
| Phone | local and international forms (`0803…`, `+234803…`), spaces and dashes, too short, letters |
| Number / quantity | `0`, `-1`, `1.5` where integers are expected, `1e6`, `999999999999`, an empty string, locale decimals |
| Money | `0`, `0.001`, negative, more than the balance or limit, minor-unit precision |
| Date | the past and future limits, Feb 29, the year boundary, typed versus picked, other locale formats |
| URL | without a scheme, `javascript:` (expect it rejected; flag it if accepted), very long |
| File | 0 bytes, exactly the limit, over the limit, a wrong type with the right extension, a long or unicode filename, two files with the same name (details in `files-and-media.md`) |
| Select / radio | no selection, every option, and an option value the API should reject (sent directly) |
| Rich text | pasted from Word or Google Docs, very long, embedded images |

**Server enforces client rules**
Repeat each client-side rejection as a direct API call with the same payload. A bug is the API storing a value the form refuses, such as a negative quantity or an empty required field. Not a bug: the API returning a different but valid error shape, or rejecting something the form allows when the spec backs the server (log that as a UX gap).

**Whitespace and normalisation**
Enter `" Ada "`, a whitespace-only name and an email with a trailing space. A bug is a stored value that breaks later lookups (login fails because of a saved trailing space) or a whitespace-only value passing a required rule. Trimming that the spec does not mention is not a bug if nothing downstream breaks.

**Unicode round trip**
Save names like `Adébáyọ̀`, `李雷`, `مريم` and an emoji, then read them back in the detail view, lists, exports and emails. A bug is mojibake, stripped tone marks, `?` boxes, or a length check that counts bytes instead of characters. A font that lacks a glyph on one OS is an environment note, not a data bug.

**Boundary lengths**
Try min−1, min, max and max+1 from the stated limit. A bug is the UI accepting max+1 then the server failing with a 500, silent truncation with no warning, or a max-length value that breaks the layout. A limit nobody documented is not a bug; record the observed limit in notes.

**Numbers and hidden characters**
Try `1e6`, `1.5` in integer fields, `1,000.50` and `1.000,50`, and values pasted with non-breaking spaces or zero-width characters. A bug is a value parsed into a different number than shown (1.000 stored as 1) or an invisible character making two equal values compare as different. A clear validation message that rejects the format is correct behaviour.

## Form behaviour (check classes: `input`, `errors`, `a11y`)

**Error messages**
Errors appear next to the field, say what to fix, and clear once it is fixed. A bug is an error that stays after the fix, a generic "something went wrong" for a known validation failure, or an error shown only by colour. Wording you would phrase differently is a suggestion.

**Input kept after failure**
Trigger a validation error and a failed submit (mock a 500). The form must keep what the user typed, except password fields if the spec says so. Losing a long form on error is a candidate.

**Submit guard**
The submit button is disabled or guarded while a request is in flight. Count the requests on a double-click. Duplicate records belong here and in `async-and-realtime.md`; report once.

**Keyboard, Enter and autofill**
Enter submits where expected. Browser autofill and password managers fill the right fields, and the form accepts filled values without the user typing. A field that rejects autofilled input until edited by hand is a candidate.

**Multi-step forms**
Data survives moving between steps, Back and a refresh, or the form warns clearly that it will be lost. A bug is silent loss, or a later step saving stale values from an earlier step after the user went back and changed them.

## Data lifecycle (check classes: `state`)

**Create**
The record appears in every list, search result, count and dashboard that should show it. A count that lags because of a documented cache delay is not a bug; record the delay.

**Read**
The detail view matches what was entered, including whitespace, unicode and decimal precision.

**Update**
Partial updates don't wipe fields that weren't changed. `updated_at` and history entries are correct. A PATCH that nulls untouched fields is S1 or S2 depending on the data lost.

**Delete**
The record disappears everywhere, including caches and search. Related records follow the intended rule (cascade, nullify or block). Soft-deleted records stay hidden. Undo, if offered, restores the record and its relations.

**Uniqueness**
Create a duplicate through the UI and the API at the same moment. Two rows where the spec says one is a candidate. A friendly "already exists" error is the correct outcome.

**Ownership**
A record created by user A is never shown to user B. If it is, set `security_referral: true` and stop. Do not enumerate IDs to find more.

**Import and export**
Round-trip a CSV with unicode, commas, quotes and line breaks inside fields. A bug is a shifted column, lost characters, or a re-import that creates duplicates. Formula-looking cells are covered in `files-and-media.md` as a referral.

## Universal moves

- Keep a value sheet per run: each odd value, where it was entered, and where it was read back. Check every read-back location, not only the first.
- Pair each UI attempt with the same request sent by API. The difference between them is often the finding.
- After any write, reload in a fresh browser context before judging. The in-memory UI often hides what was really stored.

## Validation rules (apply before reporting ANY candidate here)

1. Quote the exact input, including invisible characters (give the code points), and the cited rule that it breaks.
2. Show the stored value from a fresh read (reload, API or export), not only what the form displayed.
3. For a client/server mismatch, include both the UI attempt and the direct API request with its response.
4. For lifecycle bugs, list every place you checked and which ones were wrong after create, update or delete.
5. Use `confirmed` only after 3/3 reproductions from fresh test data. Use `needs_validation` when the rule has no source you can reach (a missing spec, an unknown business limit) and name who can supply it.
