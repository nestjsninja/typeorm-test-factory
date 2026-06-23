import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateOrderItemInput, OrderService } from './order.service';

interface CreateOrderBody {
  userId: number;
  items: CreateOrderItemInput[];
}

@Controller()
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post('orders')
  create(@Body() body: CreateOrderBody) {
    return this.orders.createOrder(body.userId, body.items);
  }

  @Get('users/:userId/orders/open')
  open(@Param('userId') userId: string) {
    return this.orders.findOpenForUser(Number(userId));
  }

  @Post('orders/:id/pay')
  pay(@Param('id') id: string) {
    return this.orders.pay(Number(id));
  }
}
