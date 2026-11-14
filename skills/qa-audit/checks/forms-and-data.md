# Forms and data

## Field-level input matrix

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
| File | 0 bytes, exactly the limit, over the limit, a wrong type with the right extension, a long or unicode filename, two files with the same name |
| Select / radio | no selection, every option, and an option value the API should reject (sent directly) |
| Rich text | pasted from Word or Google Docs, very long, embedded images |

## Form behaviour

- Error messages appear next to the field, say what to fix, and clear once it is fixed.
- The form keeps the user's input after a validation error or a failed submit.
- The submit button is disabled or guarded while a request is in flight (see `async-and-realtime.md`).
- Enter submits where expected. Autofill and password managers work.
- Multi-step forms keep their data across steps, back navigation and refresh, or warn clearly that it will be lost.
- Client rules and server rules match. Send the same invalid payload straight to the API and compare the results.

## Data lifecycle

- **Create:** the record appears in every list, search result, count and dashboard that should show it.
- **Read:** the detail view matches what was entered, including whitespace, unicode and precision.
- **Update:** partial updates don't wipe fields that weren't changed. `updated_at` and history entries are correct.
- **Delete:** the record disappears everywhere, including caches. Related records follow the intended rule (cascade, nullify or block). Soft-deleted records stay hidden. Undo, if offered, works.
- **Uniqueness:** create a duplicate both through the UI and through the API at the same moment. Check for duplicate rows.
- **Ownership:** a record created by user A is never shown to user B (`security_referral` if it is).
- **Import and export:** round-trip a CSV with unicode and commas inside fields.
