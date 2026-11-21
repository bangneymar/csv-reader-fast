# csv-reader-fast

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/bangneymar/csv-reader-fast/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/bangneymar/csv-reader-fast/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader): it returns
exactly csv-reader's answer — `{columns, rows, errors}` — for every input,
including every broken row (stray CRs, quote junk, unterminated quotes, short
and long rows), in about a quarter of the time.

Entry for the make.fun competition
[`csv-reader-speed-01-run-20261121`](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
($100, 10 places).

## Run it

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (the house driver, kept as-is) reads every case from
`/input/cases.json`, answers each one with `run()` from `solve.js`, and writes
`/output/answers.json`. Node 22, no dependencies, no network.

## How it works

`solve.js` is a single-pass reader written from the competition RULES, not a
copy of any public CSV parser:

1. **Fast path — most records.** A record is one line whose fields hold no
   quote at their start (a quote mid-field is a literal, and split-compatible)
   and no CR except a CRLF ending. Its fields are found by scanning commas
   with `indexOf` and slicing each field out — no per-character loop, no
   per-field allocation beyond the field string itself.
2. **Slow path — broken records only.** A record holding a quote-opened field
   or a stray CR is walked field by field with `indexOf`-driven readers that
   reproduce the vendor's policy exactly: `""` inside quotes is one quote,
   CRLF/lone CR inside quotes reads as LF, text after a closing quote is
   appended as-is (`quote_junk` when the field ends), a quote that never
   closes is a literal and the rest is re-read as unquoted
   (`unterminated_quote`), a CR outside quotes not followed by LF is dropped
   (`stray_cr`), and short/long rows are padded/cut to the first record's
   width with the same `line`/`row` on every error.
3. **No work is repeated.** Line numbers are tracked once per record on the
   fast path; quoted segments are only re-scanned when they actually hold a
   line break.

## Correctness

- All 6 practice cases identical to `practice/reference/expected.json`.
- 20,110 fuzz cases (random character soup, structured broken records, and
  hand-picked edge cases: BOM, lone CRs, CRLF inside quotes, unterminated
  quotes, quote junk, empty fields) — zero differences from vendor
  csv-reader 1.0.0.
- 6 fresh cases drawn from the kit's own generator — identical.

## Speed

On the practice set (~10.2 MB, 6 cases, 63,692 rows), median of repeated runs
on this machine: baseline csv-reader 1.0.0 ≈ 540 ms, this entry ≈ 130 ms —
about **4x faster**.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=98gtqxkh&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
