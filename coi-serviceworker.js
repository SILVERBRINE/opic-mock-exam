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
    const reloadedBySelf = window.sessionStorage.getItem('coiReloadedBySelf');
    window.sessionStorage.removeItem('coiReloadedBySelf');
    const coepDegrading = reloadedBySelf === 'coepdegrade';
    const options = {
      shouldRegister: () => !reloadedBySelf,
      shouldDeregister: () => false,
      coepCredentialless: () => true,
      coepDegrade: () => true,
      doReload: () => window.location.reload(),
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

