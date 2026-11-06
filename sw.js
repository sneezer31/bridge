// sw.js - 完全消去用キルスイッチ
self.addEventListener('install', event => {
  // 待機状態をスキップし、即座にこの自爆用Service Workerを起動させる
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    // 端末内のすべてのキャッシュを物理削除
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => caches.delete(cache))
      );
    }).then(() => {
      // 自身のシステム登録を解除（アンインストール）し、完全に消滅する
      return self.registration.unregister();
    })
  );
});
