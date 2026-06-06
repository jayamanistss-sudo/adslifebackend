import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorApplyController } from './vendor-apply.controller';
import { VendorApplication } from '../entities/vendor-application.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VendorApplication])],
  controllers: [VendorApplyController],
})
export class VendorApplyModule {}
