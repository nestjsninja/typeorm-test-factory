import 'reflect-metadata';
import {
  Column,
  DataSource,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { defineFactory } from '../factory';
import { typeormPersister } from '../adapters/typeorm';

// This is the real use case: integration / e2e tests against an actual database.
// We use an in-memory SQLite database here so the suite needs no external service.

@Entity()
class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  email!: string;

  @Column({ default: 'user' })
  role!: string;
}

@Entity()
class Post {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @ManyToOne(() => User, { eager: true })
  author!: User;
}

describe('TypeORM integration (real database, in-memory SQLite)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqljs',
      autoSave: false,
      entities: [User, Post],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // Truncate between tests so each one arranges its own state — the bread and
  // butter of integration testing.
  beforeEach(async () => {
    await dataSource.getRepository(Post).clear();
    await dataSource.getRepository(User).clear();
  });

  function factories() {
    const persister = typeormPersister(dataSource);
    const user = defineFactory(User)(
      (f) => ({
        name: `User ${f.index}`,
        email: `user${f.index}@test.dev`,
        role: 'user',
      }),
      persister,
    );
    const post = defineFactory(Post)(
      (f) => ({ title: `Post ${f.index}`, author: user }),
      persister,
    );
    return { user, post };
  }

  it('create persists a real row with a generated id', async () => {
    const { user } = factories();
    const created = await user.create({ email: 'specific@test.dev' });

    expect(created.id).toBeGreaterThan(0);
    const fromDb = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: created.id });
    expect(fromDb.email).toBe('specific@test.dev');
  });

  it('createMany inserts multiple rows', async () => {
    const { user } = factories();
    await user.createMany(3);
    expect(await dataSource.getRepository(User).count()).toBe(3);
  });

  it('a nested factory persists the relation and links the foreign key', async () => {
    const { post } = factories();
    const created = await post.create();

    expect(created.author.id).toBeGreaterThan(0);
    expect(await dataSource.getRepository(User).count()).toBe(1);

    const fromDb = await dataSource.getRepository(Post).findOne({
      where: { id: created.id },
      relations: { author: true },
    });
    expect(fromDb?.author.id).toBe(created.author.id);
  });

  it('an explicit relation reuses an existing row instead of inserting a new one', async () => {
    const { user, post } = factories();
    const author = await user.create();
    await post.create({ author });

    expect(await dataSource.getRepository(User).count()).toBe(1);
  });

  it('states compose with create', async () => {
    const { user } = factories();
    const adminFactory = user.with({ role: 'admin' });
    const admin = await adminFactory.create();

    const fromDb = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: admin.id });
    expect(fromDb.role).toBe('admin');
  });
});
