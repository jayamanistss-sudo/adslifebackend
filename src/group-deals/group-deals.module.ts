import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupDealsController } from './group-deals.controller';
import { GroupDealsService } from './group-deals.service';
import { GroupDeal } from '../entities/group-deal.entity';
import { GroupDealMember } from '../entities/group-deal-member.entity';
import { Offer } from '../entities/offer.entity';
import { Vendor } from '../entities/vendor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GroupDeal, GroupDealMember, Offer, Vendor])],
  controllers: [GroupDealsController],
  providers: [GroupDealsService],
})
export class GroupDealsModule {}
