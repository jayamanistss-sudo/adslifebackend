import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpotlightController } from './spotlight.controller';
import { SpotlightRequest } from '../entities/spotlight-request.entity';
import { Vendor } from '../entities/vendor.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SpotlightRequest, Vendor, User])],
  controllers: [SpotlightController],
})
export class SpotlightModule {}
