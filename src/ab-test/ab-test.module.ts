import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbTestController } from './ab-test.controller';
import { AbTestService } from './ab-test.service';
import { AbTest } from '../entities/ab-test.entity';
import { UserInteraction } from '../entities/user-interaction.entity';
import { Offer } from '../entities/offer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AbTest, UserInteraction, Offer])],
  controllers: [AbTestController],
  providers: [AbTestService],
})
export class AbTestModule {}
