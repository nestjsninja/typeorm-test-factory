import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import { OrderItem } from './order-item.entity';

export type OrderStatus = 'open' | 'paid' | 'cancelled';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { eager: true, nullable: false })
  user!: User;

  @Column({ default: 'open' })
  status!: OrderStatus;

  /** Order total, in cents. */
  @Column('int', { default: 0 })
  total!: number;

  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: true,
    eager: true,
  })
  items!: OrderItem[];
}
