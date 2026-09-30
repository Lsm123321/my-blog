'use client'

/**
 * 节拍引擎：AnalyserNode 实时采样出 8 频段能量 + kick 包络 + 总能量。
 * 当前无可视消费者（音乐页由 Mineradio 自带分析驱动），保留备用；
 * CORS 拦住采样时直通输出并回退到程序化节拍，保证任何音源都有律动。
 */

export type SonicBands = {
  subBass: number
  bass: number
  lowMid: number
  mid: number
  highMid: number
  presence: number
  brilliance: number
  air: number
}

type BeatState = {
  level: number // 平滑后的节拍能量 0~1（kick 包络，视觉主驱动量）
  raw: number
  bands: SonicBands // 平滑后的 8 频段 0~1
  energy: number // 总能量 0~1
}

const state: BeatState = {
  level: 0,
  raw: 0,
  bands: { subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, presence: 0, brilliance: 0, air: 0 },
  energy: 0,
}

let analyser: AnalyserNode | null = null
let srcNode: MediaElementAudioSourceNode | null = null
let audioCtx: AudioContext | null = null
let freqData: Uint8Array<ArrayBuffer> | null = null
let audioEl: HTMLAudioElement | null = null
let raf = 0
let corsFallbackDone = false
let proceduralT = 0
let lastFrame = 0

// kick 瞬态检测状态（低频频谱通量 + 自适应阈值，MineRadio beat-analysis 的轻量版）
let prevLow = 0
let fluxAvg = 0.008
let kickEnv = 0

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// FFT bin 分段（fftSize 1024 → 512 bins，44.1kHz 下每 bin ≈ 43Hz）
// 频段边界按 Mineradio GROUND_BANDS 的听感分配：subBass 20-60 / bass 60-250 / lowMid 250-500 /
// mid 500-2k / highMid 2k-4k / presence 4k-6k / brilliance 6k-12k / air 12k+
const BAND_EDGES = [1, 2, 6, 12, 24, 47, 93, 186, 280] // bin 下标

const sampleBands = (): SonicBands | null => {
  if (!analyser || !freqData) return null
  analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>)
  const keys: (keyof SonicBands)[] = ['subBass', 'bass', 'lowMid', 'mid', 'highMid', 'presence', 'brilliance', 'air']
  const out = {} as SonicBands
  for (let b = 0; b < 8; b++) {
    const lo = BAND_EDGES[b]!
    const hi = BAND_EDGES[b + 1]!
    let sum = 0
    for (let i = lo; i < hi; i++) sum += freqData[i]!
    // 高频 bin 本底能量低，做感知补偿（高频×增益），与 Mineradio 频段均衡的思路一致
    const gain = 1 + b * 0.35
    out[keys[b]!] = clamp01((sum / (hi - lo) / 255) * gain)
  }
  return out
}

// 回退模式：按 128 BPM 合成的能量包络（四分音符脉冲 + 半拍起伏 + 缓慢波动）
const proceduralLevel = (dt: number) => {
  proceduralT += dt / 1000
  const beat = proceduralT * (128 / 60)
  const quarter = Math.pow(Math.max(0, Math.sin(beat * Math.PI)), 6)
  const half = Math.pow(Math.max(0, Math.sin(beat * Math.PI * 2)), 8) * 0.5
  const swell = 0.5 + 0.5 * Math.sin(beat * 0.11)
  return clamp01((quarter * 0.62 + half * 0.28) * (0.55 + 0.45 * swell) + 0.06)
}

// 低频瞬态检测：响度电平是慢包络（响段恒高，会把视觉钉在最大值——
// 这正是此前「音域回响恒亮恒乱」的原因），通量过阈值才是真正的「鼓点」。
// onset 快攻 + 指数衰减，输出 0~1 脉冲包络
const detectKick = (measured: SonicBands, dt: number) => {
  const low = measured.subBass * 0.6 + measured.bass * 0.4
  const flux = Math.max(0, low - prevLow)
  prevLow = low
  // 通量基线：~1s 滑动均值，鼓点 = 显著高出基线
  fluxAvg += (flux - fluxAvg) * Math.min(1, dt / 900)
  if (flux > Math.max(0.05, fluxAvg * 1.6)) {
    kickEnv = Math.min(1, kickEnv + flux * 2.4 + 0.16)
  }
  // ~450ms 半衰，收得快才能跟上节奏而不拖影
  kickEnv *= Math.pow(0.22, dt / 1000)
  return kickEnv
}

