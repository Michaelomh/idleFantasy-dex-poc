// PROTOTYPE — throwaway service worker.
// Exists for two reasons only: installability, and catching the Share Target POST.
// No caching strategy on purpose — the prototype is about ingestion, not offline assets.
importScripts('./idb.js');

// Response.redirect needs an absolute URL; derive it from the SW scope so it
// is correct at a domain root and under a Pages subpath alike.
function landing() { return new URL('./?shared=1', self.registration.scope).href; }

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // endsWith, not ===: the app is served from a subfolder on GitHub Pages.
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(event.request));
  }
});

async function handleShare(request) {
  try {
    const form = await request.formData();
    // The manifest names the field 'save', but be forgiving: some share flows
    // rename it, and a prototype that silently drops the file teaches nothing.
    let file = form.get('save');
    if (!(file instanceof File)) {
      for (const value of form.values()) {
        if (value instanceof File) { file = value; break; }
      }
    }
    if (!(file instanceof File)) {
      await idbPut('pending', 'share', {
        receivedAt: Date.now(),
        error: 'Share arrived with no file part',
        formKeys: [...form.keys()],
      });
      return Response.redirect(landing(), 303);
    }
    // Record what the share sheet ACTUALLY handed over. The declared MIME type is
    // the thing ticket #4 warns about, so it must survive to the UI verbatim.
    await idbPut('pending', 'share', {
      receivedAt: Date.now(),
      name: file.name,
      type: file.type,
      size: file.size,
      text: await file.text(),
    });
  } catch (err) {
    await idbPut('pending', 'share', { receivedAt: Date.now(), error: String(err) });
  }
  return Response.redirect(landing(), 303);
}
