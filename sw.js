/* 女子バレー部監督シム v13.9 — Service Worker（フェーズ4・PWA化）
   役割：インストールとオフライン起動のためのキャッシュ。
   範囲はこのフォルダ（Service Worker のスコープ＝同フォルダ）に限定し、
   同フォルダの v13 HTML本体・マニフェスト・アイコンのみを扱う。
   他のフォルダや外部サイトのリクエストには一切介入しない。
   更新時：新しい Service Worker はすぐには有効化せず待機させ、
   ページ側がユーザーに通知してから SKIP_WAITING で切り替える。 */
'use strict';

var CACHE_NAME = 'vbcoach-v14-1';
var CORE = [
  './volleyball-sim-v13.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (event) {
  // 初回：中心ファイルだけをキャッシュする。失敗してもインストールは続ける。
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CORE);
    }).catch(function () { /* オフライン初回など。起動時の fetch で補う */ })
  );
});

self.addEventListener('activate', function (event) {
  // 古い v13 キャッシュだけを掃除する（他のアプリのキャッシュには触れない）。
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE_NAME ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  // ページ側の「今すぐ更新する」ボタンから呼ばれる。
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var url;
  try { url = new URL(event.request.url); } catch (e) { return; }
  // 対象外：POST など / 外部オリジン / このフォルダの外（スコープ外）
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.href.indexOf(self.registration.scope) !== 0) return;

  if (event.request.mode === 'navigate') {
    // 画面遷移（＝ゲーム本体の起動）：ネット優先、ダメならキャッシュ。
    // これでオフラインでもインストール済みのゲームが起動する。
    event.respondWith(
      fetch(event.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(event.request, copy); }).catch(function () {});
        return res;
      }).catch(function () {
        return caches.match('./volleyball-sim-v13.html');
      })
    );
    return;
  }

  // その他の同フォルダ内ファイル（manifest・アイコン）：
  // キャッシュがあれば即返し、裏でネットから更新する（stale-while-revalidate）。
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var net = fetch(event.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(event.request, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});
