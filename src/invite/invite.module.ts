import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InviteController } from './invite.controller';
import { InviteService } from './invite.service';
import { User } from '../entities/user.entity';
import { Offer } from '../entities/offer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Offer])],
  controllers: [InviteController],
  providers: [InviteService],
})
export class InviteModule {}
