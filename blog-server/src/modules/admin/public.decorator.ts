import { SetMetadata } from '@nestjs/common'

// 标记无需登录的端点（登录本身）
export const IS_PUBLIC_KEY = 'isAdminPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
