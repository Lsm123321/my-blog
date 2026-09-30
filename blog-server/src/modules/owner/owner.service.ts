import { Injectable } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class OwnerService {
  constructor(private readonly prisma: PrismaService) {}

  // 站长信息：字段对齐 mx-space 的 OwnerModel（postID/v 等空值字段是前端模型兼容需要）
  async getOwnerModel() {
    const owner = await this.prisma.owner.findFirst()
    if (!owner) return null
    let socialIds: Record<string, string> = {}
    try {
      socialIds = JSON.parse(owner.socialIds || '{}') ?? {}
    } catch {
      /* 忽略坏数据 */
    }
    return {
      id: owner.id,
      name: owner.name,
      username: owner.username,
      introduce: owner.introduce,
      mail: owner.mail,
      url: owner.url,
      avatar: owner.avatar,
      socialIds,
      created: owner.created,
      modified: owner.modified,
      v: 0,
      lastLoginTime: owner.modified,
      postID: '',
    }
  }
}
