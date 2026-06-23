import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { bindFactories, typeormPersister } from 'typeorm-test-factory';
import { AppModule } from '../src/app.module';
import { beginRollbackContext, RollbackFn } from './tools/transaction-context';
import { userFactory } from './factories';

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let rollback: RollbackFn;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    rollback = await beginRollbackContext(dataSource);
  });

  afterEach(() => rollback());

  it('creates an order over HTTP, lists it open, then pays it', async () => {
    // Seed the prerequisite user with a factory — the HTTP calls below run
    // through the same patched connection, so this all rolls back afterwards.
    const { user } = bindFactories(typeormPersister(dataSource), {
      user: userFactory,
    });
    const seeded = await user.create();

    const created = await request(app.getHttpServer())
      .post('/orders')
      .send({
        userId: seeded.id,
        items: [{ product: 'Widget', quantity: 2, unitPrice: 500 }],
      })
      .expect(201);

    expect(created.body.total).toBe(1000);
    expect(created.body.status).toBe('open');

    const openBefore = await request(app.getHttpServer())
      .get(`/users/${seeded.id}/orders/open`)
      .expect(200);
    expect(openBefore.body).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/pay`)
      .expect(201);

    const openAfter = await request(app.getHttpServer())
      .get(`/users/${seeded.id}/orders/open`)
      .expect(200);
    expect(openAfter.body).toHaveLength(0);
  });

  it('returns 404 when ordering for a user that does not exist', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .send({
        userId: 999_999,
        items: [{ product: 'x', quantity: 1, unitPrice: 100 }],
      })
      .expect(404);
  });
});
