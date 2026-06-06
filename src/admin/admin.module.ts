import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PushService } from '../services/push.service';
import { User } from '../entities/user.entity';
import { Vendor } from '../entities/vendor.entity';
import { Offer } from '../entities/offer.entity';
import { SiteSetting } from '../entities/site-setting.entity';
import { VendorDailyStat } from '../entities/vendor-daily-stat.entity';
import { UserInteraction } from '../entities/user-interaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Vendor, Offer, SiteSetting, VendorDailyStat, UserInteraction])],
  controllers: [AdminController],
  providers: [AdminService, PushService],
})
export class AdminModule {}
