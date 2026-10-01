import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// 站长密码哈希：scrypt（Node 内置，无需引入 bcrypt 原生依赖）
// 存储格式：scrypt$<salt hex>$<hash hex>；其它格式视为历史明文，登录成功后自动升级

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

// 返回是否匹配；isLegacy 标记命中的是旧明文（调用方应顺势升级为哈希存储）
export function verifyPassword(password: string, stored: string): { ok: boolean; isLegacy: boolean } {
  if (stored.startsWith('scrypt$')) {
    const [, saltHex, hashHex] = stored.split('$')
    if (!saltHex || !hashHex) return { ok: false, isLegacy: false }
    const expected = Buffer.from(hashHex, 'hex')
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    })
    // timingSafeEqual 要求两边等长，scrypt 输出长度即 expected.length，天然满足
    return { ok: timingSafeEqual(actual, expected), isLegacy: false }
  }
  // 历史明文密码：普通比对（迁移完成后不再走这里）
  return { ok: stored === password, isLegacy: true }
}
