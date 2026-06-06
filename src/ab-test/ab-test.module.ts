import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbTestController } from './ab-test.controller';
import { AbTestService } from './ab-test.service';
import { AbTest } from '../entities/ab-test.entity';
import { UserInteraction } from '../entities/user-interaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AbTest, UserInteraction])],
  controllers: [AbTestController],
  providers: [AbTestService],
})
export class AbTestModule {}
