import type { EntityTarget, Persister } from './types';

// Branded with a global symbol so nested-factory detection still works even if
// two copies of this package end up in the tree (instanceof would fail there).
const FACTORY_BRAND: unique symbol = Symbol.for('typeorm-test-factory.Factory');

export interface FactoryContext {
  /** Zero-based position within a makeMany/createMany batch. Handy for sequences. */
  index: number;
}

/**
 * What a factory definition returns. Every field is optional. Object-typed
 * fields (relations) may also be a nested Factory, which is resolved at build
 * time. Scalar fields keep their exact type — including literal/union columns
 * like `'open' | 'paid'` — so they are checked precisely with no widening.
 */
export type FactoryShape<T> = {
  [K in keyof T]?: NonNullable<T[K]> extends object
    ? T[K] | Factory<NonNullable<T[K]>>
    : T[K];
};

export type FactoryDefinition<T> = (ctx: FactoryContext) => FactoryShape<T>;

export class Factory<T extends object> {
  readonly [FACTORY_BRAND] = true as const;

  constructor(
    private readonly target: EntityTarget,
    private readonly definition: FactoryDefinition<T>,
    private readonly persister?: Persister,
  ) {}

  static is(value: unknown): value is Factory<object> {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as Record<symbol, unknown>)[FACTORY_BRAND] === true
    );
  }

  /** A copy of this factory bound to a persister. */
  withPersister(persister: Persister): Factory<T> {
    return new Factory<T>(this.target, this.definition, persister);
  }

  /** A new factory whose defaults fold in `overrides` — a reusable "state". */
  with(overrides: FactoryShape<T>): Factory<T> {
    const base = this.definition;
    return new Factory<T>(
      this.target,
      (ctx) => ({ ...base(ctx), ...overrides }),
      this.persister,
    );
  }

  /** Build one entity in memory. Nested factories are built in memory too. No DB. */
  make(overrides: FactoryShape<T> = {}, ctx: FactoryContext = { index: 0 }): T {
    const shape = { ...this.definition(ctx), ...overrides };
    return this.resolveInMemory(shape);
  }

  /** Build `count` entities in memory. */
  makeMany(count: number, overrides: FactoryShape<T> = {}): T[] {
    return Array.from({ length: count }, (_value, index) =>
      this.make(overrides, { index }),
    );
  }

  /** Build and persist one entity. Nested factories are persisted first. */
  async create(
    overrides: FactoryShape<T> = {},
    ctx: FactoryContext = { index: 0 },
  ): Promise<T> {
    const persister = this.requirePersister();
    const shape = { ...this.definition(ctx), ...overrides };
    const resolved = await this.resolvePersisted(shape, persister);
    return persister.save<T>(this.target, resolved);
  }

  /** Build and persist `count` entities. */
  async createMany(
    count: number,
    overrides: FactoryShape<T> = {},
  ): Promise<T[]> {
    const created: T[] = [];
    for (let index = 0; index < count; index++) {
      created.push(await this.create(overrides, { index }));
    }
    return created;
  }

  private resolveInMemory(shape: FactoryShape<T>): T {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(shape)) {
      result[key] = Factory.is(value) ? value.make() : value;
    }
    return result as T;
  }

  private async resolvePersisted(
    shape: FactoryShape<T>,
    persister: Persister,
  ): Promise<T> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(shape)) {
      result[key] = Factory.is(value)
        ? await value.withPersister(persister).create()
        : value;
    }
    return result as T;
  }

  private requirePersister(): Persister {
    if (!this.persister) {
      throw new Error(
        'No persister bound to this factory. Pass one to defineFactory(), ' +
          'call factory.withPersister(persister), or use bindFactories().',
      );
    }
    return this.persister;
  }
}

export interface FactoryBuilder<T extends object> {
  (definition: FactoryDefinition<T>, persister?: Persister): Factory<T>;
}

/**
 * Defines a factory for an entity.
 *
 * Curried on purpose: the entity type is inferred **once** from the class, then
 * used to type-check the definition precisely. That is what lets a union column
 * like `status: 'open'` check against `'open' | 'paid' | 'cancelled'` with no
 * casts, while `create()` still returns the full entity (with its `id`).
 *
 * ```ts
 * const userFactory = defineFactory(User)((f) => ({
 *   name: faker.person.fullName(),
 *   email: `user${f.index}@test.dev`,
 * }));
 *
 * // String / name targets: pass the type explicitly.
 * const orgFactory = defineFactory<Org>('orgs')((f) => ({ name: `Org ${f.index}` }));
 * ```
 */
export function defineFactory<T extends object>(
  target: new (...args: any[]) => T,
): FactoryBuilder<T>;
export function defineFactory<T extends object>(
  target: EntityTarget,
): FactoryBuilder<T>;
export function defineFactory<T extends object>(
  target: EntityTarget,
): FactoryBuilder<T> {
  return (definition, persister) =>
    new Factory<T>(target, definition, persister);
}

export type FactoryMap = Record<string, Factory<object>>;

/** Bind every factory in a map to one persister. One call in `beforeAll`. */
export function bindFactories<M extends FactoryMap>(
  persister: Persister,
  factories: M,
): M {
  const bound: FactoryMap = {};
  for (const [key, factory] of Object.entries(factories)) {
    bound[key] = factory.withPersister(persister);
  }
  return bound as M;
}
