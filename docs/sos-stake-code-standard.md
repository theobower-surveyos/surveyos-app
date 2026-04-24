# SurveyOS Stake Code Standard (SOS)

**Version 1.0 · Effective 2026-04-24**

## Why SOS exists

Every surveying firm has its own convention for describing as-staked points. One crew writes `4003 - 4002 - 11FT LUP`, another writes `line stake 11' left`, a third puts the offset in a separate column. All of them are correct on the ground. None of them are parseable by a computer without a stack of per-firm rules.

SurveyOS solves the QC problem — comparing staked results against design intent — by asking firms to meet the software halfway. Use one canonical grammar when writing stake codes in the field, and SurveyOS will do the matching, QC, and reporting automatically. No per-firm parser, no free-text guessing, no misclassified check shots.

SOS is that grammar.

## The grammar

Every SOS code is one of four forms:

| Form | Shape | Example |
|---|---|---|
| Point stake | `<design_id>-<offset>-<stake>` | `4007-5-HUB` |
| Line stake | `<id1>:<id2>-<offset>-<stake>` | `4003:4002-11-NAIL` |
| Check shot | `<design_id>-CHK` | `4007-CHK` |
| Control check | `CP-CHK` | `CP-CHK` |

That's it. Four forms, each one unambiguous.

### Fields

- **design_id** — the point identifier from the design package. Letters, numbers, and underscores only. No dashes, no colons, no spaces. Case is preserved (so `CP_PRI` stays `CP_PRI`).
- **offset** — distance from the design point, in feet. A non-negative number. Can be a whole number (`5`) or decimal (`5.5`). No unit suffix — feet is always implied.
- **stake** — what you physically set. One of the canonical stake types below.
- **`CHK`** — the literal string `CHK` (case-insensitive), marking a check shot.

### Stake types

One of these, case-insensitive in the code (SurveyOS normalizes to uppercase):

| Code | Physical meaning |
|---|---|
| `HUB` | Wooden hub with lathe |
| `LATHE` | Lathe only (no hub) |
| `NAIL` | Generic nail (soil / sod) |
| `PK` | Hardened nail for pavement |
| `MAG` | Magnetic nail |
| `PAINT` | Spray paint mark |
| `CP` | Control pin |
| `WHISKER` | Fluorescent plastic flag marker |

## The four forms in detail

### Point stake — `4007-5-HUB`

"I set a hub, 5 feet offset from design point 4007." The direction of the offset is not encoded in the code — the chief records that separately (field notes, or the offset direction is implied by the design geometry). SurveyOS matches the observation to point 4007 and computes the delta.

Use a `0` offset when the stake is right on the design point (no offset):
```
4007-0-PAINT
```

### Line stake — `4003:4002-11-NAIL`

"I set a nail on the line from design point 4003 to design point 4002, 11 feet from 4003." The first ID is the station-zero endpoint; the second is the other end of the line. The offset is the distance along the line from the first ID.

Useful for stationing along a curb, a pipe centerline, or any linear feature.

### Check shot — `4007-CHK`

"I occupied design point 4007 and took a shot to verify position." No offset, no physical stake — the purpose is to confirm you're set up correctly before staking out. SurveyOS compares the observation against the design coordinates for 4007 and flags drift.

### Control check — `CP-CHK`

"I occupied a control point and took a check shot." Like `<id>-CHK` but for the network control itself — SurveyOS treats this specially so control-point observations don't clutter the per-design-point QC.

## Case and whitespace

- **Leading and trailing whitespace is trimmed.** `  4007-5-HUB  ` is valid.
- **Internal whitespace is not allowed.** `4007 - 5 - HUB` is a parse error. SOS codes are single tokens.
- **Stake types are case-insensitive.** `hub`, `Hub`, `HUB` all mean the same thing.
- **The `CHK` sentinel is case-insensitive.** `4007-chk` works.
- **Design IDs preserve case.** `CP_PRI` and `cp_pri` are different IDs.

## Common mistakes

**Trailing `FT` on the offset.** ❌ `4007-5FT-HUB` — SOS knows offsets are in feet. Omit the suffix.

**Spaces around dashes.** ❌ `4007 - 5 - HUB` — use a single token with no internal whitespace.

**Free-text descriptions.** ❌ `hub 5 ft north of 4007` — SOS is structured, not prose. If you can't express it as one of the four forms, leave it out of the as-staked file and put it in the chief's field notes instead.

**Unknown stake types.** ❌ `4007-5-LUP` — only the eight stake types listed above are recognized. If your firm uses a code not in the list, contact us to discuss whether it should be added.

**Negative offsets.** ❌ `4007--5-HUB` — offsets are always non-negative. Direction is inferred from the design geometry or recorded separately.

## Field-fit deviations

If what you staked doesn't match what the design called for — a monument was destroyed, a buried utility forced a move, the crew judged a different setup better — DON'T try to encode the deviation in the stake code. That's what the SurveyOS crew app's field-fit flow is for. Submit the assignment with a standard SOS code and flag the deviation in the crew app; the PM sees it in context on the reconciliation screen.

## Migration from legacy formats

If your firm currently uses a different as-staked code convention, you have two options:

1. **Adopt SOS.** Update your field procedures and Trimble Access templates to emit SOS-compliant codes. The grammar is simple enough that most crews pick it up in a day.

2. **Custom parser integration (Phase 2).** For firms with strong legacy conventions that can't easily change, SurveyOS will offer a per-firm parser mapping layer in Phase 2. Contact us to discuss your format.

SOS v1 is the only format supported natively.

## Validating your codes

To check that your codes parse cleanly before uploading to SurveyOS, use the SOS Parser Tester (available in dev mode) or the code validation on the crew app upload screen (coming in Stage 10.3).

## Versioning

This document is version 1.0. Future versions will be announced with a migration period; older versions remain readable. The enum of stake types may grow (adding entries is non-breaking), but the four structural forms are stable.
