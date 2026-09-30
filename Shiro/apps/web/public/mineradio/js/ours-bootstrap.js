// 博客站对 Mineradio 前端的适配引导。
// Mineradio 原样嵌在 /mineradio/ 下，这个脚本做三件事：
// 1. 把后台歌单灌进它的播放队列（顶掉它自带的平台源）
// 2. 关掉网页模式下跑不通或者会误导的功能（开屏、新手引导、平台回退通知等）
// 3. 补齐它缺失的桌面能力（内置歌单改存 localStorage）
// 接口全部走 /api 下的适配路由；Mineradio 源码除标注 [ours patch] 处外零改动。
;(function () {
  'use strict'

  function skipSplashIfPresent(tries) {
    tries = tries || 0
    var s = document.getElementById('splash')
    if (s && !s.classList.contains('hide') && typeof dismissSplash === 'function') {
      try { dismissSplash({ instant: true }); return } catch (e) {}
    }
    if (s && tries < 40) setTimeout(function () { skipSplashIfPresent(tries + 1) }, 250)
  }

  // ============================================================
  // 内置歌单 polyfill。
  // 原版内置歌单走 Electron IPC（window.desktopWindow），网页里没有这个
  // 对象，点创建会提示「当前环境无法保存」。这里用 localStorage 顶上，
  // 接口形状照抄 desktop/built-in-playlist-library.js，前端无感。
  // 注意：数据存在访客自己浏览器里，删了也不影响后端歌单。
  // ============================================================
  ;(function polyfillBuiltInPlaylists() {
    var STORE = 'mineradio-our-builtin-v1'
    // 派生的「我的红心」歌单是动态合成的，不能落盘
    function load() {
      try {
        var parsed = JSON.parse(localStorage.getItem(STORE) || '{}')
        if (parsed && Array.isArray(parsed.playlists)) {
          return parsed.playlists.filter(function (p) { return p.id !== 'our-likes-heart' })
        }
      } catch (e) {}
      return []
    }
    function save(playlists) {
      try {
        localStorage.setItem(STORE, JSON.stringify({ version: 1, updatedAt: Date.now(), playlists: playlists }))
      } catch (e) {}
    }
    function find(id) {
      id = String(id || '').toLowerCase()
      return loadWithHeart().filter(function (p) { return p.id === id })[0] || null
    }
    function summary(p) {
      var first = (p.tracks || [])[0] || {}
      return {
        id: p.id, provider: 'mineradio', source: 'mineradio', builtin: true,
        name: p.name, creator: 'Mineradio', trackCount: (p.tracks || []).length,
        cover: first.cover || '', createdAt: p.createdAt, updatedAt: p.updatedAt,
        shelfPane: 'mine', subscribed: false,
      }
    }
    function listSync() {
      var playlists = loadWithHeart()
      return { ok: true, version: 1, count: playlists.length, playlists: playlists.map(summary) }
    }

    // 红心歌曲实时合成一张「我的红心」歌单，插在列表头——不然红心点了没有可见落点
    function heartPlaylist() {
      var likes = {}
      try { likes = JSON.parse(localStorage.getItem('mineradio-our-likes-v1') || '{}') } catch (e) {}
      var tracks = Object.keys(likes)
        .filter(function (k) { return likes[k] && likes[k].liked && likes[k].song })
        .map(function (k) { return likes[k].song })
      if (!tracks.length) return null
      return {
        id: 'our-likes-heart',
        name: '我的红心',
        createdAt: 0,
        updatedAt: Date.now(),
        tracks: tracks,
      }
    }
    function loadWithHeart() {
      var playlists = load()
      var heart = heartPlaylist()
      if (heart) {
        playlists = playlists.filter(function (p) { return p.id !== heart.id })
        playlists.unshift(heart)
      } else {
        playlists = playlists.filter(function (p) { return p.id !== 'our-likes-heart' })
      }
      return playlists
    }

    // 上限对齐 Electron 版（100 单 / 5000 首），防访客灌水撑爆 localStorage。
    // 超限错误码前端有现成文案映射：「内置歌单数量已达到上限」等
    var MAX_PLAYLISTS = 100
    var MAX_TRACKS_PER_PLAYLIST = 5000

    // 删除/删曲是破坏性操作，需要后台密码（接口在 /admin/login，与后台管理页同源）
    function ensureAdminPassword(cb) {
      try {
        if (sessionStorage.getItem('our-admin-passed') === '1') return cb(true)
      } catch (e) {}
      var API_BASE = ''
      try { API_BASE = (window.frameElement && window.frameElement.getAttribute('data-api-url')) || '' } catch (e) {}
      var user = prompt('删除/修改歌单需要站长权限\n请输入后台管理账号：')
      if (user == null) { showToast('已取消操作'); return cb(false) }
      var pass = prompt('请输入后台管理密码：')
      if (pass == null) { showToast('已取消操作'); return cb(false) }
      fetch(API_BASE + '/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error('账号或密码错误')
          return r.json()
        })
        .then(function () {
          try { sessionStorage.setItem('our-admin-passed', '1') } catch (e) {}
          showToast('站长权限验证通过')
          cb(true)
        })
        .catch(function (e) {
          showToast('验证失败：' + String(e && e.message || '账号或密码错误').slice(0, 40))
          cb(false)
        })
    }
    var desktop = (window.desktopWindow = window.desktopWindow || {})
    desktop.listBuiltInPlaylists = function () { return Promise.resolve(listSync()) }
    desktop.createBuiltInPlaylist = function (name) {
      var playlists = load()
      if (playlists.length >= MAX_PLAYLISTS) {
        return Promise.resolve({ ok: false, error: 'BUILT_IN_PLAYLIST_LIMIT_REACHED' })
      }
      var playlist = {
        id: Array.from({ length: 24 }, function () { return Math.floor(Math.random() * 16).toString(16) }).join(''),
        name: String(name || '我的歌单').slice(0, 80) || '我的歌单',
        createdAt: Date.now(), updatedAt: Date.now(), tracks: [],
      }
      playlists.unshift(playlist)
      save(playlists)
      return Promise.resolve(Object.assign(listSync(), { playlist: summary(playlist) }))
    }
    desktop.readBuiltInPlaylist = function (id, options) {
      options = options || {}
      var p = find(id)
      if (!p) return Promise.resolve({ ok: false, error: 'BUILT_IN_PLAYLIST_NOT_FOUND', playlist: null, tracks: [], total: 0, hasMore: false })
      var offset = Math.max(0, Math.floor(Number(options.offset) || 0))
      var limit = Math.max(1, Math.min(500, Math.floor(Number(options.limit) || 96)))
      var tracks = (p.tracks || []).slice(offset, offset + limit)
      var nextOffset = offset + tracks.length
      return Promise.resolve({
        ok: true, playlist: summary(p), tracks: tracks,
        total: (p.tracks || []).length, nextOffset: nextOffset,
        hasMore: nextOffset < (p.tracks || []).length,
      })
    }
    desktop.addBuiltInPlaylistTrack = function (id, track) {
      var playlists = load()
      var p = null
      for (var i = 0; i < playlists.length; i++) if (playlists[i].id === String(id || '').toLowerCase()) p = playlists[i]
      if (!p) return Promise.resolve({ ok: false, error: 'BUILT_IN_PLAYLIST_NOT_FOUND' })
      p.tracks = p.tracks || []
      if (p.tracks.length >= MAX_TRACKS_PER_PLAYLIST) {
        return Promise.resolve({ ok: false, error: 'BUILT_IN_PLAYLIST_TRACK_LIMIT_REACHED' })
      }
      var dup = p.tracks.some(function (t) { return String(t.id) === String(track && track.id) })
      if (!dup) {
        p.tracks.push(track)
        p.updatedAt = Date.now()
        save(playlists)
      }
      return Promise.resolve(Object.assign(listSync(), { ok: true, added: !dup, playlist: summary(p) }))
    }
    desktop.deleteBuiltInPlaylist = function (id) {
      var idl = String(id || '').toLowerCase()
      save(load().filter(function (p) { return p.id !== idl }))
      return Promise.resolve(Object.assign(listSync(), { ok: true }))
    }
    desktop.removeBuiltInPlaylistTrack = function (id, index) {
      var p = find(id)
      if (!p) return Promise.resolve({ ok: false, error: 'BUILT_IN_PLAYLIST_NOT_FOUND' })
      if (p.tracks && p.tracks[index] != null) { p.tracks.splice(index, 1); p.updatedAt = Date.now(); save(load().map(function (x) { return x.id === p.id ? p : x })) }
      return Promise.resolve(Object.assign(listSync(), { ok: true }))
    }

    // 删除类操作套一层密码验证（博客是公开的，防止访客误删自己的歌单之外，
    // 也明确传达「这不是共享存储」的语义）
    var origDeletePlaylist = desktop.deleteBuiltInPlaylist
    desktop.deleteBuiltInPlaylist = function (id) {
      return new Promise(function (resolve) {
        ensureAdminPassword(function (ok) {
          if (!ok) { resolve({ ok: false, error: 'ADMIN_REQUIRED' }); return }
          resolve(origDeletePlaylist.call(desktop, id))
        })
      })
    }
    var origRemoveTrack = desktop.removeBuiltInPlaylistTrack
    desktop.removeBuiltInPlaylistTrack = function (id, index) {
      return new Promise(function (resolve) {
        ensureAdminPassword(function (ok) {
          if (!ok) { resolve({ ok: false, error: 'ADMIN_REQUIRED' }); return }
          resolve(origRemoveTrack.call(desktop, id, index))
        })
      })
    }
  })()

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { skipSplashIfPresent() })
  } else {
    skipSplashIfPresent()
  }

  // 一组 CSS 纠偏。每条对应一个实际遇到的问题，别随手删：
  var style = document.createElement('style')
  style.textContent =
    // cursor-hidden 是桌面端习惯，网页里指针消失像界面卡死
    'body.cursor-hidden, body.cursor-hidden * { cursor: auto !important; }' +
    // 无账户体系，登录入口留着只会让访客困惑
    '#user-btn, #user-capsule-hide-btn { display: none !important; }' +
    // 搜索框露出位(24px)在站点顶栏下面，挪下来
    '#search-area.peek, body.simple-mode #search-area.peek, body.desktop-shell.simple-mode #search-area.peek { top: 78px !important; }' +
    // 搜索只在博客库内进行，这排平台源标签全是死开关
    '#search-mode-tabs { display: none !important; }' +
    // 无播客源
    '#tab-podcast { display: none !important; }' +
    // 本地音乐库是 Electron 能力，网页上点了没反应
    '#upload-btn, #clear-cover-btn { display: none !important; }' +
    // 推荐弹窗只保留了网易云页签（已接博客数据），其余平台页签是死的
    '#home-platform-recommend-tabs button[data-home-recommend-source="qishui"],' +
    '#home-platform-recommend-tabs button[data-home-recommend-source="qq"],' +
    '#home-platform-recommend-tabs button[data-home-recommend-source="kugou"] { display: none !important; }' +
    // 开屏已删，这几处显现过渡跟着去掉，进页面直接是最终状态
    'body.startup-fast-skip-revealing #canvas-container,' +
    'body.startup-fast-skip-revealing #idle-guide-canvas,' +
    'body.startup-fast-skip-revealing #top-right,' +
    'body.startup-fast-skip-revealing #search-area,' +
    'body.startup-fast-skip-revealing #bottom-bar { transition: none !important; }' +
    '#empty-home { transition: none !important; }' +
    'body.empty-home-active #empty-home { transition: none !important; }'
  document.head.appendChild(style)

  // ---- 歌单注入 ----
  var injected = false

  // Mineradio 的模块是异步逐个加载的，等关键函数都挂到 window 再动手
  function waitForModules(cb, tries) {
    tries = tries || 0
    if (typeof queueSong === 'function' && typeof clearQueue === 'function') {
      cb()
    } else if (tries < 60) {
      setTimeout(function () { waitForModules(cb, tries + 1) }, 500)
    }
  }

  function inject() {
    if (injected) return
    injected = true

    // 平台推荐弹窗顶部注入「播放排行 TOP10」。
    // openHomePlatformRecommendations 也是异步模块函数，同样轮询等它就绪再包
    var API_BASE = ''
    try { API_BASE = (window.frameElement && window.frameElement.getAttribute('data-api-url')) || '' } catch (e) {}
    var recWrapTries = 0
    var recWrapTimer = setInterval(function () {
      recWrapTries += 1
      if (typeof window.openHomePlatformRecommendations === 'function' && typeof queueSong === 'function') {
        clearInterval(recWrapTimer)
        installRankingWrapper()
        installSourceFlags()
        return
      }
      if (recWrapTries > 60) clearInterval(recWrapTimer)
    }, 500)

    // 舞台歌单架跟随播放来源：队列选歌显示队列歌曲卡，每日推荐显示歌单卡
    // （currentItems 的优先级分支在 manager-core [ours patch] 处读这个标志）
    function installSourceFlags() {
      try {
        if (typeof playQueueAt === 'function' && !window.__oursPlayQueueAtWrapped) {
          window.__oursPlayQueueAtWrapped = true
          var origPlayQueueAt = window.playQueueAt
          window.playQueueAt = function (idx, opts) {
            try { window.__mrShelfFollow = 'queue' } catch (e) {}
            return origPlayQueueAt.apply(this, arguments)
          }
        }
        if (typeof playHomeDaily === 'function' && !window.__oursPlayDailyWrapped) {
          window.__oursPlayDailyWrapped = true
          var origPlayHomeDaily = window.playHomeDaily
          window.playHomeDaily = function () {
            try { window.__mrShelfFollow = 'playlist' } catch (e) {}
            return origPlayHomeDaily.apply(this, arguments)
          }
        }
      } catch (e) {}
    }

    function installRankingWrapper() {
      var origOpenRec = window.openHomePlatformRecommendations
      window.openHomePlatformRecommendations = function () {
        var result = origOpenRec.apply(this, arguments)
        // 弹窗内容是异步渲染的，轮询注入直到列表就绪
        var injectTries = 0
        var injectTimer = setInterval(function () {
          injectTries += 1
          try {
            var list = document.getElementById('home-platform-recommend-list')
            if (!list) { if (injectTries > 20) clearInterval(injectTimer); return }
            if (list.querySelector('.ours-ranking-block')) { clearInterval(injectTimer); return }
            fetch(API_BASE + '/music/play/ranking?limit=10')
              .then(function (r) { return r.json() })
              .then(function (rows) {
                if (!Array.isArray(rows) || !rows.length || list.querySelector('.ours-ranking-block')) { clearInterval(injectTimer); return }
                var esc = function (s) { return String(s == null ? '' : s) }
                var block = document.createElement('div')
                block.className = 'ours-ranking-block'
                block.style.cssText = 'margin:2px 0 10px'
                var html = '<div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:rgba(255,255,255,.85);margin:0 0 8px">播放排行 · TOP ' + Math.min(10, rows.length) + '</div>'
                rows.forEach(function (row, i) {
                  html +=
                    '<button type="button" data-ours-rank="' + i + '" style="display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;margin:0 0 6px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:rgba(255,255,255,.85);cursor:pointer;text-align:left">' +
                    '<span style="width:20px;font-weight:800;font-style:italic;color:' + (i < 3 ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.38)') + '">' + (i + 1) + '</span>' +
                    '<span style="flex:1;min-width:0;overflow:hidden">' +
                    '<span style="display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(row.name) + '</span>' +
                    '<span style="display:block;font-size:11px;color:rgba(255,255,255,.4)">' + esc(row.artist) + ' · ' + row.count + ' 次</span></span>' +
                    '<span style="font-size:14px;color:rgba(255,255,255,.5)">›</span></button>'
                })
                block.innerHTML = html
                list.insertBefore(block, list.firstChild)
                Array.prototype.forEach.call(block.querySelectorAll('[data-ours-rank]'), function (btn) {
                  btn.addEventListener('click', function () {
                    var row = rows[Number(btn.getAttribute('data-ours-rank'))]
                    if (!row || typeof queueSong !== 'function' || typeof playQueueAt !== 'function') return
                    queueSong({ id: row.id, name: row.name, artist: row.artist, provider: 'netease', source: 'netease', type: 'song', cover: '' }, {})
                    playQueueAt(playQueue.length - 1)
                  })
                })
                clearInterval(injectTimer)
              })
              .catch(function () { if (injectTries > 20) clearInterval(injectTimer) })
          } catch (e) { if (injectTries > 20) clearInterval(injectTimer) }
        }, 300)
        return result
      }
    }

    // 无账户体系，Home 卡片和音乐库面板的登录分支照常走通
    try {
      window.hasAnyPlatformLogin = function () { return true }
      if (typeof loginStatus === 'object' && loginStatus) {
        loginStatus.loggedIn = true
        loginStatus.vipLabel = '站长'
      }
    } catch (e) {}

    // 音源就是博客后端，不存在「换源」，这些通知只会误导
    try {
      window.showSourceFallbackNotice = function () {}
    } catch (e) {}

    // 详情弹窗的评论区数据来自网易云接口，我们没有平台 id，永远「暂无评论」——直接藏掉
    try {
      var detailModal = document.getElementById('track-detail-modal')
      if (detailModal) {
        var pruneComments = function () {
          if (!detailModal.classList.contains('show')) return
          Array.prototype.forEach.call(detailModal.querySelectorAll('div, section'), function (el) {
            var head = el.querySelector && el.querySelector('.track-detail-section-title, h3, h4, strong')
            var own = (head ? head.textContent : el.textContent) || ''
            if (/网易云评论|评论/.test(own) && own.length < 12 && !el.dataset.oursPruned) {
              el.style.display = 'none'
              el.dataset.oursPruned = '1'
            }
          })
        }
        new MutationObserver(pruneComments).observe(detailModal, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
      }
    } catch (e) {}

    // 曲目映射成了 netease 形状但音源是博客，详情页来源文案跟着改
    try {
      var originalSongSourceLabel = window.songSourceLabel
      window.songSourceLabel = function (song) {
        var label = originalSongSourceLabel ? originalSongSourceLabel(song) : '未知'
        return label === '网易云音乐' ? '博客音乐库' : label
      }
    } catch (e) {}

    // 红心改为本地收藏：原版走网易云/QQ 收藏接口，我们的曲目 id 对不上必然失败。
    // UI 状态沿用它们的 likedSongMap，持久化在 localStorage
    try {
      var LIKE_STORE = 'mineradio-our-likes-v1'
      function loadLikes() {
        try { return JSON.parse(localStorage.getItem(LIKE_STORE) || '{}') } catch (e) { return {} }
      }
      function saveLikes(map) {
        try { localStorage.setItem(LIKE_STORE, JSON.stringify(map)) } catch (e) {}
      }
      var stored = loadLikes()
      Object.keys(stored).forEach(function (k) {
        if (stored[k] && stored[k].liked && typeof likedSongMap === 'object') likedSongMap[k] = true
      })
      window.toggleLikeSong = async function (song) {
        if (!song) return
        var stateKey = typeof songAccountStateKey === 'function' ? songAccountStateKey(song) : String(song.id)
        if (!stateKey) return
        var map = loadLikes()
        var next = !(map[stateKey] && map[stateKey].liked)
        map[stateKey] = { liked: next, song: { id: song.id, name: song.name, artist: song.artist, album: song.album, cover: song.cover, provider: song.provider, source: song.source, type: song.type } }
        saveLikes(map)
        if (typeof likedSongMap === 'object') likedSongMap[stateKey] = next
        if (typeof updateLikeButtons === 'function') updateLikeButtons(song)
        if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('ours-like', { scrollCurrent: false })
        if (typeof refreshSearchResultActionStates === 'function') refreshSearchResultActionStates()
        // 红心变化同步到「我的红心」派生歌单
        try {
          if (typeof refreshBuiltInPlaylists === 'function') refreshBuiltInPlaylists(true)
          if (emptyHomeActive && typeof renderHomeDiscover === 'function') renderHomeDiscover()
        } catch (e) {}
        showToast(next ? '已加入红心喜欢' : '已取消红心')
      }
    } catch (e) {}

    // 拉取平台歌单目录（音乐库「我的歌单」页签数据）
    try {
      if (typeof refreshUserPlaylists === 'function') refreshUserPlaylists(true)
    } catch (e) {}

    // 目录同步内部有多道登录闸门，偶尔漏 merge（netease 有数据但 userPlaylists 空），
    // 常驻守卫发现后强制拼装一次
    window.__oursHeal = { ticks: 0, fixed: 0, lastErr: '' }
    setInterval(function () {
      var H = window.__oursHeal
      H.ticks += 1
      try {
        var netease = Array.isArray(neteasePlaylists) ? neteasePlaylists : []
        var users = Array.isArray(userPlaylists) ? userPlaylists : []
        if (!netease.length || users.length >= netease.length) return
        userPlaylists = []
          .concat(Array.isArray(builtInPlaylists) ? builtInPlaylists : [])
          .concat(netease)
          .concat(Array.isArray(qqPlaylists) ? qqPlaylists : [])
          .concat(Array.isArray(kugouPlaylists) ? kugouPlaylists : [])
          .concat(Array.isArray(qishuiPlaylists) ? qishuiPlaylists : [])
          .concat(Array.isArray(spotifyPlaylists) ? spotifyPlaylists : [])
        playlistCatalogRevision += 1
        if (typeof renderUserPlaylistsList === 'function') renderUserPlaylistsList({ animate: false, reset: true })
        if (typeof scheduleShelfRebuild === 'function') scheduleShelfRebuild('ours-bootstrap', true)
        if (emptyHomeActive && typeof renderHomeDiscover === 'function') renderHomeDiscover()
        H.fixed += 1
      } catch (e) {
        H.lastErr = String(e).slice(0, 160)
      }
    }, 3000)

    // DIY 偏好已在 index.html head 写入，但本次加载的变量可能还是旧值，兜底切一次
    try {
      if (!diyPlayerMode && typeof toggleDiyMode === 'function') toggleDiyMode()
    } catch (e) {}

    // 把后台歌单灌进播放队列。
    // 快照恢复的旧队列是 netease 数字 id，在我们后端解析不了，必须整队重建
    fetch('/api/our/playlist', { cache: 'no-store' })
      .then(function (r) { return r.json() })
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) return
        var same =
          playQueue.length === list.length &&
          playQueue[0] &&
          playQueue[0].id === list[0].id
        if (same) return
        try { clearQueue() } catch (e) {}
        for (var i = 0; i < list.length; i++) queueSong(list[i], {})
        // currentIdx 不指到位的话播放键点了没反应
        try {
          currentIdx = 0
          if (typeof updateControlTrackInfo === 'function') updateControlTrackInfo(playQueue[0])
        } catch (e) {}
        try { safeRenderQueuePanel('ours-bootstrap') } catch (e) {}
        try { if (typeof showToast === 'function') showToast('已载入博客歌单 ' + list.length + ' 首') } catch (e) {}
      })
      .catch(function () {})
  }

  waitForModules(inject)
})()
