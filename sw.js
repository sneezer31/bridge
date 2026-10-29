// sw.js - マスター・サービスワーカー
const CACHE_NAME = 'hub-cache-v1';

// キャッシュする統合ファイルのリスト（フラット配置）
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './incredible.js',
  './firebase-config.js',
  './argus.html',
  './tanka-image.html',
  './tanka-series.html',
  './ifrit18.html',
  './ifrit19.html',
  './ifrit20.html',
  './alexandria.html'
];

// インストール時に全ファイルをキャッシュへ格納
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// 古いキャッシュの破棄
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    })
  );
  self.clients.claim();
});

// ネットワーク・ファースト戦略（Firebase通信はスルー）
self.addEventListener('fetch', event => {
  // FirestoreのAPI通信はキャッシュせず、直接ネットワークへ流す
  if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('identitytoolkit.googleapis.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      // オフライン時のみキャッシュを返す
      return caches.match(event.request);
    })
  );
});
