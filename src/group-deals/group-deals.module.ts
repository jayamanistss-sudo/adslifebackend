import { Module } from '@nestjs/common';
import { GroupDealsController } from './group-deals.controller';
import { GroupDealsService } from './group-deals.service';

@Module({ controllers: [GroupDealsController], providers: [GroupDealsService] })
export class GroupDealsModule {}
