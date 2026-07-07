import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { entities } from '../entities';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get<number>('database.port'),
        database: config.get('database.name'),
        username: config.get('database.user'),
        password: config.get('database.pass'),
        entities: entities,
        synchronize: false,
        // node-postgres pool options ("connectionLimit" is the MySQL driver's
        // key and was silently ignored — pg expects "max").
        extra: {
          max: 10,
          idleTimeoutMillis: 30000,
        },
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule implements OnModuleInit {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit() {
    try {
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS fuzzystrmatch');
      this.logger.log('PostgreSQL fuzzystrmatch extension ensured');
    } catch (err: any) {
      this.logger.warn(`Could not create fuzzystrmatch extension: ${err?.message}`);
    }
  }
}
