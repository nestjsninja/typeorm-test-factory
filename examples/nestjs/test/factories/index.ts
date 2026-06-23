import { defineFactory } from 'typeorm-test-factory';
import { User } from '../../src/user/user.entity';
import { Order } from '../../src/order/order.entity';

// A module-level counter keeps generated emails unique across every build,
// which matters because the users table has a unique constraint on email.
let userSeq = 0;

// Exported as const instances so tests can type variables with `typeof userFactory`.
// They carry no persister — tests bind one per run (see bindFactories / withPersister).
export const userFactory = defineFactory(User)(() => {
  const n = userSeq++;
  return { name: `User ${n}`, email: `user${n}@test.dev` };
});

export const orderFactory = defineFactory(Order)(() => ({
  // Nested factory: an order created without an explicit user gets a fresh one.
  user: userFactory,
  status: 'open', // strongly typed against Order['status'] — 'paid'/'cancelled' also valid
  total: 0,
}));
