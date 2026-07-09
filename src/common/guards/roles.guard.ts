import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip role check for routes marked @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    // requiredRoles may name a base role ('admin') or an admin sub-role
    // ('super') — @Roles('super') passes only for admins whose admin_role
    // is 'super', since a plain admin's user.role is 'admin', not 'super'.
    const matches = !!user && (
      requiredRoles.includes(user.role) ||
      (!!user.admin_role && requiredRoles.includes(user.admin_role))
    );
    if (!matches) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
