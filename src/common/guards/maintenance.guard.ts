import { Injectable, CanActivate, ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSetting } from '../../entities/site-setting.entity';

// maintenance_mode previously existed in site_settings, accepted by the
// admin UI's own DTO, and read/enforced absolutely nowhere in the backend —
// an admin flipping it believed it did something; it didn't. Deliberately
// conservative: only ever blocks non-admin write requests, and always lets
// auth endpoints through, so a bad flag can never lock out the admin who'd
// need to log in and turn it back off, or break read-only browsing.
// Exact paths only — a prefix like '/api/auth/' would silently exempt
// every authenticated action under /auth/ (checkin, profile, location…),
// not just the login/register endpoints this is meant to keep reachable.
const ALWAYS_ALLOWED_EXACT_PATHS = ['/api/auth/login', '/api/auth/google', '/api/auth/register'];

@Injectable()
export class MaintenanceGuard implements CanActivate {
  private cachedEnabled = false;
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 10_000;

  constructor(
    @InjectRepository(SiteSetting) private readonly settingRepo: Repository<SiteSetting>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.method === 'GET') return true;
    if (req.user?.role === 'admin') return true;
    const path: string = req.path ?? req.url ?? '';
    if (ALWAYS_ALLOWED_EXACT_PATHS.some((p) => path === p || path.startsWith(`${p}?`))) return true;

    if (Date.now() - this.cacheLoadedAt > this.CACHE_TTL_MS) {
      const row = await this.settingRepo.findOne({ where: { key: 'maintenance_mode' } });
      this.cachedEnabled = row?.value === '1';
      this.cacheLoadedAt = Date.now();
    }
    if (this.cachedEnabled) {
      throw new ServiceUnavailableException('AdsLife is temporarily under maintenance. Please try again shortly.');
    }
    return true;
  }
}
