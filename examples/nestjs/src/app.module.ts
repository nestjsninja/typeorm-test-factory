import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './database.config';
import { OrderModule } from './order/order.module';

@Module({
  imports: [TypeOrmModule.forRoot(buildDataSourceOptions()), OrderModule],
})
export class AppModule {}
