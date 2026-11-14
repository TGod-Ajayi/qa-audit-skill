# Files and media checks

#### When to use this file

Use this file for any unit that takes files in or hands files out: avatar and document uploads, attachments, image galleries, video, bulk imports, PDF invoices and receipts, CSV and Excel exports, and backups. It covers the file side of `input`, `integration` and `state`.

Use `api-and-integrations.md` for storage providers and signed URLs at the API level, `forms-and-data.md` for import round-trips of record data, `async-and-realtime.md` for double uploads, and `frontend-ux.md` for image weight and layout. Malicious files (executables, polyglots, scripts inside SVGs) are security work: record a `security_referral` and never build one.

## Core discipline (include in every tester prompt for this domain)

```
- Use generated test files only: make them with a script (exact sizes, known types) and keep them in the run folder. Never upload real documents or photos of real people.
- The limit comes from the UI copy, the spec or the server config. Test exactly at it, one byte under and one byte over.
- Check the whole round trip: upload, stored object, displayed preview, download. Compare the downloaded file's size and checksum with the original.
- Never craft a malicious file, an executable or a formula payload meant to run. If the app seems to accept something dangerous, record security_referral and stop.
- Delete every uploaded test file and check the storage bucket for leftovers you can see.
```

## Upload limits and types (check classes: `input`, `errors`)

**Size limits**
Upload a 0-byte file, a file exactly at the limit, one byte over, and a much larger file. A bug is a file over the limit accepted, a file at the limit rejected, or a large file that fails with a generic error after a long upload. Reject early on the client and enforce on the server.

**Types**
Upload each allowed type and one disallowed type. Also try an allowed extension with the wrong content (a `.txt` renamed `.png`). A bug is a disallowed type stored, or a corrupt file that crashes the preview. An executable type (`.exe`, `.sh`, `.html`, `.svg` with script) being accepted is a `security_referral`; do not open it.

**Client and server agree**
Send the over-limit and wrong-type files straight to the upload endpoint. A server that accepts what the UI refuses is a candidate.

## Filenames (check classes: `input`, `time-locale`)

**Odd names**
Upload files named with spaces, unicode (`Adébáyọ̀ CV.pdf`, `报告.pdf`), emoji, a 200-character name, no extension, two dots, and leading dots. The name shows correctly and downloads with the same name. Mojibake, a lost extension or a 500 is a candidate. Renaming to a safe stored name is correct, as long as the download name is right.

**Same name twice**
Upload two different files with the same name. Neither overwrites the other unless the spec says so.

## Interrupted and slow uploads (check classes: `timing`, `state`, `errors`)

**Progress and cancel**
Large uploads show progress. Cancel halfway. No half-written record remains, and the user can upload again.

**Network drop**
Drop the network mid-upload. The user sees a clear failure and can retry. Resumable uploads resume if the spec says they do.

**Leave the page**
Navigate away during an upload. The app warns, or the upload continues in the background as designed.

**Multi-file**
Upload several files at once with one failing. The others succeed and the failure is named.

## Image and media processing (check classes: `integration`, `performance`, `responsive`)

**Orientation and formats**
Upload a portrait phone photo with EXIF rotation, a HEIC from iPhone (if supported), a transparent PNG and a large JPEG. The preview is upright, transparency is kept, and thumbnails are generated. A sideways avatar is a candidate.

**Resizing and weight**
Served images are resized to their display size. A 6 MB original served as a 40px avatar is a performance candidate.

**Metadata**
Check whether GPS and camera EXIF data survives in the served image. If the spec says it is stripped and it isn't, that is a candidate. With no spec, record it as a `security_referral` for privacy review.

**Video and audio**
Media plays in all three engines, with a poster image and controls, and failed processing shows a clear state.

## Downloads and exports (check classes: `integration`, `state`, `time-locale`)

**Download integrity**
The downloaded file matches the upload byte for byte (compare checksums), with the right name and content type.

**Exports match the screen**
CSV, Excel and PDF exports contain the same rows, totals, dates and currency as the screen and the filters applied. An export that ignores the active filter is a candidate.

**Encoding**
CSVs open in Excel with unicode intact (a UTF-8 BOM or the documented encoding). Commas, quotes and line breaks inside fields stay in their column.

**Large exports**
Export the largest seeded dataset. It completes, or moves to a background job with a notification, without a timeout.

**Access**
Download links respect access rules. A link that works logged out when the spec says it is private, or that never expires when it should, is a `security_referral`.

**CSV injection (referral only)**
If user-entered text that starts with `=`, `+`, `-` or `@` is exported unchanged into CSV or Excel, record a `security_referral` with the field name. Do not build or open a formula payload to prove it.

## Universal moves

- Generate a fixture set once per run with a script: exact sizes, each allowed type, mislabelled types and odd names. Reuse it across testers.
- Hash every file before upload and after download.
- Watch the network log during upload to see client checks, request size and the server response.

## Validation rules (apply before reporting ANY candidate here)

1. Give the test file's name, size in bytes, real type and how it was generated.
2. Cite the limit or allowed type list and where it is stated.
3. For integrity bugs, give the checksums before and after.
4. For interrupted uploads, say when and how the interruption happened, and what was left in storage.
5. Use `confirmed` after 3/3 reproductions. Use `needs_validation` when the storage bucket or processing worker can't be inspected from the test environment, and name it. Anything about dangerous content goes in as `security_referral` with `needs_validation`.
