import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FeedConfigService } from './feed-config.service';
import { Offer } from '../entities/offer.entity';
import { UserPreference } from '../entities/user-preference.entity';
import { SavedOffer } from '../entities/saved-offer.entity';
import { UserInteraction } from '../entities/user-interaction.entity';
import { SiteSetting } from '../entities/site-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Offer, UserPreference, SavedOffer, UserInteraction, SiteSetting])],
  controllers: [FeedController],
  providers: [FeedService, FeedConfigService],
  exports: [FeedService, FeedConfigService],
})
export class FeedModule {}
