import { Injectable, UnauthorizedException } from '@nestjs/common'
import { sign, verify } from 'jsonwebtoken'

import { PrismaService } from '../../prisma/prisma.service'
import { hashPassword, verifyPassword } from '../../shared/password'

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 天

// 登录限速：同一 用户名+IP 连续失败 5 次锁 15 分钟（内存态，重启即清零，够单人博客用）
const MAX_LOGIN_FAILS = 5
const LOGIN_LOCK_MS = 15 * 60 * 1000

@Injectable()
export class AdminAuthService {
  private readonly loginFails = new Map<string, { count: number; lockedUntil: number }>()

  // 改密时间戳：早于它的 token 一律失效（token 吊销语义），内存缓存 + Setting 表持久化
  private passwordChangedAt = 0

  constructor(private readonly prisma: PrismaService) {}

  private secret() {
    return process.env.JWT_SECRET || 'dev-only-insecure-secret'
  }

  async onModuleInit() {
    try {
      const row = await this.prisma.setting.findUnique({ where: { key: 'auth:password_changed_at' } })
      this.passwordChangedAt = row ? Number(row.value) || 0 : 0
    } catch {
      // 首次启动时 db push 尚未执行（表还不存在），视作从未改过密码
      this.passwordChangedAt = 0
    }
  }

  // 登录入口统一走这里：先过限速闸门再校验密码
  async signIn(username: string, password: string, ip: string) {
    const key = `${username}|${ip}`
    const record = this.loginFails.get(key)
    if (record && record.lockedUntil > Date.now()) {
      const waitSec = Math.ceil((record.lockedUntil - Date.now()) / 1000)
      throw new UnauthorizedException(`失败次数过多，请 ${waitSec} 秒后再试`)
    }

    const owner = await this.prisma.owner.findUnique({ where: { username } })
    if (!owner || !owner.password) {
      this.recordLoginFail(key, record)
      throw new UnauthorizedException('用户名或密码错误')
    }

    const result = verifyPassword(password, owner.password)
    if (!result.ok) {
      this.recordLoginFail(key, record)
      throw new UnauthorizedException('用户名或密码错误')
    }

    this.loginFails.delete(key)
    // 命中的是历史明文密码：顺势升级为 scrypt 哈希，老部署无感迁移
    if (result.isLegacy) {
      await this.prisma.owner.update({
        where: { id: owner.id },
        data: { password: hashPassword(password), modified: new Date() },
      })
    }

    const token = sign({ sub: owner.id, name: owner.name }, this.secret(), {
      expiresIn: TOKEN_TTL_SECONDS,
    })

    return {
      token,
      expiresIn: TOKEN_TTL_SECONDS,
      name: owner.name,
      avatar: owner.avatar,
    }
  }

  // 失败计数：连续失败达阈值则锁定一段时间，防止在线暴力破解
  private recordLoginFail(key: string, record?: { count: number; lockedUntil: number }) {
    const next = { count: (record?.count || 0) + 1, lockedUntil: 0 }
    if (next.count >= MAX_LOGIN_FAILS) {
      next.lockedUntil = Date.now() + LOGIN_LOCK_MS
      next.count = 0
    }
    this.loginFails.set(key, next)
  }

  // 修改密码：验证旧密码 → 哈希入库 → 旧 token 全部失效
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const owner = await this.prisma.owner.findUnique({ where: { id: userId } })
    if (!owner || !owner.password) throw new UnauthorizedException('账号不存在')

    const result = verifyPassword(oldPassword, owner.password)
    if (!result.ok) throw new UnauthorizedException('旧密码错误')

    if (!newPassword || newPassword.length < 8) {
      throw new UnauthorizedException('新密码至少 8 位')
    }

    const changedAt = Math.floor(Date.now() / 1000)
    await this.prisma.$transaction([
      this.prisma.owner.update({
        where: { id: owner.id },
        data: { password: hashPassword(newPassword), modified: new Date() },
      }),
      this.prisma.setting.upsert({
        where: { key: 'auth:password_changed_at' },
        update: { value: String(changedAt) },
        create: { key: 'auth:password_changed_at', value: String(changedAt) },
      }),
    ])
    this.passwordChangedAt = changedAt
    return { ok: true }
  }

  verify(token: string): boolean {
    try {
      const payload = verify(token, this.secret()) as { iat?: number }
      // 签名有效但签发于改密之前 → 已被吊销
      if (this.passwordChangedAt && (payload.iat || 0) < this.passwordChangedAt) return false
      return true
    } catch {
      return false
    }
  }

  // 验签并返回 payload（改密码等需要知道"当前是谁"的端点用）
  decode(token: string): { sub: string; name: string } | null {
    try {
      const payload = verify(token, this.secret()) as { sub?: string; name?: string; iat?: number }
      if (!payload.sub) return null
      if (this.passwordChangedAt && (payload.iat || 0) < this.passwordChangedAt) return null
      return { sub: payload.sub, name: payload.name || '' }
    } catch {
      return null
    }
  }
}
