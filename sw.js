/* ==========================================================
   千屿姝读 · Service Worker
   目的只有一个：让人装到桌面之后，断网也能打开、也能看自己的记录。

   三条纪律：
   1) **云函数的请求一律不碰**。同步是要拿最新的，缓存了会把旧数据当新的用。
   2) index.html 走「先联网、拿不到再用缓存」。她几乎每天都在改，
      缓存优先会让人一直看到旧版本。
   3) 版本号一改，旧缓存整批清掉——不做增量，单文件应用不值得。
   ========================================================== */
const V = 'qy-v2';
const SHELL = [
  './',
  './index.html',
  './pwa/manifest.json',
  './pwa/icon-192.png',
  './pwa/icon-512.png',
  './pwa/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V)
      // 单个文件取不到不该让整次安装失败（比如图标临时 404）
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 云函数、跨域接口：直接放行，永不缓存
  if (url.pathname.indexOf('/api/') === 0 || url.origin !== self.location.origin) return;

  const isDoc = req.mode === 'navigate' || /\.html?$/.test(url.pathname) || url.pathname === '/';

  if (isDoc) {
    // 先联网；网络不通才回缓存。这样她一发新版，用户下次打开就是新的
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(V).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 图标、字体这类不常变的：先缓存，后台顺手更新
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(V).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
