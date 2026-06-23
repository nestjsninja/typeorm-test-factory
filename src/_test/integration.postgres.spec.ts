import 'reflect-metadata';
import {
  Column,
  DataSource,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bindFactories, defineFactory } from '../factory';
import { typeormPersister } from '../adapters/typeorm';
import { beginRollbackContext } from './_support/rollback-context';

// Runs against a real PostgreSQL server. In CI a service container provides it;
// locally it is skipped unless POSTGRES_HOST is set (e.g. via docker).
// NOTE: this suite uses dropSchema — point it only at a throwaway database.
const describeIfPostgres = process.env.POSTGRES_HOST ? describe : describe.skip;

@Entity('users')
class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ default: 'user' })
  role!: string;
}

@Entity('posts')
class Post {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @ManyToOne(() => User, { eager: true })
  author!: User;
}

describeIfPostgres('PostgreSQL integration (real database)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await new DataSource({
      type: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      username: process.env.POSTGRES_USER ?? 'postgres',
      password: process.env.POSTGRES_PASSWORD ?? 'postgres',
      database: process.env.POSTGRES_DB ?? 'postgres',
      entities: [User, Post],
      dropSchema: true, // start each CI run from a clean schema
      synchronize: true,
    }).initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe('CRUD and relations (truncate between tests)', () => {
    beforeEach(async () => {
      await dataSource.query(
        'TRUNCATE TABLE posts, users RESTART IDENTITY CASCADE',
      );
    });

    function factories() {
      return bindFactories(typeormPersister(dataSource), {
        user: defineFactory(User)((f) => ({
          name: `User ${f.index}`,
          email: `user${f.index}@test.dev`,
          role: 'user',
        })),
        post: defineFactory(Post)((f) => ({
          title: `Post ${f.index}`,
          author: defineFactory(User)((g) => ({
            name: `Author ${g.index}`,
            email: `author${g.index}@test.dev`,
            role: 'user',
          })),
        })),
      });
    }

    it('persists a real row with a generated id', async () => {
      const { user } = factories();
      const created = await user.create({ email: 'specific@test.dev' });

      expect(created.id).toBeGreaterThan(0);
      const fromDb = await dataSource
        .getRepository(User)
        .findOneByOrFail({ id: created.id });
      expect(fromDb.email).toBe('specific@test.dev');
    });

    it('createMany inserts multiple rows with unique data', async () => {
      const { user } = factories();
      await user.createMany(5);
      expect(await dataSource.getRepository(User).count()).toBe(5);
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

    it('an explicit relation reuses an existing row', async () => {
      const { user, post } = factories();
      const author = await user.create();
      await post.create({ author });
      await post.create({ author });

      expect(await dataSource.getRepository(User).count()).toBe(1);
      expect(await dataSource.getRepository(Post).count()).toBe(2);
    });

    it('enforces real constraints — duplicate unique email rejects', async () => {
      const { user } = factories();
      await user.create({ email: 'dupe@test.dev' });
      // A real Postgres unique index must reject the second insert.
      await expect(user.create({ email: 'dupe@test.dev' })).rejects.toThrow();
    });
  });

  describe('transaction rollback composition (real transactions)', () => {
    it('factory writes inside the transaction are rolled back', async () => {
      await dataSource.query(
        'TRUNCATE TABLE posts, users RESTART IDENTITY CASCADE',
      );

      const userFactory = defineFactory(User)(
        (f) => ({
          name: `User ${f.index}`,
          email: `txn${f.index}@test.dev`,
          role: 'user',
        }),
        typeormPersister(dataSource),
      );

      const rollback = await beginRollbackContext(dataSource);
      await userFactory.createMany(3);
      expect(await dataSource.getRepository(User).count()).toBe(3);

      await rollback();
      expect(await dataSource.getRepository(User).count()).toBe(0);
    });
  });
});
