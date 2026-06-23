import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { Order } from './order.entity';

export interface CreateOrderItemInput {
  product: string;
  quantity: number;
  unitPrice: number; // cents
}

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async createOrder(
    userId: number,
    items: CreateOrderItemInput[],
  ): Promise<Order> {
    if (items.length === 0) {
      throw new BadRequestException('An order needs at least one item');
    }

    const user = await this.users.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const total = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    const order = this.orders.create({
      user,
      status: 'open',
      total,
      items: items.map((item) => ({ ...item })),
    });

    return this.orders.save(order);
  }

  findOpenForUser(userId: number): Promise<Order[]> {
    return this.orders.find({
      where: { user: { id: userId }, status: 'open' },
      order: { id: 'ASC' },
    });
  }

  async pay(orderId: number): Promise<Order> {
    const order = await this.orders.findOneBy({ id: orderId });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (order.status !== 'open') {
      throw new BadRequestException(
        `Order ${orderId} is ${order.status}, cannot pay`,
      );
    }

    order.status = 'paid';
    return this.orders.save(order);
  }
}
