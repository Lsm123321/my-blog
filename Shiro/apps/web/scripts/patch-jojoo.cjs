// 给 jojoo@0.3.0 打运行时补丁：ModelDataProvider 内部在"渲染期"写 jotai store，
// 触发 React 警告 "Cannot update a component while rendering a different component"。
// 改法：把渲染期一次性执行改成 useLayoutEffect（commit 阶段写，首帧绘制前数据仍就位）。
// 幂等：重复执行自动跳过；jojoo 不存在（依赖变动）时静默退出。
// 每次 pnpm install 后由 postinstall 自动重跑（node_modules 会被还原，需要重新打补丁）。
const fs = require('fs')
const path = require('path')

// 包根边界：所有读写都限制在 web 应用的 node_modules/jojoo 内
const ROOT = path.resolve(__dirname, '..')
const PKG_DIR = path.resolve(ROOT, 'node_modules', 'jojoo')
const FILES = [
  'create-atoms-context-BxGgAiVM.js', // CJS 产物
  'create-atoms-context-w167aiE7.js', // ESM 产物
]
const MARK = 'r.current||(r.current=!0,null==e||e())'

function patchFile(file, injectLayoutEffectImport) {
  const p = path.resolve(PKG_DIR, file)
  // 路径边界校验：拼出的目标必须仍在 jojoo 包目录内
  if (!p.startsWith(PKG_DIR + path.sep)) return 'skip(路径越界)'
  if (!fs.existsSync(p)) return 'skip(文件不存在)'
  let src = fs.readFileSync(p, 'utf8')
  if (src.includes('useLayoutEffect')) return 'skip(已打补丁)'
  if (!src.includes(MARK)) return 'skip(源码形态变化，需人工确认)'

  if (injectLayoutEffectImport) {
    // ESM 产物：import 区补 useLayoutEffect
    if (!src.includes('import{useRef as t,')) return 'skip(import 形态变化)'
    src = src.replace('import{useRef as t,', 'import{useRef as t,useLayoutEffect as le,')
  }
  // 把 "s=e=>{let r=useRef;渲染期执行}" 的执行体包进 useLayoutEffect
  const start = src.indexOf(MARK)
  const segStart = src.lastIndexOf('=>{', start)
  const segEnd = src.indexOf('}', start)
  if (segStart < 0 || segEnd < 0) return 'skip(锚点定位失败)'
  const oldSeg = src.slice(segStart + 3, segEnd)
  // CJS 里 useRef 是 t.useRef，ESM 里是别名 le；各自替换成 layout effect 调用
  const refDecl = oldSeg.match(/let r=([^;]+);/)[1]
  const layoutExpr = injectLayoutEffectImport ? 'le' : 't.useLayoutEffect'
  const newSeg = oldSeg.replace(
    'r.current||(r.current=!0,null==e||e())',
    `${layoutExpr}(()=>{r.current||(r.current=!0,null==e||e())},[])`,
  )
  src = src.slice(0, segStart + 3) + newSeg + src.slice(segEnd)
  fs.writeFileSync(p, src)
  return 'patched'
}

const results = {}
for (const [i, file] of FILES.entries()) {
  results[file] = patchFile(file, i === 1)
}
console.log('[patch-jojoo]', JSON.stringify(results))
