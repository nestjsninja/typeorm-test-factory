import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, User])],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
