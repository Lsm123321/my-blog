import { createCipheriv, createHash } from 'crypto'

import { Injectable, NotFoundException, Logger } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'
import { isSafeMusicUrl } from '../../shared/url-guard'
import { QqMusicService } from './qq-music.service'

// 网易云请求头：伪装浏览器 + Referer 防盗链，Cookie 里 os=pc 保证返回正常码率
const NETEASE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly qq: QqMusicService,
  ) {}

  async getPlaylist() {
    const tracks = await this.prisma.musicTrack.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    })
    // 不直接暴露本地文件路径，统一走 /music/stream/:id
    return {
      data: tracks.map((t) => ({
        id: t.id,
        name: t.name,
        artist: t.artist,
        album: t.album,
        cover: t.cover,
        source: t.source,
        streamUrl: `/music/stream/${t.id}`,
      })),
    }
  }

  async getLyric(id: string) {
    const track = await this.prisma.musicTrack.findUnique({ where: { id } })
    if (!track) return ''
    if (track.lrc) return track.lrc
    // 歌词懒加载自愈：批量收录的歌没有词，首次被播放时向上游补抓一次并落库，之后直接命中
    if (track.source === 'netease' && track.songId) {
      const lrc = await this.fetchNeteaseLyric(track.songId)
      if (lrc) await this.prisma.musicTrack.update({ where: { id }, data: { lrc } })
      return lrc
    }
    if (track.source === 'qq' && track.songId) {
      const lrc = await this.qq.getLyric(track.songId).catch(() => '')
      if (lrc) await this.prisma.musicTrack.update({ where: { id }, data: { lrc } })
      return lrc
    }
    return ''
  }

  // 网易云歌词接口（明文 GET，无需登录）
  private async fetchNeteaseLyric(songId: string): Promise<string> {
    try {
      const res = await fetch(
        `https://music.163.com/api/song/lyric?id=${songId}&lv=-1&kv=-1&tv=-1`,
        { headers: { 'User-Agent': NETEASE_UA, Referer: 'https://music.163.com/' }, signal: AbortSignal.timeout(6000) },
      )
      if (!res.ok) return ''
      return (await res.json() as any)?.lrc?.lyric || ''
    } catch {
      return ''
    }
  }

  async getTrack(id: string) {
    const track = await this.prisma.musicTrack.findUnique({ where: { id } })
    if (!track || !track.enabled) throw new NotFoundException('曲目不存在')
    return track
  }

  // 网易云音质档位 → eapi level 降级阶梯（与官方客户端 8 档对齐）
  // 高阶档（hires/环绕声/杜比等）是会员权益：无 Cookie 或非会员时接口会自动降级下发试听，
  // 所以按阶梯逐档请求，最终拿不到地址才算不可播
  private static readonly QUALITY_LADDER: Record<string, string[]> = {
    standard: ['standard'],
    exhigh: ['exhigh', 'standard'],
    lossless: ['lossless', 'exhigh', 'standard'],
    hires: ['hires', 'lossless', 'exhigh', 'standard'],
    jyeffect: ['jyeffect', 'lossless', 'exhigh', 'standard'],
    sky: ['sky', 'lossless', 'exhigh', 'standard'],
    dolby: ['dolby', 'lossless', 'exhigh', 'standard'],
    jymaster: ['jymaster', 'lossless', 'exhigh', 'standard'],
  }

  // 解析网易云真实播放地址：走官方客户端同款的 eapi 加密接口（v1），支持全部 8 档 level。
  // VIP 歌未配 Cookie 时会降级为 45s 试听；配 NETEASE_COOKIE 后按收录音质下发完整/高音质地址。
  // 阶梯逐档重试后仍拿不到地址（下架/无版权）才返回 null，由调用方回退官方外链
  async resolveNeteaseUrl(songId: string, quality?: string): Promise<string | null> {
    const ladder = MusicService.QUALITY_LADDER[quality || ''] || MusicService.QUALITY_LADDER.exhigh
    for (const level of ladder) {
      const url = await this.tryResolveNeteaseUrl(songId, level)
      if (url) return url
    }
    return null
  }

  // eapi 加密：固定 AES-128-ECB 密钥 + md5 摘要，与官方客户端、Suxiaoqinx/Netease_url 同一套方案
  private eapiParams(path: string, payload: Record<string, unknown>): string {
    const message = `nobody${path}use${JSON.stringify(payload)}md5forencrypt`
    const digest = createHash('md5').update(message).digest('hex')
    const data = `${path}-36cd479b6b5-${JSON.stringify(payload)}-36cd479b6b5-${digest}`
    const cipher = createCipheriv('aes-128-ecb', 'e82ckenh8dichen8', null)
    return cipher.update(data, 'utf8', 'hex') + cipher.final('hex')
  }

  // 单档尝试：拿不到地址（下架/无版权/音质无权限）返回 null
  private async tryResolveNeteaseUrl(songId: string, level: string): Promise<string | null> {
    try {
      const path = '/api/song/enhance/player/url/v1'
      const cookie =
        'os=pc; appver=2.10.13' + (process.env.NETEASE_COOKIE ? `; ${process.env.NETEASE_COOKIE}` : '')
      const payload = {
        ids: [Number(songId)],
        level,
        encodeType: level === 'dolby' ? 'mp4' : 'flac',
        header: JSON.stringify({
          os: 'pc',
          appver: '2.10.13',
          osver: 'Microsoft-Windows-10',
          deviceId: 'pyncm!',
        }),
      }
      const res = await fetch('https://interface3.music.163.com/eapi/song/enhance/player/url/v1', {
        method: 'POST',
        headers: {
          'User-Agent': NETEASE_UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookie,
        },
        body: 'params=' + this.eapiParams(path, payload),
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return null
      const json = (await res.json()) as any
      const url: unknown = json?.data?.[0]?.url
      if (typeof url !== 'string' || !url || !isSafeMusicUrl(url)) return null
      // 统一升级 https，避免前台 https 部署后被浏览器按混合内容拦截
      return url.replace(/^http:\/\//, 'https://')
    } catch (e) {
      this.logger.warn(`网易云播放地址解析失败: ${e}`)
      return null
    }
  }

  // ---- 访客播放排行（Setting KV 存储，无需建表迁移）----
  private static readonly RANKING_KEY = 'music_play_ranking'
  private static readonly RANKING_MAX = 200

  /** 访客播放计数 +1（同曲累计） */
  async reportPlay(dto: { id?: string; name?: string; artist?: string }) {
    const id = String(dto?.id || '').trim()
    if (!id) return { ok: false }
    const name = String(dto?.name || '未知歌曲').slice(0, 200)
    const artist = String(dto?.artist || '未知歌手').slice(0, 200)

    const row = await this.prisma.setting.findUnique({
      where: { key: MusicService.RANKING_KEY },
    })
    let list: { id: string; name: string; artist: string; count: number }[] = []
    try {
      list = JSON.parse(row?.value || '[]')
    } catch {
      list = []
    }
    const hit = list.find((item) => item.id === id)
    if (hit) {
      hit.count += 1
      hit.name = name
      hit.artist = artist
    } else {
      list.push({ id, name, artist, count: 1 })
      // 榜单池超限时保留高计数曲目（防无限灌水膨胀）
      if (list.length > MusicService.RANKING_MAX) {
        list.sort((a, b) => b.count - a.count)
        list = list.slice(0, MusicService.RANKING_MAX)
      }
    }
    await this.prisma.setting.upsert({
      where: { key: MusicService.RANKING_KEY },
      update: { value: JSON.stringify(list) },
      create: { key: MusicService.RANKING_KEY, value: JSON.stringify(list) },
    })
    return { ok: true }
  }

  /** 播放次数排行榜（按次数降序） */
  async playRanking(limit = 20) {
    const row = await this.prisma.setting.findUnique({
      where: { key: MusicService.RANKING_KEY },
    })
    let list: { id: string; name: string; artist: string; count: number }[] = []
    try {
      list = JSON.parse(row?.value || '[]')
    } catch {
      list = []
    }
    const cap = Math.min(50, Math.max(1, Number(limit) || 20))
    return list.sort((a, b) => b.count - a.count).slice(0, cap)
  }
}
