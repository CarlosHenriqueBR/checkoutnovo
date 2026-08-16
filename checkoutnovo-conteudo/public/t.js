/* =====================================================================
 * VEGA TRACK — captura de atribuição na PÁGINA DE ENTRADA
 * ---------------------------------------------------------------------
 * Cole este script no <head> de TODA página que recebe tráfego de anúncio
 * (presell, VSL, landing) e também no checkout:
 *
 *   <script src="https://SEU-DOMINIO/t.js" defer></script>
 *
 * O que ele faz:
 *  1. Lê da URL: fbclid, ttclid, click_id, gclid, wbraid, gbraid, todas as
 *     utm_*, src, sck, xcod, ref.
 *  2. Salva em localStorage (chave vg_track) + cookie 1st-party (vg_track),
 *     com validade de 30 dias — sobrevive à navegação entre páginas.
 *  3. Nunca sobrescreve um click ID existente com valor vazio (first-touch
 *     preservado, last-touch aplicado só quando um novo clique chega).
 *  4. Captura _fbp/_fbc do pixel do Facebook, se presentes.
 *  5. Propaga os parâmetros automaticamente em links internos e no
 *     formulário do checkout.
 *
 * Exposto como window.VegaTrack.get() -> objeto com tudo.
 * ===================================================================== */
(function () {
  'use strict';

  var KEY = 'vg_track';
  var CUSTOMER_KEY = 'vg_customer';
  var TTL_DAYS = 30;

  var KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id',
    'src', 'sck', 'xcod', 'ref',
    'fbclid', 'ttclid', 'click_id', 'gclid', 'wbraid', 'gbraid'
  ];

  function readCookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? decodeURIComponent(m.pop()) : '';
  }

  function writeCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    var domain = '';
    try {
      var parts = location.hostname.split('.');
      if (parts.length > 2) domain = '; domain=.' + parts.slice(-2).join('.');
    } catch (e) {}
    document.cookie =
      name + '=' + encodeURIComponent(value) + '; expires=' + d.toUTCString() + '; path=/' + domain + '; SameSite=Lax';
  }

  function loadStored() {
    var out = {};
    try {
      var ls = localStorage.getItem(KEY);
      if (ls) out = JSON.parse(ls) || {};
    } catch (e) {}
    if (!Object.keys(out).length) {
      try {
        var ck = readCookie(KEY);
        if (ck) out = JSON.parse(ck) || {};
      } catch (e) {}
    }
    return out;
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    try { writeCookie(KEY, JSON.stringify(data), TTL_DAYS); } catch (e) {}
  }

  function fromUrl() {
    var out = {};
    try {
      var p = new URLSearchParams(location.search);
      for (var i = 0; i < KEYS.length; i++) {
        var v = p.get(KEYS[i]);
        if (v) out[KEYS[i]] = v;
      }
      // Alguns tráfegos mandam o click do Kwai como clickid/kwai_click_id
      if (!out.click_id) {
        var alt = p.get('clickid') || p.get('kwai_click_id') || p.get('kwaiclickid');
        if (alt) out.click_id = alt;
      }
    } catch (e) {}
    return out;
  }

  function uuid() {
    try { return crypto.randomUUID(); } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  var stored = loadStored();
  var incoming = fromUrl();

  // Um novo clique pago sobrescreve a atribuição anterior por inteiro.
  var hasNewClick = !!(incoming.fbclid || incoming.ttclid || incoming.click_id || incoming.gclid || incoming.wbraid || incoming.gbraid);
  var data = hasNewClick ? {} : stored;

  for (var k in incoming) {
    if (incoming[k]) data[k] = incoming[k];
  }
  for (var j = 0; j < KEYS.length; j++) {
    var key = KEYS[j];
    if (!data[key] && stored[key]) data[key] = stored[key];
  }

  if (!data.session_id) data.session_id = uuid();
  if (!data.landing_url || hasNewClick) data.landing_url = location.href.slice(0, 500);
  if (!data.referrer) data.referrer = (document.referrer || '').slice(0, 500);
  if (!data.first_seen) data.first_seen = new Date().toISOString();

  // _fbp / _fbc gravados pelo pixel do Facebook
  function pullFbCookies() {
    var fbp = readCookie('_fbp');
    var fbc = readCookie('_fbc');
    var changed = false;
    if (fbp && data.fbp !== fbp) { data.fbp = fbp; changed = true; }
    if (fbc && data.fbc !== fbc) { data.fbc = fbc; changed = true; }
    if (!data.fbc && data.fbclid) {
      data.fbc = 'fb.1.' + Date.now() + '.' + data.fbclid;
      changed = true;
    }
    if (changed) save(data);
  }

  save(data);
  pullFbCookies();
  setTimeout(pullFbCookies, 1200);
  setTimeout(pullFbCookies, 4000);

  /** Query string com todos os parâmetros — mesmo formato do campo `utm`. */
  function toQuery() {
    var parts = [];
    for (var i = 0; i < KEYS.length; i++) {
      if (data[KEYS[i]]) parts.push(KEYS[i] + '=' + encodeURIComponent(data[KEYS[i]]));
    }
    return parts.join('&');
  }

  /** Propaga o rastreio para links internos e para o checkout. */
  function decorateLinks() {
    var qs = toQuery();
    if (!qs) return;
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) continue;
      if (a.getAttribute('data-vg-skip') !== null) continue;
      try {
        var u = new URL(href, location.href);
        // Só decora http(s)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
        for (var j = 0; j < KEYS.length; j++) {
          if (data[KEYS[j]] && !u.searchParams.get(KEYS[j])) u.searchParams.set(KEYS[j], data[KEYS[j]]);
        }
        a.setAttribute('href', u.toString());
      } catch (e) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decorateLinks);
  } else {
    decorateLinks();
  }

  /** Dados do cliente salvos LOCALMENTE para autofill do checkout. */
  function getCustomer() {
    try { return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveCustomer(c) {
    try {
      var cur = getCustomer();
      for (var k in c) if (c[k]) cur[k] = c[k];
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify(cur));
    } catch (e) {}
  }

  window.VegaTrack = {
    get: function () { return JSON.parse(JSON.stringify(data)); },
    query: toQuery,
    refresh: pullFbCookies,
    decorate: decorateLinks,
    getCustomer: getCustomer,
    saveCustomer: saveCustomer,
    KEYS: KEYS
  };

  // Backup server-side da sessão de rastreio (não bloqueante).
  try {
    if (!sessionStorage.getItem('vg_track_sent')) {
      sessionStorage.setItem('vg_track_sent', '1');
      var endpoint = (document.currentScript && document.currentScript.src ? new URL(document.currentScript.src).origin : location.origin) + '/api/track';
      fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true,
        mode: 'cors'
      }).catch(function () {});
    }
  } catch (e) {}
})();
