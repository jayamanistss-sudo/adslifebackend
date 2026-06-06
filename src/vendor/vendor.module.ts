import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorController } from './vendor.controller';
import { VendorService } from './vendor.service';
import { Vendor } from '../entities/vendor.entity';
import { VendorFollower } from '../entities/vendor-follower.entity';
import { User } from '../entities/user.entity';
import { Offer } from '../entities/offer.entity';
import { UserInteraction } from '../entities/user-interaction.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Vendor, VendorFollower, User, Offer, UserInteraction, SubscriptionPlan])],
  controllers: [VendorController],
  providers: [VendorService],
  exports: [VendorService],
})
export class VendorModule {}
