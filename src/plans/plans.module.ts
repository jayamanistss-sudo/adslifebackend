import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlansController } from './plans.controller';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Vendor } from '../entities/vendor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionPlan, Vendor])],
  controllers: [PlansController],
})
export class PlansModule {}
