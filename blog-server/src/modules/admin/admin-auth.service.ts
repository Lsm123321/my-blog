import { Injectable, UnauthorizedException } from '@nestjs/common'
import { sign, verify } from 'jsonwebtoken'

import { PrismaService } from '../../prisma/prisma.service'

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 天

@Injectable()
export class AdminAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private secret() {
    // JWT 密钥：生产必须通过环境变量注入
    return process.env.JWT_SECRET || 'dev-only-insecure-secret'
  }

  async signIn(username: string, password: string) {
    const owner = await this.prisma.owner.findUnique({ where: { username } })
    if (!owner || !owner.password || owner.password !== password) {
      throw new UnauthorizedException('用户名或密码错误')
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

  verify(token: string): boolean {
    try {
      verify(token, this.secret())
      return true
    } catch {
      return false
    }
  }
}
