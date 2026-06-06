import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShareController } from './share.controller';
import { ShareEvent } from '../entities/share-event.entity';
import { Offer } from '../entities/offer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShareEvent, Offer])],
  controllers: [ShareController],
})
export class ShareModule {}
