// Console/network bridge. Injected into same-origin guest documents (blob web
// builds, the demo) so the studio can capture console.*, errors, unhandled
// rejections, fetch and XHR. Also shipped to developers as a snippet they can
// drop into their PWA so cross-origin URLs become fully observable.
//
// Protocol: guest -> parent via postMessage({ __emu: 1, kind, payload }).

import type { LogEntry, NetEntry } from '@/lib/types';

export const BRIDGE_CHANNEL = '__emu';

/** The JS injected into guests / shipped to developers. Self-contained, no deps. */
export const BRIDGE_SNIPPET = `(function(){
  if (window.__emuBridgeInstalled) return;
  window.__emuBridgeInstalled = true;
  var send = function(kind, payload){
    try { parent.postMessage({ __emu: 1, kind: kind, payload: payload }, '*'); } catch(e){}
  };
  var ser = function(a){
    return Array.prototype.map.call(a, function(x){
      try {
        if (x instanceof Error) return (x.stack || (x.name + ': ' + x.message));
        if (typeof x === 'object') return JSON.stringify(x);
        return String(x);
      } catch(e){ return String(x); }
    }).join(' ');
  };
  ['log','info','warn','error','debug'].forEach(function(level){
    var orig = console[level];
    console[level] = function(){
      send('log', { level: level === 'debug' ? 'log' : level, message: ser(arguments), ts: Date.now(), origin: 'console' });
      if (orig) orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function(e){
    send('log', { level: 'error', message: (e.message || 'Error') + (e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : ''), ts: Date.now(), origin: 'window.error', stack: e.error && e.error.stack });
  });
  window.addEventListener('unhandledrejection', function(e){
    var r = e.reason; var msg = (r && (r.stack || r.message)) || String(r);
    send('log', { level: 'error', message: 'Unhandled rejection: ' + msg, ts: Date.now(), origin: 'unhandledrejection' });
  });
  var of = window.fetch;
  if (of) {
    window.fetch = function(){
      var args = arguments; var url = (args[0] && args[0].url) || String(args[0]);
      var method = (args[1] && args[1].method) || 'GET'; var t0 = Date.now();
      return of.apply(this, args).then(function(res){
        send('net', { method: method, url: url, status: res.status, ms: Date.now()-t0, ts: t0, ok: res.ok });
        return res;
      }).catch(function(err){
        send('net', { method: method, url: url, status: 0, ms: Date.now()-t0, ts: t0, ok: false, error: String(err) });
        throw err;
      });
    };
  }
  var XO = window.XMLHttpRequest;
  if (XO) {
    var op = XO.prototype.open; var sn = XO.prototype.send;
    XO.prototype.open = function(m, u){ this.__emu = { method: m, url: u }; return op.apply(this, arguments); };
    XO.prototype.send = function(){
      var self = this; var t0 = Date.now(); var meta = self.__emu || {};
      self.addEventListener('loadend', function(){
        send('net', { method: meta.method || 'GET', url: meta.url || '', status: self.status, ms: Date.now()-t0, ts: t0, ok: self.status >= 200 && self.status < 400 });
      });
      return sn.apply(this, arguments);
    };
  }
  send('log', { level: 'info', message: 'EMulator bridge connected', ts: Date.now(), origin: 'bridge' });
})();`;

export interface BridgeHandlers {
  onLog: (entry: LogEntry) => void;
  onNet: (entry: NetEntry) => void;
}

interface BridgeMessage {
  __emu?: number;
  kind?: 'log' | 'net';
  payload?: unknown;
}

/** Attach a window 'message' listener that routes bridge events. Returns a detach fn. */
export function attachBridge(handlers: BridgeHandlers): () => void {
  const listener = (ev: MessageEvent) => {
    const data = ev.data as BridgeMessage;
    if (!data || data.__emu !== 1) return;
    if (data.kind === 'log') handlers.onLog(data.payload as LogEntry);
    else if (data.kind === 'net') handlers.onNet(data.payload as NetEntry);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
