import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { AdminAuthService } from './admin-auth.service'
import { IS_PUBLIC_KEY } from './public.decorator'

// 管理端点守卫：校验 Authorization: Bearer <token>；@Public() 标记的端点放行
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const req = context.switchToHttp().getRequest()
    const header: string = req.headers['authorization'] || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token || !this.auth.verify(token)) {
      throw new UnauthorizedException('请先登录管理后台')
    }
    return true
  }
}
