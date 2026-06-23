import { DataSource } from 'typeorm';

export type RollbackFn = () => Promise<void>;

/**
 * Transaction-rollback isolation for integration and e2e tests.
 *
 * Patches the DataSource so every repository call in the test runs through one
 * transactional query runner, then rolls that single transaction back. Nothing
 * is ever committed, so each test starts clean and leaves nothing behind — no
 * truncation, no ordering dependencies, parallel-safe across workers.
 *
 * Factories compose with this for free: their persister calls plain
 * `repository.save()`, which uses the patched runner, so every seeded row is
 * captured by the transaction and discarded on rollback.
 */
export async function beginRollbackContext(
  dataSource: DataSource,
): Promise<RollbackFn> {
  const queryRunner = dataSource.createQueryRunner();

  const originalRelease = queryRunner.release.bind(queryRunner);
  queryRunner.release = () => Promise.resolve();

  const originalCreate = dataSource.createQueryRunner.bind(dataSource);
  dataSource.createQueryRunner = () => queryRunner;

  await queryRunner.connect();
  await queryRunner.startTransaction();

  return async function rollback() {
    await queryRunner.rollbackTransaction();
    dataSource.createQueryRunner = originalCreate;
    queryRunner.release = originalRelease;
    await queryRunner.release();
  };
}
