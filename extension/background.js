// Minimal MV3 background service worker
self.addEventListener('install', () => {
  // Keep minimal; content-script implements the protocol
  console.log('Schmer Recorder background installed');
});
