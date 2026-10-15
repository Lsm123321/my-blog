import localFont from 'next/font/local'

// 站点字体自托管（public/fonts/*.woff2，源自 Google Fonts 的 latin 切片）：
// next/font/google 在 build 期要实时访问 fonts.googleapis.com，国内网络下构建必挂；
// 改用 next/font/local 后构建零网络依赖，运行时由本站 /_next/static 托管，
// 访客加载比外链 Google 更快更稳。中文字形与原方案一样走系统回退字体。
const sansFont = localFont({
  src: [
    { path: '../../public/fonts/manrope-latin-300-normal.woff2', weight: '300', style: 'normal' },
    { path: '../../public/fonts/manrope-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/manrope-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--app-font-sans',
  display: 'swap',
  fallback: ['Manrope'],
})

const serifFont = localFont({
  src: [{ path: '../../public/fonts/noto-serif-sc-latin-400-normal.woff2', weight: '400', style: 'normal' }],
  variable: '--app-font-serif',
  display: 'swap',
  fallback: ['Noto Serif SC', 'serif'],
})

export { sansFont, serifFont }
