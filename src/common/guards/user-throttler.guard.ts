import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Tracks rate limits by authenticated user ID when available, falling back
 * to client IP. Prevents one user from exhausting the shared IP-based bucket
 * when multiple users share the same NAT/proxy IP.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.user?.user_id;
    return userId ? `user_${userId}` : (req.ip ?? 'unknown');
  }
}
