/**
 * Anything that identifies an entity to the underlying persistence layer.
 * For TypeORM this is usually the entity class, but a name or schema string
 * also works — we never inspect it, we just hand it to the adapter.
 */
export type EntityTarget = Function | string | { name: string };

/**
 * The single seam between this library and your database.
 *
 * The entire coupling to TypeORM (or any ORM) lives behind this one method.
 * Swap the adapter and the same factories run against a different backend —
 * or against an in-memory fake in the library's own tests.
 */
export interface Persister {
  /** Persist one entity for the given target and return the saved row. */
  save<T extends object>(target: EntityTarget, entity: object): Promise<T>;
}
