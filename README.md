# GMATE

GMATE is a Next.js study app for GMAT-style practice with topic mastery, spaced repetition, smart session selection, and an adaptive learning engine.

## Local setup

Install dependencies and start the app:

```bash
npm ci
npm run dev
```

The app expects Postgres via `DATABASE_URL`. The repo includes a local database definition in `docker-compose.yml`.

## Question import workflows

### Open-licensed import: AQuA-RAT

Use the open-source importer for bridge GMAT-like quant content. The approved source registry currently contains only `aqua-rat`, which is imported as `QUANTITATIVE_REASONING` / `PROBLEM_SOLVING` and tagged as non-official.

Preview the first 200 records without writing anything:

```bash
npx tsx scripts/import-open.ts --source aqua-rat --split dev --dry-run --limit 200
```

Import a full split once the dry run looks good:

```bash
npx tsx scripts/import-open.ts --source aqua-rat --split dev
```

Import all approved open sources and all splits:

```bash
npx tsx scripts/import-open.ts --source all --split all
```

The importer will:

- reject sources that are not explicitly redistributable
- keep low-confidence topic assignments out of the adaptive engine by leaving `topicId = null`
- preserve source provenance through `QuestionSource`, `sourceExternalId`, `sourceUrl`, and `sourceMetadata`

### Private/licensed import: GMAT Official Guide

For copyrighted material that you have separately licensed or extracted for local use, keep using the private importer:

```bash
npx tsx scripts/import-official.ts
```

That script reads `data/official-questions.json`, which is intentionally gitignored.

### Deprecated: gmat-database / GMAT Club importer

`scripts/import-gmatclub.ts` is deprecated and not part of the default onboarding path.

Reason:

- the source is unverified for the open-licensed pipeline
- the live payloads do not provide a reliable answer key
- importing it by default would mix legally unclear content into the question bank

The script remains in the repo only as a reference path and is blocked by default unless you explicitly opt in with `GMATE_ALLOW_UNVERIFIED_SOURCES=true`.

## Verification

Useful checks after schema or importer changes:

```bash
npx prisma generate
npx tsx scripts/import-open.ts --source aqua-rat --split dev --dry-run --limit 200
npm run build
```
