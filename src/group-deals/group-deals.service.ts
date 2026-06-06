import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GroupDeal, GroupDealStatus } from '../entities/group-deal.entity';
import { GroupDealMember } from '../entities/group-deal-member.entity';
import { Offer } from '../entities/offer.entity';
import { Vendor } from '../entities/vendor.entity';

@Injectable()
export class GroupDealsService {
  constructor(
    @InjectRepository(GroupDeal) private readonly groupDealRepo: Repository<GroupDeal>,
    @InjectRepository(GroupDealMember) private readonly memberRepo: Repository<GroupDealMember>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(userId: number, userRole: string, dto: {
    offer_id: number; min_members: number; max_members?: number; duration_hours?: number;
  }) {
    if (userRole === 'admin') {
      const offer = await this.offerRepo.findOne({ where: { id: dto.offer_id }, select: ['id'] });
      if (!offer) throw new NotFoundException('Offer not found');
    } else {
      const vendor = await this.vendorRepo.findOne({ where: { user_id: userId }, select: ['id'] });
      if (!vendor) throw new ForbiddenException('Vendor profile not found');
      const offer = await this.offerRepo.findOne({ where: { id: dto.offer_id, vendor_id: vendor.id }, select: ['id'] });
      if (!offer) throw new NotFoundException('Offer not found or does not belong to your vendor profile');
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
}
