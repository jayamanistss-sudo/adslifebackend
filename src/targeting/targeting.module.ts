import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TargetingController } from './targeting.controller';
import { UserPreference } from '../entities/user-preference.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserPreference])],
  controllers: [TargetingController],
})
export class TargetingModule {}
