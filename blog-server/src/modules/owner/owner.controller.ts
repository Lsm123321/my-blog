import { Controller, Get, Post } from '@nestjs/common'

import { OwnerService } from './owner.service'

@Controller()
export class OwnerController {
  constructor(private readonly service: OwnerService) {}

  @Get('owner')
  getOwner() {
    return this.service.getOwnerModel()
  }

  // 前端每次渲染都调：返回游客态，隐藏站长功能
  @Get('owner/check_logged')
  checkLogged() {
    return { ok: 0, isGuest: true }
  }

  @Get('owner/allow-login')
  allowLogin() {
    return { password: true, passkey: false }
  }

  // ---- auth stub：不实现 OAuth，返回空态即隐藏登录入口 ----

  @Get('auth/session')
  getSession() {
    return null
  }

  @Get('auth/get-session')
  getBetterAuthSession() {
    return null
  }

  @Get('auth/providers')
  getProviders() {
    return { data: [] }
  }

  @Post('auth/sign-out')
  signOut() {
    return { ok: true }
  }
}
