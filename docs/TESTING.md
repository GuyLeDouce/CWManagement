# Testing and Isolated PostgreSQL

## Local fast validation

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Prisma validation needs a syntactically valid `DATABASE_URL` but does not connect.

## Local integration database

Automated integration tests refuse any database whose URL path does not end in `_test`. Create a disposable PostgreSQL database such as `cwmanagement_test`, set `DATABASE_URL` only for that shell, then run:

```text
npm run db:migrate
npm run test:integration
```

Never point integration tests at development, staging, or production data.

## CI

GitHub Actions starts a fresh PostgreSQL 16 service named `cwmanagement_test`, installs locked dependencies, validates/generates Prisma, deploys every migration, and runs lint, typecheck, unit tests, integration tests, production build, and Playwright. CI credentials are workflow-local test values and are not production secrets.
