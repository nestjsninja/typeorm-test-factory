import { DataSource } from 'typeorm';

/**
 * The essence of a transaction-rollback isolation helper (the pattern used in
 * production NestJS test suites): patch `createQueryRunner` so every repository
 * call in the test runs through ONE transactional runner, then roll that single
 * transaction back so nothing is ever committed.
 *
 * This is test tooling, NOT part of the library — it reaches into TypeORM's
 * QueryRunner, the kind of coupling the library deliberately avoids. It lives
 * here so both the SQLite and Postgres suites can prove that factories compose
 * with this strategy.
 */
export async function beginRollbackContext(dataSource: DataSource) {
  const queryRunner = dataSource.createQueryRunner();

  // Block intermediate releases so the transaction survives the whole test.
  const originalRelease = queryRunner.release.bind(queryRunner);
  queryRunner.release = () => Promise.resolve();

  // Every repository in the test now runs through THIS runner.
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
