import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  product!: string;

  @Column('int')
  quantity!: number;

  /** Price per unit, in cents. */
  @Column('int')
  unitPrice!: number;

  @ManyToOne(() => Order, (order) => order.items)
  order!: Order;
}
