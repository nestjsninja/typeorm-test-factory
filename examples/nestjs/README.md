# NestJS example — typeorm-test-factory

A small but realistic NestJS app (an orders domain) showing how to use
`typeorm-test-factory` in:

- **service integration tests** — exercise `OrderService` against a real database
- **HTTP e2e tests** — drive the app through `supertest`

Both use **factories** to seed data and a **transaction-rollback** helper for
isolation, so every test starts clean and nothing is committed.

## Layout

```
src/
├── user/user.entity.ts
├── order/order.entity.ts        # Order → items (1:N), user (N:1), total, status
├── order/order-item.entity.ts
├── order/order.service.ts       # createOrder / findOpenForUser / pay (real logic)
├── order/order.controller.ts    # POST /orders, GET open, POST pay
├── order/order.module.ts
├── database.config.ts           # Postgres if POSTGRES_HOST set, else in-memory SQLite
└── app.module.ts

test/
├── factories/index.ts           # userFactory, orderFactory (nested user)
├── tools/transaction-context.ts # rollback isolation (the pattern from real codebases)
├── order.service.int-spec.ts    # service integration tests
├── order.e2e-spec.ts            # HTTP e2e tests
└── multi-datasource.int-spec.ts # two named DataSources via getDataSourceToken
```

## Running

The example resolves the library from the built `dist/`, so build it first:

```bash
# from the repository root
npm install
npm run build

# then, in this folder
cd examples/nestjs
npm install
npm test
```

With no database configured the tests use an in-memory SQLite database. To run
against real PostgreSQL (what CI does):

```bash
docker run -d --name ttf-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=test -p 5433:5432 postgres:16

POSTGRES_HOST=localhost POSTGRES_PORT=5433 POSTGRES_USER=test \
  POSTGRES_PASSWORD=test POSTGRES_DB=test npm test
```

## The pattern in one place

```ts
beforeEach(async () => {
  rollback = await beginRollbackContext(dataSource); // open a transaction
  factories = bindFactories(typeormPersister(dataSource), {
    user: defineUserFactory(),
    order: defineOrderFactory(),
  });
});

afterEach(() => rollback()); // discard everything the test created

it('pays an open order', async () => {
  const user = await factories.user.create();
  const order = await factories.order.create({ user, status: 'open' });
  const paid = await service.pay(order.id);
  expect(paid.status).toBe('paid');
});
```
