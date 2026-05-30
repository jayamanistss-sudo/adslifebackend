import { Module } from '@nestjs/common';
import { TargetingController } from './targeting.controller';

@Module({ controllers: [TargetingController] })
export class TargetingModule {}
