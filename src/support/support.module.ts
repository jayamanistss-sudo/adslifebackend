import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportTicket } from '../entities/support-ticket.entity';
import { SupportReply } from '../entities/support-reply.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket, SupportReply])],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
