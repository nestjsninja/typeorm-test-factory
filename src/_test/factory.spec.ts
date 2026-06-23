import { defineFactory, bindFactories, Factory } from '../factory';
import type { Persister, EntityTarget } from '../types';

class User {
  id?: number;
  name!: string;
  email!: string;
  role!: string;
}

class Post {
  id?: number;
  title!: string;
  author!: User;
}

// An in-memory fake — this is how the library tests itself without a database.
function fakePersister() {
  const saved: Array<{ target: EntityTarget; entity: any }> = [];
  let seq = 1;
  const persister: Persister = {
    async save(target, entity: any) {
      const withId = { ...entity, id: entity.id ?? seq++ };
      saved.push({ target, entity: withId });
      return withId;
    },
  };
  return { persister, saved };
}

describe('make (in-memory)', () => {
  const userFactory = defineFactory(User)((f) => ({
    name: `User ${f.index}`,
    email: `user${f.index}@test.dev`,
    role: 'user',
  }));

  it('builds an entity from the definition without an id', () => {
    const user = userFactory.make();
    expect(user).toMatchObject({
      name: 'User 0',
      email: 'user0@test.dev',
      role: 'user',
    });
    expect(user.id).toBeUndefined();
  });

  it('applies overrides', () => {
    expect(userFactory.make({ role: 'admin' }).role).toBe('admin');
  });

  it('makeMany increments the context index', () => {
    const users = userFactory.makeMany(3);
    expect(users.map((u) => u.name)).toEqual(['User 0', 'User 1', 'User 2']);
  });
});

describe('with (states)', () => {
  const userFactory = defineFactory(User)(() => ({
    name: 'Base',
    email: 'b@test.dev',
    role: 'user',
  }));

  it('returns a new factory with merged defaults', () => {
    const adminFactory = userFactory.with({ role: 'admin' });
    expect(adminFactory.make().role).toBe('admin');
  });

  it('does not mutate the original factory', () => {
    userFactory.with({ role: 'admin' });
    expect(userFactory.make().role).toBe('user');
  });
});

describe('create (persisted)', () => {
  const baseUser = defineFactory(User)((f) => ({
    name: `User ${f.index}`,
    email: `u${f.index}@test.dev`,
    role: 'user',
  }));

  it('throws a helpful error when no persister is bound', async () => {
    await expect(baseUser.create()).rejects.toThrow(/No persister bound/);
  });

  it('persists and returns the saved entity', async () => {
    const { persister, saved } = fakePersister();
    const user = await baseUser.withPersister(persister).create();
    expect(user.id).toBe(1);
    expect(saved).toHaveLength(1);
    expect(saved[0].target).toBe(User);
  });

  it('createMany persists count entities with sequential data', async () => {
    const { persister, saved } = fakePersister();
    const users = await baseUser.withPersister(persister).createMany(3);
    expect(users.map((u) => u.id)).toEqual([1, 2, 3]);
    expect(users.map((u) => u.name)).toEqual(['User 0', 'User 1', 'User 2']);
    expect(saved).toHaveLength(3);
  });
});

describe('nested factories (relations)', () => {
  const userFactory = defineFactory(User)(() => ({
    name: 'Author',
    email: 'a@test.dev',
    role: 'user',
  }));
  const postFactory = defineFactory(Post)(() => ({
    title: 'Hello',
    author: userFactory,
  }));

  it('create persists the relation first, then the parent', async () => {
    const { persister, saved } = fakePersister();
    const post = await postFactory.withPersister(persister).create();

    expect(post.author.id).toBeDefined();
    expect(saved[0].target).toBe(User); // author saved first
    expect(saved[1].target).toBe(Post); // then the post
  });

  it('make builds the relation in memory with no ids', () => {
    const post = postFactory.make();
    expect(post.author).toMatchObject({ name: 'Author' });
    expect(post.author.id).toBeUndefined();
  });

  it('an explicit relation override reuses the entity instead of creating one', async () => {
    const { persister, saved } = fakePersister();
    const existing: User = {
      id: 99,
      name: 'Existing',
      email: 'e@test.dev',
      role: 'user',
    };
    const post = await postFactory
      .withPersister(persister)
      .create({ author: existing });

    expect(post.author.id).toBe(99);
    expect(saved).toHaveLength(1); // only the post, no new author
    expect(saved[0].target).toBe(Post);
  });
});

describe('bindFactories', () => {
  it('binds every factory in the map to the persister', async () => {
    const { persister } = fakePersister();
    const factories = bindFactories(persister, {
      user: defineFactory(User)(() => ({
        name: 'x',
        email: 'x@test.dev',
        role: 'user',
      })),
      post: defineFactory(Post)(() => ({
        title: 't',
        author: { id: 1 } as User,
      })),
    });

    await expect(factories.user.create()).resolves.toHaveProperty('id');
    await expect(factories.post.create()).resolves.toHaveProperty('id');
  });
});

describe('Factory.is', () => {
  it('detects factory instances and rejects everything else', () => {
    expect(Factory.is(defineFactory(User)(() => ({})))).toBe(true);
    expect(Factory.is({})).toBe(false);
    expect(Factory.is(null)).toBe(false);
    expect(Factory.is('user')).toBe(false);
  });
});
