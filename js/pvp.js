/* Eko Rush – peer-to-peer match connection (WebRTC via PeerJS, loaded on demand) */
(function () {
  'use strict';
  const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const peerId = (code) => `ekorush-v2-${code.toLowerCase()}`;
  let loading = null;

  function loadLib() {
    if (window.Peer) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEER_SRC;
      s.onload = resolve;
      s.onerror = () => { loading = null; reject(new Error('Could not load the multiplayer library. Check your internet connection.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function friendly(e) {
    switch (e && e.type) {
      case 'peer-unavailable': return 'No match found with that code. Check it with your friend.';
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed': return 'Could not reach the match server. Check your internet connection.';
      case 'browser-incompatible': return 'This browser does not support peer-to-peer play.';
      default: return (e && e.message) || 'Connection error.';
    }
  }

  const api = {
    role: null,
    code: null,
    connected: false,
    peer: null,
    conn: null,
    onMessage: null,
    onStatus: null,
  };
  const status = (s, info) => { if (api.onStatus) api.onStatus(s, info); };

  function wire(conn) {
    api.conn = conn;
    conn.on('open', () => { api.connected = true; status('connected'); });
    conn.on('data', (d) => { if (api.onMessage) api.onMessage(d); });
    conn.on('close', () => {
      if (api.conn !== conn) return;
      api.connected = false;
      api.conn = null;
      status('closed');
    });
    conn.on('error', (e) => status('error', friendly(e)));
  }

  api.newCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

  api.host = async function host() {
    await loadLib();
    api.close();
    api.role = 'host';
    api.code = api.newCode();
    const peer = new window.Peer(peerId(api.code), { debug: 0 });
    api.peer = peer;
    peer.on('open', () => status('waiting', api.code));
    peer.on('connection', (c) => {
      if (api.connected) { c.on('open', () => c.close()); return; }
      wire(c);
    });
    peer.on('disconnected', () => { if (!peer.destroyed) try { peer.reconnect(); } catch (e) { /* ignore */ } });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') { api.host(); return; }
      status('error', friendly(e));
    });
  };

  api.join = async function join(code) {
    await loadLib();
    api.close();
    api.role = 'guest';
    api.code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const peer = new window.Peer(undefined, { debug: 0 });
    api.peer = peer;
    peer.on('open', () => {
      status('joining', api.code);
      wire(peer.connect(peerId(api.code), { reliable: true }));
    });
    peer.on('error', (e) => status('error', friendly(e)));
  };

  api.send = (msg) => {
    if (!api.conn || !api.connected) return;
    try { api.conn.send(msg); } catch (e) { /* channel closing */ }
  };

  api.close = () => {
    const c = api.conn, p = api.peer;
    api.conn = null; api.peer = null; api.connected = false; api.role = null;
    try { if (c) c.close(); } catch (e) { /* ignore */ }
    try { if (p) p.destroy(); } catch (e) { /* ignore */ }
  };

  api.link = () => `${location.href.split('#')[0].split('?')[0]}?join=${api.code}`;

  window.addEventListener('beforeunload', () => api.close());
  window.EkoPvP = api;
})();
