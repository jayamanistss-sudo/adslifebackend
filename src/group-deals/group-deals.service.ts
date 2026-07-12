import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, LessThan, Repository } from 'typeorm';
import { GroupDeal, GroupDealStatus } from '../entities/group-deal.entity';
import { GroupDealMember } from '../entities/group-deal-member.entity';
import { Offer } from '../entities/offer.entity';
import { Vendor } from '../entities/vendor.entity';
import { MonitoringService } from '../monitoring/monitoring.service';
import { isPrimaryInstance } from '../common/utils/cron-guard';
import { CreateGroupDealDto } from './dto/create-group-deal.dto';

@Injectable()
export class GroupDealsService {
  private readonly logger = new Logger(GroupDealsService.name);

  constructor(
    @InjectRepository(GroupDeal) private readonly groupDealRepo: Repository<GroupDeal>,
    @InjectRepository(GroupDealMember) private readonly memberRepo: Repository<GroupDealMember>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly monitoring: MonitoringService,
  ) {}

  async create(userId: number, userRole: string, dto: CreateGroupDealDto) {
    if (userRole === 'admin') {
      const offer = await this.offerRepo.findOne({ where: { id: dto.offer_id }, select: ['id'] });
      if (!offer) throw new NotFoundException('Offer not found');
    } else {
      const vendor = await this.vendorRepo.findOne({ where: { user_id: userId }, select: ['id'] });
      if (!vendor) throw new ForbiddenException('Vendor profile not found');
      const offer = await this.offerRepo.findOne({ where: { id: dto.offer_id, vendor_id: vendor.id }, select: ['id'] });
      if (!offer) throw new NotFoundException('Offer not found or does not belong to your vendor profile');
    }

    // Nothing enforced max_members >= min_members — a deal created with e.g.
    // min_members=10, max_members=5 fills up (join() caps at max_members)
    // and can never reach FULFILLED, silently stranding every member who
    // committed until the hourly expiry cron marks it EXPIRED.
    if (dto.max_members != null && dto.max_members < dto.min_members) {
      throw new BadRequestException('max_members must be greater than or equal to min_members');
    }

    const hours = dto.duration_hours ?? 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const deal = await this.groupDealRepo.save({
      offer_id: dto.offer_id,
      min_members: dto.min_members,
      max_members: dto.max_members ?? null,
      status: GroupDealStatus.ACTIVE,
      expires_at: expiresAt,
    });
    return { id: deal.id, offer_id: dto.offer_id, min_members: dto.min_members, expires_in_hours: hours };
  }

  async getActive(_lat: number, _lng: number) {
    return this.groupDealRepo
      .createQueryBuilder('gd')
      .innerJoin(Offer, 'o', 'o.id = gd.offer_id')
      .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
      .select([
        'gd.*',
        'o.title AS offer_title',
        'o.image_url AS image_url',
        'o.discount_percent AS discount_percent',
        'v.business_name AS business_name',
        'v.city AS vendor_city',
        '(SELECT COUNT(*) FROM group_deal_members gdm WHERE gdm.deal_id = gd.id) AS current_members',
      ])
      .where("gd.status = 'active'")
      .andWhere('gd.expires_at > NOW()')
      .orderBy('gd.created_at', 'DESC')
      .getRawMany();
  }

  async join(userId: number, dealId: number) {
    const deal = await this.groupDealRepo.findOne({
      where: { id: dealId, status: GroupDealStatus.ACTIVE },
    });
    if (!deal || deal.expires_at < new Date()) throw new NotFoundException('Group deal not found or expired');

    const currentMembers = await this.dataSource.transaction(async (manager) => {
      // Row-lock the group deal to prevent concurrent over-subscription
      const lockedDeal = await manager
        .getRepository(GroupDeal)
        .createQueryBuilder('gd')
        .setLock('pessimistic_write')
        .where('gd.id = :id', { id: dealId })
        .getOne();
      if (lockedDeal?.status !== GroupDealStatus.ACTIVE || lockedDeal.expires_at < new Date()) {
        throw new NotFoundException('Group deal not found or expired');
      }

      const memberRepo = manager.getRepository(GroupDealMember);
      const existing = await memberRepo.findOne({ where: { deal_id: dealId, user_id: userId } });
      if (existing) throw new BadRequestException('Already joined this deal');

      if (lockedDeal.max_members != null) {
        const cnt = await memberRepo.count({ where: { deal_id: dealId } });
        if (cnt >= lockedDeal.max_members) throw new BadRequestException('Group deal is full');
      }

      await memberRepo.save({ deal_id: dealId, user_id: userId });

      const cnt = await memberRepo.count({ where: { deal_id: dealId } });
      if (cnt >= lockedDeal.min_members) {
        await manager.getRepository(GroupDeal).update(dealId, { status: GroupDealStatus.FULFILLED });
      }
      return cnt;
    });

    return { joined: true, current_members: currentMembers, min_members: deal.min_members, fulfilled: currentMembers >= deal.min_members };
  }

  async status(dealId: number) {
    const deal = await this.groupDealRepo
      .createQueryBuilder('gd')
      .innerJoin(Offer, 'o', 'o.id = gd.offer_id')
      .select([
        'gd.*',
        'o.title AS offer_title',
        'o.discount_percent AS discount_percent',
        '(SELECT COUNT(*) FROM group_deal_members gdm WHERE gdm.deal_id = gd.id) AS current_members',
      ])
      .where('gd.id = :id', { id: dealId })
      .getRawOne();
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  // No admin-facing list/cancel existed at all — a feature with real
  // multi-user commitment and redemption stakes had no admin fallback.
  async adminList(status = '', page = 1, limit = 30) {
    const offset = (Math.max(page, 1) - 1) * limit;
    const qb = this.groupDealRepo
      .createQueryBuilder('gd')
      .innerJoin(Offer, 'o', 'o.id = gd.offer_id')
      .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
      .select([
        'gd.*',
        'o.title AS offer_title',
        'v.business_name AS business_name',
        '(SELECT COUNT(*) FROM group_deal_members gdm WHERE gdm.deal_id = gd.id) AS current_members',
      ]);
    if (status) qb.where('gd.status = :status', { status });

    const total = await qb.getCount();
    const deals = await qb
      .orderBy('gd.created_at', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany();
    return { deals, total };
  }

  async adminCancel(dealId: number, adminId: number, note?: string) {
    const deal = await this.groupDealRepo.findOne({ where: { id: dealId } });
    if (!deal) throw new NotFoundException('Deal not found');
    if (deal.status !== GroupDealStatus.ACTIVE) {
      throw new BadRequestException('Only an active deal can be cancelled');
    }
    await this.groupDealRepo.update(dealId, { status: GroupDealStatus.CANCELLED });
    setImmediate(() => this.monitoring.logActivity({
      userId: adminId, role: 'admin', action: 'admin_group_deal_cancel',
      entityType: 'group_deal', entityId: dealId,
      description: `Admin cancelled group deal #${dealId}${note ? `: ${note}` : ''}`,
    }).catch(() => {}));
    return { cancelled: true };
  }

  // GroupDealStatus.EXPIRED was defined but nothing ever wrote it — an
  // unfulfilled deal just sat ACTIVE forever after its window passed.
  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleDeals(): Promise<void> {
    if (!isPrimaryInstance()) return;
    const result = await this.groupDealRepo.update(
      { status: GroupDealStatus.ACTIVE, expires_at: LessThan(new Date()) },
      { status: GroupDealStatus.EXPIRED },
    );
    if (result.affected) this.logger.log(`Marked ${result.affected} stale group deal(s) as expired`);
  }
}
