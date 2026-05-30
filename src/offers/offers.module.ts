import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { PushService } from '../services/push.service';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [GatewayModule],
  controllers: [OffersController],
  providers: [OffersService, PushService],
  exports: [OffersService],
})
export class OffersModule {}
