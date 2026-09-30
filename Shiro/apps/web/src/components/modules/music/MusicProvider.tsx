'use client'

import { useQuery } from '@tanstack/react-query'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { use, createContext, useContext, useEffect, useMemo, useRef } from 'react'

import { attachBeatEngine } from './beat-engine'
import { apiClient } from '~/lib/request'
import { API_URL } from '~/constants/env'

export type MusicTrack = {
  id: string
  name: string
  artist: string
  album: string
  cover: string
  source: 'netease' | 'local' | 'qq'
  streamUrl: string
}

// ---------- 状态 ----------
export type PlayMode = 'list' | 'one' | 'random'

const playingAtom = atom(false)
const currentIndexAtom = atom(0)
const expandedAtom = atom(false)
const progressAtom = atom({ current: 0, duration: 0 })
// 「本轮会话是否已经开始播放过」：迷你条只在开始播放后才出现（未播放前整体收起），
// 刻意不持久化——刷新页面后回到收起状态，避免出现不可播的幽灵组件
const startedAtom = atom(false)
// 播放模式与音量持久化（借鉴 Firefly 的可配置优点）
const playModeAtom = atomWithStorage<PlayMode>('music-play-mode', 'list')
const volumeAtom = atomWithStorage<number>('music-volume', 0.7)
// 淡入/淡出秒数（Mineradio 音量弹层同款默认 0.45s / 0.40s）
export const fadeInAtom = atomWithStorage<number>('music-fade-in', 0.45)
export const fadeOutAtom = atomWithStorage<number>('music-fade-out', 0.4)

const musicContext = createContext<{
  audioRef: React.RefObject<HTMLAudioElement | null>
  play: (index?: number) => void
  pause: () => void
  toggle: () => void
  next: () => void
  prev: () => void
  seek: (t: number) => void
  setPlayMode: (mode: PlayMode) => void
  setVolume: (v: number) => void
}>(null as any)

export const useMusicPlaying = () => useAtomValue(playingAtom)
export const useMusicExpanded = () => useAtomValue(expandedAtom)
export const useMusicProgress = () => useAtomValue(progressAtom)
export const useMusicPlayMode = () => useAtomValue(playModeAtom)
export const useMusicVolume = () => useAtomValue(volumeAtom)
export const useMusicControls = () => use(musicContext)
// 本轮会话是否已经开始播放过（迷你条收起/展开的开关）
export const useMusicStarted = () => useAtomValue(startedAtom)
// 淡入/淡出秒数（起播渐强、暂停渐弱用）
export const useMusicFades = () => {
  const fadeIn = useAtomValue(fadeInAtom)
  const fadeOut = useAtomValue(fadeOutAtom)
  const setFadeIn = useSetAtom(fadeInAtom)
  const setFadeOut = useSetAtom(fadeOutAtom)
  return useMemo(
    () => ({ fadeIn, fadeOut, setFadeIn, setFadeOut }),
    [fadeIn, fadeOut, setFadeIn, setFadeOut],
  )
}

// 网易云/QQ 图床校验 Referer，浏览器直连 403（连 no-referrer 都拦）→ 统一走后端封面代理
const HOTLINK_HOSTS = /(music\.126\.net|gtimg\.cn|imgcache\.qq\.com)/
export const rewriteCoverUrl = (url: string) =>
  url && HOTLINK_HOSTS.test(url) ? `${API_URL}/music/cover?url=${encodeURIComponent(url)}` : url

export const useMusicPlaylist = () =>
  useQuery({
    queryKey: ['music-playlist'],
    queryFn: async () => {
      const res = (await apiClient.proxy.music.playlist.get()) as any
      return (res?.data || []) as MusicTrack[]
    },
    // 缓存里的数据可能仍是相对路径，消费端统一转换为后端绝对地址
    select: (data: MusicTrack[]) =>
      data.map((t) => ({
        ...t,
        streamUrl: `${API_URL}${t.streamUrl}`,
        cover: rewriteCoverUrl(t.cover),
      })),
    enabled: typeof window !== 'undefined',
    // 不设缓存新鲜期：后台增删歌曲后，切回前台标签页（窗口聚焦）即自动重取歌单，接近实时同步
    staleTime: 0,
  })

export const useMusicCurrent = (): { track: MusicTrack | null; index: number } => {
  const { data: playlist = [] } = useMusicPlaylist()
  const index = useAtomValue(currentIndexAtom)
  return { track: playlist[index] ?? null, index }
}

