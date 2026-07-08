import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanFeaturesService } from './plan-features.service';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Vendor } from '../entities/vendor.entity';

// Global — checked from banner-ads, spotlight, analytics, and the plans
// admin CRUD, none of which should each need their own import wiring.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionPlan, Vendor])],
  providers: [PlanFeaturesService],
  exports: [PlanFeaturesService],
})
export class PlanFeaturesModule {}