const loop = (now: number) => {
  const dt = Math.min(80, now - lastFrame || 16)
  lastFrame = now

  const playing = audioEl ? !audioEl.paused && !audioEl.ended : false
  const measured = playing ? sampleBands() : null

  let target: number
  if (measured) {
    // 真实频谱：kick = 低频瞬态脉冲；能量 = 全段平均
    const kick = detectKick(measured, dt)
    target = clamp01(Math.pow(kick, 0.85))
    // 各频段平滑（起振快回落缓，跟主包络一致）
    const rise = 0.42
    const fall = 0.1
    for (const k of Object.keys(measured) as (keyof SonicBands)[]) {
      const cur = state.bands[k]
      state.bands[k] = cur + (measured[k] - cur) * (measured[k] > cur ? rise : fall)
    }
    const energy =
      (Object.keys(measured) as (keyof SonicBands)[]).reduce((a, k) => a + state.bands[k], 0) / 8
    state.energy = energy
  } else if (playing) {
    // 程序化节拍：低频律动 + 假中高频起伏
    const kick = proceduralLevel(dt)
    target = kick
    const t = proceduralT
    const fake = {
      subBass: kick * 0.9,
      bass: kick * 0.75,
      lowMid: 0.25 + 0.2 * Math.sin(t * 2.1),
      mid: 0.3 + 0.22 * Math.sin(t * 1.4 + 1),
      highMid: 0.2 + 0.18 * Math.sin(t * 3.2 + 2),
      presence: 0.16 + 0.14 * Math.sin(t * 2.6 + 3),
      brilliance: 0.12 + 0.1 * Math.sin(t * 1.9 + 4),
      air: 0.1 + 0.08 * Math.sin(t * 1.1 + 5),
    }
    for (const k of Object.keys(fake) as (keyof SonicBands)[]) {
      const cur = state.bands[k]
      state.bands[k] = cur + (fake[k] - cur) * 0.2
    }
    state.energy = kick * 0.4 + 0.25
  } else {
    target = 0
    kickEnv *= 0.9
    for (const k of Object.keys(state.bands) as (keyof SonicBands)[]) {
      state.bands[k] *= 0.92
    }
    state.energy *= 0.92
  }

  state.raw = target
  // 平滑：起振快、回落缓（灯丝亮起/熄灭节奏）
  state.level += (target - state.level) * (target > state.level ? 0.38 : 0.085)

  raf = requestAnimationFrame(loop)
}

/**
 * 把舞台根元素的 --mr-beat CSS 变量按帧刷新（0~1），
 * 节拍视觉（粒子尺寸/歌词辉光/唱片呼吸）引用该变量即可零重渲染联动
 */
export const bindBeatCssVar = (el: HTMLElement) => {
  let id = 0
  const run = () => {
    el.style.setProperty('--mr-beat', state.level.toFixed(3))
    id = requestAnimationFrame(run)
  }
  run()
  return () => cancelAnimationFrame(id)
}

export const getBeatLevel = () => state.level
export const getKick = () => state.raw
export const getSonicBands = () => state.bands
export const getEnergy = () => state.energy

/** 接入音频元素：播放时启动分析（含 CORS 静音保护回退） */
export const attachBeatEngine = (audio: HTMLAudioElement) => {
  // 元素级防重复接线：MediaElementSource 对同一元素只能建一次，
  // window 单例复用 + HMR 重执行模块时二次 attach 会抛 InvalidStateError
  if ((audio as unknown as { __mrBeatAttached?: boolean }).__mrBeatAttached) {
    audioEl = audio
    return
  }
  ;(audio as unknown as { __mrBeatAttached?: boolean }).__mrBeatAttached = true
  audioEl = audio

  try {
    audio.crossOrigin = 'anonymous'
  } catch {
    /* 旧流已加载时设置 crossOrigin 可能报错，忽略——下一首生效 */
  }

  const init = () => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      const src = ctx.createMediaElementSource(audio)
      const node = ctx.createAnalyser()
      node.fftSize = 1024
      node.smoothingTimeConstant = 0.55
      src.connect(node)
      node.connect(ctx.destination)
      audioCtx = ctx
      srcNode = src
      analyser = node
      freqData = new Uint8Array(new ArrayBuffer(node.frequencyBinCount))
    } catch {
      analyser = null // 创建失败 → 程序化节拍兜底
    }
    if (!raf) (lastFrame = performance.now()), (raf = requestAnimationFrame(loop))
  }

  // CORS 静音保护：接入后若音频加载出错，判定该源无 CORS 头（crossOrigin=anonymous 导致拒绝）。
  // 此时把 MediaElementSource 直连输出恢复声音，并放弃频谱（走程序化节拍）
  const onError = () => {
    if (corsFallbackDone || !analyser || !srcNode || !audioCtx) return
    corsFallbackDone = true
    try {
      analyser.disconnect()
      srcNode.disconnect()
      srcNode.connect(audioCtx.destination) // 直通恢复输出
      analyser = null
      freqData = null
      audio.crossOrigin = null // 后续曲目不再带 CORS 请求头
    } catch {
      /* 保持程序化节拍 */
    }
  }

  audio.addEventListener('play', init, { once: true })
  audio.addEventListener('error', onError)
}
