import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from './user/user.entity';
import { Order } from './order/order.entity';
import { OrderItem } from './order/order-item.entity';

/**
 * One database config used by both the running app and the tests.
 *
 * If POSTGRES_HOST is set (as in CI), it connects to real PostgreSQL. Otherwise
 * it uses sql.js — a pure-WASM SQLite that needs no native build, so the example
 * runs anywhere with zero setup, including in the browser (StackBlitz).
 */
export function buildDataSourceOptions(): TypeOrmModuleOptions {
  const entities = [User, Order, OrderItem];

  if (process.env.POSTGRES_HOST) {
    return {
      type: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      username: process.env.POSTGRES_USER ?? 'postgres',
      password: process.env.POSTGRES_PASSWORD ?? 'postgres',
      database: process.env.POSTGRES_DB ?? 'postgres',
      entities,
      synchronize: true,
    };
  }

  return {
    type: 'sqljs',
    autoSave: false,
    entities,
    synchronize: true,
  };
}
