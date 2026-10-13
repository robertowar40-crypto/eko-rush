/* Eko Rush – peer-to-peer match connection (WebRTC via PeerJS, loaded on demand) */
// =====================================================================
// FILE OVERVIEW
// This file lets two players race each other directly, browser to browser.
// It uses WebRTC – a browser technology for sending data straight between two
// computers ("peer to peer") without a game server in the middle. To find each
// other, the two browsers briefly talk to a "signalling server" (PeerJS's free
// cloud server), which swaps connection details; after that, data flows directly.
// PeerJS is a library that wraps WebRTC in a simple API. Every browser gets a
// "peer id" (like a phone number). The host picks an id built from a 6-character
// room code, so the guest can "dial" that id just by knowing the code.
// How it is organised:
//   1. Constants + loadLib()  – download PeerJS from a CDN only when multiplayer is used.
//   2. friendly(e)            – turn technical errors into readable messages.
//   3. api object             – the public state + callbacks (window.EkoPvP).
//   4. wire(conn)             – hook up events on a data connection.
//   5. host / join / send / close / link – the actions the game calls.
// =====================================================================
// Wrap everything in an immediately-invoked function so variables stay private to this file.
(function () {
  // Strict mode: report more mistakes as errors.
  'use strict';
  // Web address (CDN) of the PeerJS library; loaded only when someone hosts or joins.
  const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  // Characters allowed in room codes. Confusing ones (I, O, 0, 1) are left out so codes are easy to read aloud.
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // Turns a room code into a full peer id, e.g. 'ABC123' -> 'ekorush-v2-abc123'.
  // The prefix keeps our ids from colliding with other apps using the same public server.
  const peerId = (code) => `ekorush-v2-${code.toLowerCase()}`;
  // Holds the in-progress download Promise so we never load the library twice at once.
  let loading = null;

  // loadLib(): make sure the PeerJS library is loaded.
  // Returns a Promise that resolves when window.Peer is available, or rejects on network failure.
  function loadLib() {
    // Already loaded? Return a Promise that is resolved straight away.
    if (window.Peer) return Promise.resolve();
    // A download is already running; reuse it instead of starting another.
    if (loading) return loading;
    // Start a new download, wrapped in a Promise so callers can "await" it.
    loading = new Promise((resolve, reject) => {
      // Create a <script> tag in code; the browser downloads and runs it when added to the page.
      const s = document.createElement('script');
      // Point the script tag at the PeerJS CDN address.
      s.src = PEER_SRC;
      // When the script finishes loading, the Promise succeeds.
      s.onload = resolve;
      // On failure, clear 'loading' so a later attempt can retry, and reject with a readable error.
      s.onerror = () => { loading = null; reject(new Error('Could not load the multiplayer library. Check your internet connection.')); };
      // Adding the tag to <head> actually triggers the download.
      document.head.appendChild(s);
    });
    // Hand the Promise back to the caller.
    return loading;
  }

  // friendly(e): convert a PeerJS error object into a sentence a player can understand.
  // Parameter: e – an error (may have a .type from PeerJS). Returns a string.
  function friendly(e) {
    // Pick a message based on the error type (e && e.type avoids crashing if e is missing).
    switch (e && e.type) {
      // The guest dialled a peer id that nobody is using – wrong or expired code.
      case 'peer-unavailable': return 'No match found with that code. Check it with your friend.';
      // Any of these mean we couldn't talk to the signalling server.
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed': return 'Could not reach the match server. Check your internet connection.';
      // The browser has no WebRTC support.
      case 'browser-incompatible': return 'This browser does not support peer-to-peer play.';
      // Anything else: use the error's own message, or a generic fallback.
      default: return (e && e.message) || 'Connection error.';
    }
  }

  // The public object (exposed as window.EkoPvP at the bottom). It holds the current state.
  const api = {
    // 'host' or 'guest' once a match is started; null when idle.
    role: null,
    // The 6-character room code in use.
    code: null,
    // true once the data channel between the two players is open.
    connected: false,
    // Our PeerJS Peer object (our connection to the signalling server).
    peer: null,
    // The DataConnection to the other player (the channel messages travel through).
    conn: null,
    // Callback set by the game: called with each message received from the other player.
    onMessage: null,
    // Callback set by the game: called with status updates ('waiting', 'connected', 'error', ...).
    onStatus: null,
  };
  // Helper: report a status change to the game, if it registered an onStatus callback.
  const status = (s, info) => { if (api.onStatus) api.onStatus(s, info); };

  // wire(conn): attach event handlers to a new data connection and make it the current one.
  // Parameter: conn – a PeerJS DataConnection. Returns nothing.
  function wire(conn) {
    // Remember this connection so send() and close() can use it.
    api.conn = conn;
    // 'open' fires when the channel is ready; mark connected and tell the game.
    conn.on('open', () => { api.connected = true; status('connected'); });
    // 'data' fires for every incoming message; pass it to the game's handler.
    conn.on('data', (d) => { if (api.onMessage) api.onMessage(d); });
    // 'close' fires when the other player leaves or the connection drops.
    conn.on('close', () => {
      // Ignore close events from an old connection we already replaced.
      if (api.conn !== conn) return;
      // Reset the connection state.
      api.connected = false;
      api.conn = null;
      // Tell the game the match connection ended.
      status('closed');
    });
    // Report connection errors in friendly wording.
    conn.on('error', (e) => status('error', friendly(e)));
  }

  // newCode(): make a random 6-character room code from ALPHABET. Returns the code string.
  // Array.from({ length: 6 }, ...) builds 6 random letters, then join('') glues them together.
  api.newCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

  // host(): create a new room and wait for a friend to join.
  // async means it can "await" the library download. Status goes to onStatus ('waiting' + code).
  api.host = async function host() {
    // Make sure PeerJS is loaded before using it.
    await loadLib();
    // Shut down any previous match first.
    api.close();
    // We are the host this time.
    api.role = 'host';
    // Pick a fresh room code.
    api.code = api.newCode();
    // Register with the signalling server under the id derived from our code (debug: 0 = no console logs).
    const peer = new window.Peer(peerId(api.code), { debug: 0 });
    // Remember the peer so we can close it later.
    api.peer = peer;
    // Once registered, tell the game we're waiting and give it the code to share.
    peer.on('open', () => status('waiting', api.code));
    // 'connection' fires when a guest dials our id.
    peer.on('connection', (c) => {
      // Already have an opponent: politely close any extra connection once it opens.
      if (api.connected) { c.on('open', () => c.close()); return; }
      // Otherwise accept this guest as our opponent.
      wire(c);
    });
    // If we lose the signalling server (not the match), try to reconnect unless the peer was shut down.
    peer.on('disconnected', () => { if (!peer.destroyed) try { peer.reconnect(); } catch (e) { /* ignore */ } });
    // Handle peer-level errors.
    peer.on('error', (e) => {
      // Someone already uses this id (code clash): just start over with a new code.
      if (e.type === 'unavailable-id') { api.host(); return; }
      // Any other error is shown to the player.
      status('error', friendly(e));
    });
  };

  // join(code): connect to a friend's room.
  // Parameter: code – the room code typed or taken from the link. Status goes to onStatus.
  api.join = async function join(code) {
    // Make sure PeerJS is loaded.
    await loadLib();
    // Shut down any previous match.
    api.close();
    // We are the guest.
    api.role = 'guest';
    // Clean the code: make it a string, uppercase, and strip anything that isn't a letter or digit.
    api.code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Register with the signalling server; undefined id means "give me a random id".
    const peer = new window.Peer(undefined, { debug: 0 });
    // Remember the peer for later cleanup.
    api.peer = peer;
    // Once we're registered we can dial the host.
    peer.on('open', () => {
      // Tell the game we're joining this code.
      status('joining', api.code);
      // Dial the host's peer id; reliable: true makes messages arrive in order without loss.
      wire(peer.connect(peerId(api.code), { reliable: true }));
    });
    // Show any error (e.g. wrong code) in friendly words.
    peer.on('error', (e) => status('error', friendly(e)));
  };

  // send(msg): send a message (any JSON-friendly value) to the other player.
  // Silently does nothing if we're not connected.
  api.send = (msg) => {
    // No open connection, so nothing to send to.
    if (!api.conn || !api.connected) return;
    // Send it; ignore errors that happen if the channel is closing at that moment.
    try { api.conn.send(msg); } catch (e) { /* channel closing */ }
  };

  // close(): end the current match and release all network resources. Safe to call any time.
  api.close = () => {
    // Keep local references before we clear the shared state.
    const c = api.conn, p = api.peer;
    // Reset all state first so event handlers see we're no longer in a match.
    api.conn = null; api.peer = null; api.connected = false; api.role = null;
    // Close the data connection, ignoring errors if it's already closed.
    try { if (c) c.close(); } catch (e) { /* ignore */ }
    // Destroy the peer (disconnects from the signalling server), ignoring errors.
    try { if (p) p.destroy(); } catch (e) { /* ignore */ }
  };

  // link(): build a shareable invite URL like https://site/page?join=ABC123.
  // Strips any existing #hash and ?query from the current address first. Returns the URL string.
  api.link = () => `${location.href.split('#')[0].split('?')[0]}?join=${api.code}`;

  // When the tab is closed or reloaded, disconnect cleanly so the other player is notified.
  window.addEventListener('beforeunload', () => api.close());
  // Make the API available to the rest of the game as window.EkoPvP.
  window.EkoPvP = api;
// Close and immediately call the wrapping function.
})();