// ---------- Provider：单例 audio 元素 + 状态同步 ----------
export const MusicProvider: Component = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const setPlaying = useSetAtom(playingAtom)
  const setProgress = useSetAtom(progressAtom)
  const setExpanded = useSetAtom(expandedAtom)
  const { data: playlist = [] } = useMusicPlaylist()
  const playing = useAtomValue(playingAtom)
  const playMode = useAtomValue(playModeAtom)
  const volume = useAtomValue(volumeAtom)
  const currentIndex = useAtomValue(currentIndexAtom)
  const setCurrentIndex = useSetAtom(currentIndexAtom)
  const setPlayModeAtom = useSetAtom(playModeAtom)
  const setVolumeAtom = useSetAtom(volumeAtom)
  const setStarted = useSetAtom(startedAtom)
  const fadeIn = useAtomValue(fadeInAtom)
  const fadeOut = useAtomValue(fadeOutAtom)
  // 淡入淡出秒数走 ref：rAF 闭包里读最新值
  const fadeInRef = useRef(fadeIn)
  fadeInRef.current = fadeIn
  const fadeOutRef = useRef(fadeOut)
  fadeOutRef.current = fadeOut

  // ---- 淡入/淡出引擎（Mineradio 音量弹层的 Fade In/Out）：rAF 音量坡道，随时可打断 ----
  const rampRef = useRef<number | null>(null)
  const cancelRamp = () => {
    if (rampRef.current != null) cancelAnimationFrame(rampRef.current)
    rampRef.current = null
  }
  const rampVolume = (
    from: number,
    to: number,
    seconds: number,
    onDone?: () => void,
  ) => {
    const audio = audioRef.current
    if (!audio) return
    cancelRamp()
    if (seconds <= 0.05) {
      audio.volume = to
      onDone?.()
      return
    }
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / (seconds * 1000))
      const eased = k * k * (3 - 2 * k) // smoothstep，比线性坡道更顺耳
      const a = audioRef.current
      if (!a) return
      a.volume = Math.min(1, Math.max(0, from + (to - from) * eased))
      if (k < 1) rampRef.current = requestAnimationFrame(tick)
      else {
        rampRef.current = null
        onDone?.()
      }
    }
    rampRef.current = requestAnimationFrame(tick)
  }

  // 各类回调通过 ref 读取最新值，避免闭包过期
  const playlistRef = useRef(playlist)
  playlistRef.current = playlist
  const playModeRef = useRef(playMode)
  playModeRef.current = playMode
  const currentIndexRef = useRef(currentIndex)
  currentIndexRef.current = currentIndex
  const playingRef = useRef(playing)
  playingRef.current = playing
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  // 随机下一首（避开当前曲）
  const randomNext = () => {
    const len = playlistRef.current.length
    if (len <= 1) return
    let next = currentIndexRef.current
    while (next === currentIndexRef.current) next = Math.floor(Math.random() * len)
    playByIndex(next)
  }

  const playByIndex = (index: number) => {
    const list = playlistRef.current
    if (!list.length) return
    let next = index
    if (next >= list.length) next = 0
    if (next < 0) next = list.length - 1
    const prevIndex = currentIndexRef.current
    currentIndexRef.current = next
    setCurrentIndex(next)
    // 一旦开始播放，迷你条此后在所有页面常驻（直到进入 /music 沉浸页让位）
    setStarted(true)
    const audio = audioRef.current
    if (audio) {
      // 同曲续播：不重设 src，避免暂停后点播放被从头重播
      const resume = next === prevIndex && audio.src.endsWith(list[next].streamUrl)
      if (!resume) audio.src = list[next].streamUrl
      cancelRamp()
      // 每次起播都淡入：从 0 坡道回用户音量（MineRadio Fade In 行为）
      audio.volume = 0
      audio.play().catch(() => setPlaying(false))
      rampVolume(0, volumeRef.current, fadeInRef.current)
    }
    setPlaying(true)
  }

  const play = (index?: number) => playByIndex(index ?? currentIndexRef.current)
  const pause = () => {
    const audio = audioRef.current
    if (!audio || fadeOutRef.current <= 0.05) {
      audio?.pause()
      setPlaying(false)
      return
    }
    // 先淡出到 0 再真正暂停（MineRadio Fade Out），坡道期间再点播放可打断
    rampVolume(audio.volume, 0, fadeOutRef.current, () => {
      audioRef.current?.pause()
      setPlaying(false)
    })
  }
  const toggle = () => (playingRef.current ? pause() : play())
  const next = () => (playModeRef.current === 'random' ? randomNext() : playByIndex(currentIndexRef.current + 1))
  const prev = () => (playModeRef.current === 'random' ? randomNext() : playByIndex(currentIndexRef.current - 1))
  const seek = (t: number) => {
    if (audioRef.current) audioRef.current.currentTime = t
  }
  const setPlayMode = (mode: PlayMode) => setPlayModeAtom(mode)
  const setVolume = (v: number) => {
    setVolumeAtom(v)
    // 用户手动调音量 = 打断进行中的淡入淡出坡道
    cancelRamp()
    if (audioRef.current) audioRef.current.volume = v
  }

  // 音量变化同步到 audio 元素
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // 全局唯一音频元素：挂在 window 上。开发期 HMR / StrictMode 重挂 Provider 时
  // 直接复用同一实例，绝不产生第二个正在播放的 Audio（否则会出现两首歌同时在放）
  if (typeof window !== 'undefined' && !audioRef.current) {
    const win = window as unknown as { __mrAudio?: HTMLAudioElement }
    if (!win.__mrAudio) {
      win.__mrAudio = new Audio()
      // 节拍引擎：分析结果当前无可视消费者，保留备用（CORS 失败自动回退程序化节拍）
      attachBeatEngine(win.__mrAudio)
    }
    audioRef.current = win.__mrAudio
  }

  return (
    <musicContext.Provider
      value={{ audioRef, play, pause, toggle, next, prev, seek, setPlayMode, setVolume }}
    >
      {/* 音频事件同步到状态（单独组件，避免 Provider 重渲染影响） */}
      <AudioEvents audioRef={audioRef} />
      {/* 系统媒体面板（锁屏/耳机线控）联动 */}
      <MediaSessionSync />
      {children}
    </musicContext.Provider>
  )
}

