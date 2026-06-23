import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import {
  Column,
  DataSource,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bindFactories, defineFactory, typeormPersister } from 'typeorm-test-factory';
import { beginRollbackContext, RollbackFn } from './tools/transaction-context';

// Two databases registered as named DataSources — the same shape as a real app
// that resolves them with getDataSourceToken(DB.X) / @InjectDataSource('x').
// SQLite keeps the example dependency-free; the pattern is identical for Postgres.

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

const accountFactory = defineFactory(Account)((f) => ({
  email: `account${f.index}@test.dev`,
}));
const eventFactory = defineFactory(AnalyticsEvent)((f) => ({
  name: `event-${f.index}`,
}));

describe('multiple named DataSources (NestJS)', () => {
  let moduleRef: TestingModule;
  let primary: DataSource;
  let analytics: DataSource;
  let rollbacks: RollbackFn[];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        // default DataSource
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Account],
          synchronize: true,
        }),
        // a second, named DataSource
        TypeOrmModule.forRoot({
          name: 'analytics',
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [AnalyticsEvent],
          synchronize: true,
        }),
      ],
    }).compile();

    // Resolve each DataSource by its token — exactly how app code gets them.
    primary = moduleRef.get<DataSource>(getDataSourceToken());
    analytics = moduleRef.get<DataSource>(getDataSourceToken('analytics'));
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    // One rollback context per DataSource.
    rollbacks = await Promise.all([
      beginRollbackContext(primary),
      beginRollbackContext(analytics),
    ]);
  });

  afterEach(() => Promise.all(rollbacks.map((rollback) => rollback())));

  it('binds factories to each named DataSource and isolates both', async () => {
    const { account } = bindFactories(typeormPersister(primary), {
      account: accountFactory,
    });
    const { event } = bindFactories(typeormPersister(analytics), {
      event: eventFactory,
    });

    await account.createMany(2);
    await event.createMany(3);

    expect(await primary.getRepository(Account).count()).toBe(2);
    expect(await analytics.getRepository(AnalyticsEvent).count()).toBe(3);
  });

  it('rolled back the previous test on both connections', async () => {
    expect(await primary.getRepository(Account).count()).toBe(0);
    expect(await analytics.getRepository(AnalyticsEvent).count()).toBe(0);
  });
});
