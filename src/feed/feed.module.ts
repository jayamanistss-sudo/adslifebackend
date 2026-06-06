import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { Offer } from '../entities/offer.entity';
import { UserPreference } from '../entities/user-preference.entity';
import { SavedOffer } from '../entities/saved-offer.entity';
import { UserInteraction } from '../entities/user-interaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Offer, UserPreference, SavedOffer, UserInteraction])],
  controllers: [FeedController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}
