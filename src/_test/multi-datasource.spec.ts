import 'reflect-metadata';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { bindFactories, defineFactory } from '../factory';
import { typeormPersister } from '../adapters/typeorm';
import { beginRollbackContext } from './_support/rollback-context';

// Two databases: a primary one with accounts, an analytics one with events.
@Entity('accounts')
class Account {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  email!: string;
}

@Entity('events')
class AnalyticsEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

describe('multiple DataSources', () => {
  let primary: DataSource;
  let analytics: DataSource;

  beforeAll(async () => {
    primary = await new DataSource({
      type: 'sqljs',
      autoSave: false,
      entities: [Account],
      synchronize: true,
    }).initialize();

    analytics = await new DataSource({
      type: 'sqljs',
      autoSave: false,
      entities: [AnalyticsEvent],
      synchronize: true,
    }).initialize();
  });

  afterAll(async () => {
    await primary.destroy();
    await analytics.destroy();
  });

  beforeEach(async () => {
    await primary.getRepository(Account).clear();
    await analytics.getRepository(AnalyticsEvent).clear();
  });

  it('a persister per DataSource routes each factory to the right database', async () => {
    const accountFactory = defineFactory(Account)(
      (f) => ({ email: `account${f.index}@test.dev` }),
      typeormPersister(primary),
    );
    const eventFactory = defineFactory(AnalyticsEvent)(
      (f) => ({ name: `event-${f.index}` }),
      typeormPersister(analytics),
    );

    await accountFactory.createMany(2);
    await eventFactory.createMany(3);

    expect(await primary.getRepository(Account).count()).toBe(2);
    expect(await analytics.getRepository(AnalyticsEvent).count()).toBe(3);
  });

  it('bindFactories can target different DataSources, one call each', async () => {
    // Define once with no persister; bind per database.
    const accountFactory = defineFactory(Account)((f) => ({
      email: `bind${f.index}@test.dev`,
    }));
    const eventFactory = defineFactory(AnalyticsEvent)((f) => ({
      name: `bind-${f.index}`,
    }));

    const primaryFactories = bindFactories(typeormPersister(primary), {
      account: accountFactory,
    });
    const analyticsFactories = bindFactories(typeormPersister(analytics), {
      event: eventFactory,
    });

    const account = await primaryFactories.account.create();
    const event = await analyticsFactories.event.create();

    expect(account.id).toBeGreaterThan(0);
    expect(event.id).toBeGreaterThan(0);
    expect(await primary.getRepository(Account).count()).toBe(1);
    expect(await analytics.getRepository(AnalyticsEvent).count()).toBe(1);
  });

  it('rolls back independently across both DataSources', async () => {
    const accountFactory = defineFactory(Account)(
      (f) => ({ email: `rb${f.index}@test.dev` }),
      typeormPersister(primary),
    );
    const eventFactory = defineFactory(AnalyticsEvent)(
      (f) => ({ name: `rb-${f.index}` }),
      typeormPersister(analytics),
    );

    // One rollback context per DataSource — transactions are per connection.
    const rollbacks = await Promise.all([
      beginRollbackContext(primary),
      beginRollbackContext(analytics),
    ]);

    await accountFactory.createMany(2);
    await eventFactory.createMany(2);
    expect(await primary.getRepository(Account).count()).toBe(2);
    expect(await analytics.getRepository(AnalyticsEvent).count()).toBe(2);

    await Promise.all(rollbacks.map((rollback) => rollback()));

    expect(await primary.getRepository(Account).count()).toBe(0);
    expect(await analytics.getRepository(AnalyticsEvent).count()).toBe(0);
  });
});
