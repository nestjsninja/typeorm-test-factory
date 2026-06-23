# typeorm-test-factory

[![CI](https://github.com/nestjsninja/typeorm-test-factory/actions/workflows/ci.yml/badge.svg)](https://github.com/nestjsninja/typeorm-test-factory/actions/workflows/ci.yml)

Version-safe test data factories for **TypeORM**. Define factories once, then create realistic entities in your **integration and e2e tests** — without coupling to a specific TypeORM version.

📖 Read the walkthrough: [Version-Safe Test Data Factories for TypeORM](https://nestjs-ninja.com/blog/2026-08-13-version-safe-typeorm-test-data-factories/)

## Why

Unit tests mock the repository. **Integration and e2e tests hit a real database** — and that is where you need realistic seed data. Hand-writing `repository.save({ ... })` for every row is verbose and brittle, and the existing TypeORM seeding libraries break whenever TypeORM changes its internals (the `Connection` → `DataSource` rename in 0.3 broke most of them).

This library never imports `typeorm`. The entire coupling to your database is **one method** behind an adapter:

```ts
export interface Persister {
  save<T>(target: EntityTarget, entity: object): Promise<T>;
}
```

The TypeORM adapter is six lines of structural typing, so upgrading TypeORM cannot break it.

## Install

```bash
npm install --save-dev typeorm-test-factory
```

`typeorm` is an optional peer dependency — bring your own version (0.2, 0.3, 0.4…).

## Quick start

```ts
import { defineFactory, typeormPersister } from 'typeorm-test-factory';
import { faker } from '@faker-js/faker';
import { User } from '../src/user.entity';

// Define once — no persister yet
export const userFactory = defineFactory(User)(() => ({
  name: faker.person.fullName(),
  email: faker.internet.email(),
  role: 'user',
}));
```

```ts
// In an integration test
import { DataSource } from 'typeorm';
import { typeormPersister } from 'typeorm-test-factory';
import { userFactory } from './factories';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [User],
    synchronize: true,
  }).initialize();
});

afterAll(() => dataSource.destroy());

it('lists only admins', async () => {
  const persister = typeormPersister(dataSource);

  await userFactory.withPersister(persister).create({ role: 'admin' });
  await userFactory.withPersister(persister).createMany(2); // regular users

  const admins = await dataSource.getRepository(User).findBy({ role: 'admin' });
  expect(admins).toHaveLength(1);
});
```

## API

### `defineFactory(entity)(definition, persister?)`

Defines a factory. It is **curried**: the entity type is inferred once from the class, then used to type-check the definition precisely — so union columns like `status: 'open'` check against `'open' | 'paid' | 'cancelled'` without casts, while `create()` still returns the full entity. The definition receives a context with the batch `index` (useful for sequences):

```ts
const userFactory = defineFactory(User)((f) => ({
  name: `User ${f.index}`,
  email: `user${f.index}@test.dev`,
}));

// String / name targets: pass the type explicitly
const orgFactory = defineFactory<Org>('orgs')((f) => ({ name: `Org ${f.index}` }));
```

### `make` / `makeMany` — in memory, no database

```ts
const user = userFactory.make();              // a User instance, no id
const users = userFactory.makeMany(3);        // index 0, 1, 2
const admin = userFactory.make({ role: 'admin' });
```

### `create` / `createMany` — persisted

```ts
const user = await userFactory.create();
const users = await userFactory.createMany(5, { role: 'user' });
```

### `with(overrides)` — reusable states

```ts
const adminFactory = userFactory.with({ role: 'admin' });
await adminFactory.create();
```

### Relations — nested factories

Any field can be another factory. On `create`, the relation is persisted first and linked; on `make`, it is built in memory.

```ts
const postFactory = defineFactory(Post)(() => ({
  title: faker.lorem.sentence(),
  author: userFactory, // ← resolved automatically
}));

const post = await postFactory.withPersister(persister).create();
// post.author is a persisted User with an id

// Pass an explicit relation to reuse an existing row:
const author = await userFactory.withPersister(persister).create();
await postFactory.withPersister(persister).create({ author });
```

### `bindFactories(persister, map)` — bind many at once

```ts
const { user, post } = bindFactories(persister, { user: userFactory, post: postFactory });
await user.create();
await post.create();
```

## Example: a real NestJS app

[`examples/nestjs`](examples/nestjs) is a small but realistic orders app
(`OrderService` with `createOrder` / `findOpenForUser` / `pay`) showing the
library in:

- **service integration tests** — [`test/order.service.int-spec.ts`](examples/nestjs/test/order.service.int-spec.ts)
- **HTTP e2e tests** — [`test/order.e2e-spec.ts`](examples/nestjs/test/order.e2e-spec.ts)

Both seed with factories and isolate with a transaction-rollback helper
([`test/tools/transaction-context.ts`](examples/nestjs/test/tools/transaction-context.ts)),
and run against in-memory SQLite locally or real PostgreSQL in CI.

## Test isolation (rollback & parallelism)

This library owns the **arrange** half of a test — building data. **Isolation** (clean state per test, rollback, parallel runs) is a separate concern, and the library is intentionally agnostic about it.

The cleanest isolation strategy is **transaction rollback**: open a transaction before each test and roll it back afterwards, so nothing is ever committed and cleanup is free. Factories compose with this automatically — the persister calls plain `repository.save()`, which runs through whatever query runner the DataSource hands out, so a transaction-context helper that patches `createQueryRunner` captures every factory write and discards it on rollback.

See [`src/_test/transaction-rollback.spec.ts`](src/_test/transaction-rollback.spec.ts) for a runnable proof: factories write inside a transaction, and a single `rollback()` returns the database to empty with no manual cleanup.

- **Parallel on a shared DB**: transaction-per-test isolates workers (each holds its own uncommitted transaction). Works when the code under test does not commit on its own.
- **Parallel with a DB per worker**: when the code manages its own transactions, give each runner its own schema/database (e.g. keyed by `JEST_WORKER_ID`) and point the persister at it. Factories are unchanged.

The transaction helper itself is **not** part of the package — it reaches into TypeORM's `QueryRunner`, which is exactly the coupling this library avoids. Keep it in your test tooling.

## Multiple and named DataSources

A `Persister` wraps **one** source of repositories, so multiple DataSources just means multiple persisters. Bind each factory to the persister for the DataSource that owns its entity:

```ts
const accountFactory = defineFactory(Account)(
  (f) => ({ email: `account${f.index}@test.dev` }),
  typeormPersister(primaryDataSource),
);
const eventFactory = defineFactory(AnalyticsEvent)(
  (f) => ({ name: `event-${f.index}` }),
  typeormPersister(analyticsDataSource),
);
```

Or define once and bind per database with `bindFactories` — one call each:

```ts
const primary = bindFactories(typeormPersister(primaryDataSource), { account: accountFactory });
const analytics = bindFactories(typeormPersister(analyticsDataSource), { event: eventFactory });
```

### NestJS named DataSources

Resolve each DataSource by its token and build a persister from it — the same `getDataSourceToken(name)` you use in app code:

```ts
import { getDataSourceToken } from '@nestjs/typeorm';

const primary = app.get<DataSource>(getDataSourceToken());            // default
const analytics = app.get<DataSource>(getDataSourceToken('analytics')); // named

const factories = bindFactories(typeormPersister(analytics), { event: eventFactory });
```

(Providers inject these with `@InjectDataSource('analytics')`; in tests, pulling them from the app/module context is simpler.)

### Rollback across DataSources

Transactions are per connection, so open one rollback context per DataSource and roll them all back together:

```ts
let rollbacks: Array<() => Promise<void>>;

beforeEach(async () => {
  rollbacks = await Promise.all([
    beginRollbackContext(primaryDataSource),
    beginRollbackContext(analyticsDataSource),
  ]);
});

afterEach(() => Promise.all(rollbacks.map((rollback) => rollback())));
```

> A transaction in one DataSource cannot roll back writes in another — they are independent connections. Cross-database atomicity is a distributed-transaction problem, outside this library's scope.

Runnable proofs: [`src/_test/multi-datasource.spec.ts`](src/_test/multi-datasource.spec.ts) (plain TypeORM) and [`examples/nestjs/test/multi-datasource.int-spec.ts`](examples/nestjs/test/multi-datasource.int-spec.ts) (NestJS named DataSources).

## Version safety

This package has **zero runtime dependencies** and contains **no `import` of `typeorm`**. The adapter relies only on the structural contract `getRepository(target).save(entity)`, which is satisfied by TypeORM's `DataSource`, `EntityManager`, and the legacy `Connection` alike. Want a different backend? Implement the one-method `Persister` interface and every factory works unchanged.

## Tests

```bash
npm test
```

- `src/_test/factory.spec.ts` — core build/persist logic, states, relations, sequences (in-memory fake persister)
- `src/_test/typeorm-adapter.spec.ts` — the adapter delegates to `getRepository().save()` with structural typing
- `src/_test/integration.spec.ts` — real TypeORM + in-memory SQLite: generated ids, relations, FK linking, truncation between tests
- `src/_test/transaction-rollback.spec.ts` — factories compose with a transaction-rollback isolation strategy; writes vanish on rollback with no cleanup
- `src/_test/integration.postgres.spec.ts` — real **PostgreSQL** integration/e2e: generated ids, relations, FK linking, **unique-constraint enforcement**, and transaction rollback against real transactions
- `src/_test/multi-datasource.spec.ts` — two DataSources: a persister per database, `bindFactories` per database, and independent rollback across both

### Running against PostgreSQL

The Postgres suite runs automatically in CI (a `postgres:16` service container). It is **skipped** unless `POSTGRES_HOST` is set, so local `npm test` runs the SQLite suites only. To run it locally against a throwaway database:

```bash
docker run -d --name ttf-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=test -p 5433:5432 postgres:16

POSTGRES_HOST=localhost POSTGRES_PORT=5433 POSTGRES_USER=test \
  POSTGRES_PASSWORD=test POSTGRES_DB=test npm test
```

> The Postgres suite uses `dropSchema` — point it only at a disposable database.

## Releasing

Publishing is automated and the npm token lives **only** in GitHub Actions — never on a developer machine.

From a clean `main`:

```bash
npm run release                # bump version + CHANGELOG from commits, tag, push
npm run release -- --dry-run   # preview without changing anything
```

[release-it](https://github.com/release-it/release-it) (with the conventional-changelog plugin) bumps the version, updates `CHANGELOG.md`, commits, tags `v${version}`, and pushes — no npm or GitHub tokens needed locally. Pushing the tag triggers [`.github/workflows/publish.yml`](.github/workflows/publish.yml), which builds, tests, runs `npm publish --provenance`, and creates the GitHub release.

**One-time setup:** add an npm **automation** token as the `NPM_TOKEN` repository secret (Settings → Secrets and variables → Actions). An automation token can publish a brand-new package, so the first release goes through CI like any other.

Dependencies are kept current by [Renovate](https://docs.renovatebot.com/) (`renovate.json`), which leaves the intentionally-wide TypeORM peer range untouched.

## Prior art

[`typeorm-extension`](https://github.com/tada5hi/typeorm-extension) and
[`@jorgebodega/typeorm-factory`](https://github.com/jorgebodega/typeorm-factory)
both offer seeding/factories and are worth a look — especially `typeorm-extension`
for full database seeding (CLI, glob discovery, run-once tracking, bundled faker).

This package is narrower and aimed squarely at **test data**: no CLI, no faker
dependency, and — the key difference — it imports nothing from `typeorm`, so it is
not pinned to a TypeORM version. Bring your own data generator and your own
TypeORM; the coupling is a single `save` call behind an adapter.

## Author

[Henrique Weiand](https://nestjs-ninja.com) — [GitHub](https://github.com/nestjsninja)
