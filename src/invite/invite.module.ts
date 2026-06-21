import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InviteController } from './invite.controller';
import { InviteService } from './invite.service';
import { User } from '../entities/user.entity';
import { Offer } from '../entities/offer.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Offer]), MailModule],
  controllers: [InviteController],
  providers: [InviteService],
})
export class InviteModule {}
