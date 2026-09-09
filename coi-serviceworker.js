/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, MIT */
let coepCredentialless = false;

if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
  self.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'deregister') {
      self.registration.unregister().then(() => self.clients.matchAll()).then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      });
    }
    if (event.data.type === 'coepCredentialless') coepCredentialless = event.data.value;
  });
  self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
    const outgoing = coepCredentialless && request.mode === 'no-cors'
      ? new Request(request, { credentials: 'omit' })
      : request;
    event.respondWith(fetch(outgoing).then((response) => {
      if (response.status === 0) return response;
      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Embedder-Policy', coepCredentialless ? 'credentialless' : 'require-corp');
      if (!coepCredentialless) headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }).catch((error) => {
      console.error('COOP/COEP service worker fetch failed:', error);
      throw error;
    }));
  });
} else {
  (() => {
    // Without session storage, reload markers cannot stop a reload loop.
    try {
      window.sessionStorage.setItem('coiStorageProbe', '1');
      window.sessionStorage.removeItem('coiStorageProbe');
    } catch { return; }
    let userStarted = false;
    window.addEventListener('pointerdown', () => { userStarted = true; }, { once: true, capture: true });
    window.addEventListener('keydown', () => { userStarted = true; }, { once: true, capture: true });
    const reloadWhenSafe = () => {
      if (!userStarted) { window.location.reload(); return; }
      const showNotice = () => {
        if (document.getElementById('coiUpdateNotice')) return;
        const notice = document.createElement('p');
        notice.id = 'coiUpdateNotice';
        notice.setAttribute('role', 'status');
        notice.textContent = '로컬 AI 실행 환경이 준비되었습니다. 현재 연습을 마치고 기록을 저장한 뒤 새로고침해 주세요.';
        document.body.prepend(notice);
      };
      if (document.body) showNotice();
      else window.addEventListener('DOMContentLoaded', showNotice, { once: true });
    };
    const reloadedBySelf = window.sessionStorage.getItem('coiReloadedBySelf');
    window.sessionStorage.removeItem('coiReloadedBySelf');
    const coepDegrading = reloadedBySelf === 'coepdegrade';
    const options = {
      shouldRegister: () => !reloadedBySelf,
      shouldDeregister: () => false,
      coepCredentialless: () => true,
      coepDegrade: () => true,
      doReload: reloadWhenSafe,
      quiet: false,
      ...window.coi,
    };
    const serviceWorker = navigator.serviceWorker;
    const controller = serviceWorker && serviceWorker.controller;
    if (controller && !window.crossOriginIsolated) window.sessionStorage.setItem('coiCoepHasFailed', 'true');
    const coepHasFailed = window.sessionStorage.getItem('coiCoepHasFailed');
    if (controller) {
      const reloadToDegrade = options.coepDegrade() && !(coepDegrading || window.crossOriginIsolated);
      controller.postMessage({
        type: 'coepCredentialless',
        value: (reloadToDegrade || (coepHasFailed && options.coepDegrade())) ? false : options.coepCredentialless(),
      });
      if (reloadToDegrade) {
        if (!options.quiet) console.log('Reloading page to degrade COEP.');
        window.sessionStorage.setItem('coiReloadedBySelf', 'coepdegrade');
        options.doReload('coepdegrade');
      }
      if (options.shouldDeregister()) controller.postMessage({ type: 'deregister' });
    }
    if (window.crossOriginIsolated !== false || !options.shouldRegister()) return;
    if (!window.isSecureContext || !serviceWorker) {
      if (!options.quiet) console.warn('COOP/COEP service worker requires HTTPS or localhost.');
      return;
    }
    serviceWorker.register(document.currentScript.src).then((registration) => {
      if (!options.quiet) console.log('COOP/COEP service worker registered', registration.scope);
      registration.addEventListener('updatefound', () => {
        window.sessionStorage.setItem('coiReloadedBySelf', 'updatefound');
        options.doReload();
      });
      if (registration.active && !serviceWorker.controller) {
        window.sessionStorage.setItem('coiReloadedBySelf', 'notcontrolling');
        options.doReload();
      }
    }).catch((error) => {
      if (!options.quiet) console.warn('COOP/COEP service worker registration failed:', error);
    });
  })();
}
