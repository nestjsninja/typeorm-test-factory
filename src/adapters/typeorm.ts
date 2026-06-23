import type { EntityTarget, Persister } from '../types';

/**
 * The minimal structural shape the adapter needs.
 *
 * This intentionally matches TypeORM's `DataSource`, `EntityManager`, and the
 * legacy `Connection` — but none of them are imported here. There is no
 * `import ... from 'typeorm'` anywhere in this package. That is the whole trick:
 * we depend on a duck-typed contract (`getRepository(target).save(entity)`) that
 * has been stable since TypeORM 0.1, so upgrading from 0.2 → 0.3 → 0.4 (and the
 * `Connection` → `DataSource` rename that broke every other seeding library)
 * cannot break this one.
 */
export interface RepositoryProvider {
  getRepository(target: any): {
    save(entity: any): Promise<any>;
  };
}

/**
 * Build a Persister from a TypeORM DataSource, EntityManager, or Connection.
 *
 * ```ts
 * const persister = typeormPersister(dataSource);
 * ```
 */
export function typeormPersister(source: RepositoryProvider): Persister {
  return {
    save<T extends object>(target: EntityTarget, entity: object): Promise<T> {
      return source.getRepository(target).save(entity) as Promise<T>;
    },
  };
}