// MediaSession：曲目标题/封面进系统媒体面板，播放暂停/切歌/拖动进度走线控
const MediaSessionSync: Component = () => {
  const { track } = useMusicCurrent()
  const playing = useMusicPlaying()
  const { play, pause, prev, next, seek } = useMusicControls()

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    if (!track) return
    ms.metadata = new MediaMetadata({
      title: track.name,
      artist: track.artist,
      album: track.album,
      artwork: track.cover ? [{ src: track.cover, sizes: '512x512' }] : [],
    })
  }, [track])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    ms.playbackState = playing ? 'playing' : 'paused'
    const noop = () => {}
    // play 支持可选 index 参数，这里必须包一层避免 MediaSession 的 details 对象被误传成 index
    ms.setActionHandler('play', () => play())
    ms.setActionHandler('pause', pause)
    ms.setActionHandler('previoustrack', prev)
    ms.setActionHandler('nexttrack', next)
    ms.setActionHandler('seekto', (d) => d.seekTime != null && seek(d.seekTime))
    return () => {
      ms.setActionHandler('play', noop)
      ms.setActionHandler('pause', noop)
      ms.setActionHandler('previoustrack', noop)
      ms.setActionHandler('nexttrack', noop)
      ms.setActionHandler('seekto', noop)
    }
  }, [playing, play, pause, prev, next, seek])

  return null
}

// 把 audio 事件同步到 jotai
const AudioEvents: Component<{ audioRef: React.RefObject<HTMLAudioElement | null> }> = ({
  audioRef,
}) => {
  const setPlaying = useSetAtom(playingAtom)
  const setProgress = useSetAtom(progressAtom)
  const playMode = useAtomValue(playModeAtom)
  const playModeRef = useRef(playMode)
  playModeRef.current = playMode
  const { next } = useMusicControls()

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () =>
      setProgress({ current: audio.currentTime, duration: audio.duration || 0 })
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    const onEnded = () => {
      // 播完：单曲循环重播，否则按列表循环/随机切下一首
      if (playModeRef.current === 'one') {
        audio.currentTime = 0
        audio.play().catch(() => {})
      } else {
        next()
      }
    }
    // 网易云/QQ 源播放失败（VIP/下架/未配 Cookie）时给出提示
    const onError = () => {
      if (audio.src.includes('/music/stream/')) {
        import('~/lib/toast').then(({ toast }) =>
          toast.error('该歌曲暂无可用播放源（VIP/下架），可在管理后台上传本地音频'),
        )
      }
      setPlaying(false)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onTime)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onTime)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('error', onError)
    }
  }, [audioRef, next, setPlaying, setProgress])
  return null
}

// 供外部强制重渲染使用（保留 context 语义）
export const useMusicPanelToggle = () => {
  const setExpanded = useSetAtom(expandedAtom)
  return useMemo(() => () => setExpanded((v) => !v), [setExpanded])
}
