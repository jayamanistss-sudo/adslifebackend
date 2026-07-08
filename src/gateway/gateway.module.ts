import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsGateway } from './notifications.gateway';

// Global — PushService is instantiated separately in 6 different feature
// modules and needs NotificationsGateway in all of them to emit realtime
// events; @Global() avoids importing GatewayModule into each one individually.
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
  providers: [NotificationsGateway],
  exports: [NotificationsGateway],
})
export class GatewayModule {}
