import { Module } from '@nestjs/common';
import { VendorApplyController } from './vendor-apply.controller';

@Module({ controllers: [VendorApplyController] })
export class VendorApplyModule {}
