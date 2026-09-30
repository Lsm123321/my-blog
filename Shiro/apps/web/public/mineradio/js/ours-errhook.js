/**
 * 错误收集（本项目自有）：挂在 index-loader 之前，捕获模块加载期错误，
 * 供 ours-bootstrap 读取上报调试。
 */
;(function () {
  'use strict'
  // 嵌入基址：本项目把 Mineradio 挂在 /mineradio/ 子路径下，
  // 模块里所有绝对路径静态资源（/vendor/...）都需要拼上这个前缀
  window.__MR_BASE = '/mineradio'
  window.__mrErrors = []
  window.addEventListener('error', function (e) {
    var loc = String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0)
    window.__mrErrors.push('[err] ' + String(e.message || e.error).slice(0, 200) + ' @' + loc)
    if (window.__mrErrors.length > 50) window.__mrErrors.shift()
  })
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason
    window.__mrErrors.push(
      '[rej] ' + String(r && (r.message || r)).slice(0, 200),
    )
    if (window.__mrErrors.length > 50) window.__mrErrors.shift()
  })
})()
