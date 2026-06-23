import 'reflect-metadata';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { defineFactory } from '../factory';
import { typeormPersister } from '../adapters/typeorm';
import { beginRollbackContext } from './_support/rollback-context';

@Entity()
class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  email!: string;
}

describe('composition with a transaction-rollback strategy (SQLite)', () => {
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

  it('factory writes inside the transaction are rolled back automatically', async () => {
    const userFactory = defineFactory(User)(
      (f) => ({ email: `user${f.index}@test.dev` }),
      typeormPersister(dataSource),
    );

    const rollback = await beginRollbackContext(dataSource);

    await userFactory.createMany(3);
    // Visible inside the open transaction (same patched runner)
    expect(await dataSource.getRepository(User).count()).toBe(3);

    await rollback();

    // Gone after rollback — no manual cleanup, nothing committed
    expect(await dataSource.getRepository(User).count()).toBe(0);
  });

  it('the next test starts from a clean state with no leftover data', async () => {
    expect(await dataSource.getRepository(User).count()).toBe(0);
  });
});
