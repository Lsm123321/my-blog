import { atom } from 'jotai'

// 全站搜索命令面板（Ctrl+K）开关：头部按钮与面板组件共享
export const searchPaletteAtom = atom(false)
