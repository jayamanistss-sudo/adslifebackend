import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashfreeController } from './cashfree.controller';
import { CashfreeService } from './cashfree.service';
import { SiteSetting } from '../entities/site-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SiteSetting])],
  controllers: [CashfreeController],
  providers: [CashfreeService],
  exports: [CashfreeService],
})
export class CashfreeModule {}
