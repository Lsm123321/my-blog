import { randomInt } from 'crypto'

import { Injectable, Logger } from '@nestjs/common'

import { isSafeMusicUrl } from '../../shared/url-guard'

// QQ 音乐公开接口封装，接口选型参考 Suxiaoqinx/tencent_url（MIT）的实现思路：
// - 收录信息（fcg_play_single_song）与歌词（fcg_query_lyric_new）无需登录
// - 播放地址走 vkey 接口，未登录时主流 VIP 歌曲 purl 为空；
//   在环境变量 QQ_MUSIC_COOKIE 配置网页版登录 Cookie 后可稳定解析（会员还能拿到高音质）
const QQ_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

@Injectable()
export class QqMusicService {
  private readonly logger = new Logger(QqMusicService.name)

  // 播放解析用的登录 Cookie（可选），格式同浏览器 Cookie 串
  private get cookie() {
    return process.env.QQ_MUSIC_COOKIE || ''
  }

  // 是否配置了 Cookie（搜索接口必须登录，前端据此提示）
  get hasCookie() {
    return Boolean(this.cookie)
  }

  // 从 Cookie 提取数字 uin：登录态下请求体的 comm.uin 必须与 Cookie 一致，
  // 写 0 会被服务端当作未登录拒绝返回数据（此前配好 Cookie 仍搜不到的原因）
  private get uin(): string {
    const m = this.cookie.match(/uin=(?:o)?(\d+)/)
    return m ? m[1] : '0'
  }

  // 关键词搜索（SearchCgiService 必须带登录 Cookie，未配置时返回空列表）
  async search(keyword: string, limit = 12) {
    try {
      const res = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': QQ_UA,
          Referer: 'https://y.qq.com/',
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
        body: JSON.stringify({
          req_1: {
            method: 'DoSearchForQQMusicDesktop',
            module: 'music.search.SearchCgiService',
            param: { search_type: 0, query: keyword, page_num: 1, num_per_page: limit },
          },
          comm: { uin: this.hasCookie ? this.uin : 0, format: 'json', ct: 24, cv: 0 },
        }),
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return []
      const json = (await res.json()) as any
      const songs = json?.req_1?.data?.body?.song?.list || []
      return songs.map((s: any) => ({
        songMid: String(s.mid || ''),
        name: String(s.name || s.title || ''),
        artist: (s.singer || []).map((x: any) => x?.name).filter(Boolean).join('/') || '未知歌手',
        album: s.album?.name || '',
        cover: s.album?.mid
          ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.album.mid}.jpg`
          : '',
        vip: s.pay ? !s.pay.pay_play : false,
      }))
    } catch (e) {
      this.logger.warn(`QQ 搜索失败: ${e}`)
      return []
    }
  }

  // 按 songmid 查歌曲基础信息（歌名/歌手/专辑/封面）
  async getSongInfo(mid: string) {
    try {
      const res = await fetch('https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg', {
        method: 'POST',
        headers: {
          'User-Agent': QQ_UA,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `songmid=${encodeURIComponent(mid)}&platform=yqq&format=json`,
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return null
      const json = (await res.json()) as any
      const song = json?.data?.[0]
      if (!song?.mid) return null
      return {
        mid: song.mid as string,
        name: String(song.name || '未知歌曲'),
        artist: (song.singer || []).map((s: any) => s.name).filter(Boolean).join('/') || '未知歌手',
        album: song.album?.name || '',
        // 封面按专辑 mid 拼 QQ 官方图床地址（800x800）
        cover: song.album?.mid
          ? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${song.album.mid}.jpg`
          : '',
      }
    } catch (e) {
      this.logger.warn(`QQ 歌曲信息获取失败: ${e}`)
      return null
    }
  }

  // 歌词（该接口有防盗链，必须带 y.qq.com 的 Referer），返回 base64 需解码
  async getLyric(mid: string): Promise<string> {
    try {
      // 接口要求一个随机 loginUin 参数，未登录随机生成即可
      const loginUin = String(randomInt(1_000_000_000, 9_999_999_999))
      const res = await fetch(
        `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?format=json&loginUin=${loginUin}&songmid=${encodeURIComponent(mid)}`,
        { headers: { 'User-Agent': QQ_UA, Referer: 'https://y.qq.com/' }, signal: AbortSignal.timeout(6000) },
      )
      if (!res.ok) return ''
      const json = (await res.json()) as any
      return json?.lyric ? Buffer.from(json.lyric, 'base64').toString('utf8') : ''
    } catch {
      return '' // 歌词可选，失败不阻塞收录
    }
  }

  // 解析播放直链：先试 320k（M800）再退 128k（M500），付费歌/无权限时最后回退试听档（RS02，30 秒）
  // ——与网易云侧「VIP 歌回退试听」策略一致，保证付费歌也能收录播放
  async resolvePlayUrl(mid: string): Promise<string | null> {
    for (const prefix of ['M800', 'M500', 'RS02']) {
      const url = await this.requestVkey(mid, prefix)
      if (url) return url
    }
    return null
  }

  private async requestVkey(mid: string, prefix: string): Promise<string | null> {
    try {
      // filename 规则是「前缀 + songmid 出现两次 + 扩展名」，vkey 会在返回的 purl 里带上
      const filename = `${prefix}${mid}${mid}.mp3`
      const res = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': QQ_UA,
          Referer: 'https://y.qq.com/',
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
        body: JSON.stringify({
          req_1: {
            module: 'vkey.GetVkeyServer',
            method: 'CgiGetVkey',
            param: {
              filename: [filename],
              guid: '10000',
              songmid: [mid],
              songtype: [0],
              uin: this.hasCookie ? this.uin : '0',
              loginflag: 1,
              platform: '20',
            },
          },
          comm: { uin: this.hasCookie ? this.uin : 0, format: 'json', ct: 24, cv: 0 },
        }),
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return null
      const json = (await res.json()) as any
      const info = json?.req_1?.data?.midurlinfo?.[0]
      if (!info?.purl) return null
      // 最终地址 = CDN 域名（sip 列表）+ purl；统一升级 https，并过域名白名单校验
      const sip: string = json.req_1.data.sip?.[0] || 'https://isure.stream.qqmusic.qq.com/'
      const final = (sip + info.purl).replace(/^http:\/\//, 'https://')
      return isSafeMusicUrl(final) ? final : null
    } catch (e) {
      this.logger.warn(`QQ 播放地址解析失败: ${e}`)
      return null
    }
  }
}
