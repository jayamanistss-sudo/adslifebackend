import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { Referral } from '../entities/referral.entity';
import { User } from '../entities/user.entity';
import { SiteSetting } from '../entities/site-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Referral, User, SiteSetting])],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
