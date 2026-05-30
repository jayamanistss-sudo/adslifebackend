import { Module } from '@nestjs/common';
import { SpotlightController } from './spotlight.controller';

@Module({ controllers: [SpotlightController] })
export class SpotlightModule {}
