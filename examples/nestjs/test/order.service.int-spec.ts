import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { bindFactories, typeormPersister } from 'typeorm-test-factory';
import { buildDataSourceOptions } from '../src/database.config';
import { OrderModule } from '../src/order/order.module';
import { OrderService } from '../src/order/order.service';
import { Order } from '../src/order/order.entity';
import { User } from '../src/user/user.entity';
import { beginRollbackContext, RollbackFn } from './tools/transaction-context';
import { orderFactory, userFactory } from './factories';

describe('OrderService (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let service: OrderService;

  let rollback: RollbackFn;
  // Strong types derived straight from the factory definitions — no restating.
  let factories: { user: typeof userFactory; order: typeof orderFactory };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(buildDataSourceOptions()), OrderModule],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(OrderService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    // Open a transaction; everything the test does rolls back afterwards.
    rollback = await beginRollbackContext(dataSource);

    factories = bindFactories(typeormPersister(dataSource), {
      user: userFactory,
      order: orderFactory,
    });
  });

  afterEach(() => rollback());

  it('creates an order, computes the total, and starts it open', async () => {
    const user = await factories.user.create();

    const order = await service.createOrder(user.id, [
      { product: 'Widget', quantity: 2, unitPrice: 500 },
      { product: 'Gadget', quantity: 1, unitPrice: 1500 },
    ]);

    expect(order.status).toBe('open');
    expect(order.total).toBe(2500); // 2*500 + 1*1500
    expect(order.items).toHaveLength(2);
    expect(order.user.id).toBe(user.id);
  });

  it('findOpenForUser returns only the open orders for that user', async () => {
    const user = await factories.user.create();
    const otherUser = await factories.user.create();

    await factories.order.create({ user, status: 'open' });
    await factories.order.create({ user, status: 'paid' });
    await factories.order.create({ user: otherUser, status: 'open' });

    const open = await service.findOpenForUser(user.id);

    expect(open).toHaveLength(1);
    expect(open[0].status).toBe('open');
    expect(open[0].user.id).toBe(user.id);
  });

  it('pay transitions an open order to paid', async () => {
    const user = await factories.user.create();
    const order = await factories.order.create({ user, status: 'open' });

    const paid = await service.pay(order.id);

    expect(paid.status).toBe('paid');
  });

  it('pay rejects an order that is already paid', async () => {
    const user = await factories.user.create();
    const order = await factories.order.create({ user, status: 'paid' });

    await expect(service.pay(order.id)).rejects.toThrow(/cannot pay/);
  });

  it('createOrder rejects a missing user', async () => {
    await expect(
      service.createOrder(999_999, [
        { product: 'x', quantity: 1, unitPrice: 100 },
      ]),
    ).rejects.toThrow(/not found/);
  });

  it('isolation: a prior test left no orders behind', async () => {
    expect(await dataSource.getRepository(Order).count()).toBe(0);
    expect(await dataSource.getRepository(User).count()).toBe(0);
  });
});
