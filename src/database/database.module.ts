import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('database.host'),
        port: config.get<number>('database.port'),
        database: config.get('database.name'),
        username: config.get('database.user'),
        password: config.get('database.pass'),
        entities: [],
        synchronize: false,
        charset: 'utf8mb4',
        timezone: '+00:00',
        extra: {
          connectionLimit: 10,
        },
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
