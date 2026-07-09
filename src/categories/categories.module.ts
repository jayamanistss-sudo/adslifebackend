import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesController } from './categories.controller';
import { Category } from '../entities/category.entity';
import { Offer } from '../entities/offer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Offer])],
  controllers: [CategoriesController],
})
export class CategoriesModule {}
