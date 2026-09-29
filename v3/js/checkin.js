// Seiko CRM V3.0 - the customer check-in page. One page:
// your details, personal recommendations, news and events, your privacy, Save. Then a thank-you screen with no way onward.
// The page cannot read anything from the CRM. What the customer enters is encrypted on this device with a key that
// travels only in the link fragment, and is handed to the CRM through a relay that sees ciphertext only.
(function () {
  'use strict';
  var RELAYS = ['https://ntfy.envs.net', 'https://ntfy.adminforge.de', 'https://ntfy.hostux.net', 'https://ntfy.mzte.de', 'https://ntfy.sh'];
  var LOCAL_KEY = 'seiko-crm3-checkin', LOCAL_CFG = 'seiko-crm3-checkin-cfg', USED = 'seiko-crm3-used';
  var qs = new URLSearchParams(location.search), hp = new URLSearchParams(location.hash.replace(/^#/, ''));
  var topic = qs.get('s') || '', local = qs.get('m') === 'local', kiosk = qs.get('d') === 'ipad', key = hp.get('k') || '', issued = Number(hp.get('t')) || 0;
  var TTL = kiosk ? 12 * 3600000 : 20 * 60000, IDLE = 120000, RETURN = 12000;
  var page = document.getElementById('page');
  // way of contact: key, label, icon, the detail it needs
  var WAYS = [['email', 'Email', 'mail', 'email'], ['phone', 'Phone', 'call', 'mobile'], ['sms', 'SMS', 'sms', 'mobile'], ['whatsapp', 'WhatsApp', '', 'mobile']];
  var WA = '<svg width="17" height="17" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  var cfg = null, st = null, timer = null, idleT = null, typeT = null;
  // answer: null until the customer chooses; true = Yes; false = No
  function fresh() { return { step: kiosk ? 'welcome' : 'form', first: '', last: '', mobile: '', email: '', recommend: { answer: null, channels: [], brands: [] }, news: { answer: null, channels: [], brands: [] }, errors: {}, sending: false, failed: false }; }

  // ---- small helpers
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function e(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function ico(n, cls) { return '<span class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + n + '</span>'; }
  function validEmail(x) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(x || '').trim()); }
  function validPhone(p) { var s = String(p || '').trim(), d = s.replace(/\D/g, ''); return /^[+\d][\d\s().-]*$/.test(s) && d.length >= 7 && d.length <= 15; }
  function has(kind) { return kind === 'email' ? validEmail(st.email) : validPhone(st.mobile); }
  function ways() { return WAYS.filter(function (w) { return has(w[3]); }); }
  function wayLabel(k) { return WAYS.filter(function (w) { return w[0] === k; })[0][1]; }
  function b64url(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function bytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function withTimeout(url, opts, ms) { var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms || 8000); opts = opts || {}; opts.signal = c.signal; return fetch(url, opts).then(function (r) { clearTimeout(t); return r; }, function (x) { clearTimeout(t); throw x; }); }
  function encrypt(text, aad) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.importKey('raw', bytes(key), 'AES-GCM', false, ['encrypt']).then(function (k) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: new TextEncoder().encode(aad) }, k, new TextEncoder().encode(text)); })
      .then(function (ct) { ct = new Uint8Array(ct); var out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length); return b64url(out); });
  }
  function decrypt(b64u, aad) {
    var all = bytes(b64u);
    return crypto.subtle.importKey('raw', bytes(key), 'AES-GCM', false, ['decrypt']).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12), additionalData: new TextEncoder().encode(aad) }, k, all.slice(12)); })
      .then(function (p) { return JSON.parse(new TextDecoder().decode(p)); });
  }
  function usedCodes() { try { return JSON.parse(sessionStorage.getItem(USED) || '[]'); } catch (x) { return []; } }
  function safeUrl(u) { return /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : ''; }

  // ---- the privacy statement, the two questions and the brands come from the CRM, so the customer sees the published version
  function goodCfg(c) { return !!(c && c.v && c.statement && c.rq && c.nq && Array.isArray(c.brands)); }
  function loadCfg() {
    if (local) { try { var c = JSON.parse(localStorage.getItem(LOCAL_CFG) || 'null'); return Promise.resolve(goodCfg(c) ? c : null); } catch (x) { return Promise.resolve(null); } }
    var tries = RELAYS.map(function (h) {
      return withTimeout(h + '/' + topic + '-cfg/json?poll=1&since=all', { cache: 'no-store' }, 7000).then(function (r) { return r.text(); }).then(function (t) {
        var last = null;
        t.split('\n').forEach(function (l) { if (!l.trim()) return; try { var m = JSON.parse(l); if (m.event === 'message') last = m; } catch (x) {} });
        if (!last) throw new Error('none');
        return decrypt(JSON.parse(last.message).enc, topic + '-cfg');
      }).then(function (c) { if (!goodCfg(c)) throw new Error('bad'); return c; });
    });
    return new Promise(function (resolve) { var left = tries.length, done = false; tries.forEach(function (p) { p.then(function (c) { if (!done) { done = true; resolve(c); } }, function () { if (--left === 0 && !done) resolve(null); }); }); });
  }

  // ---- pieces
  var LOGOS = '<div class="logos"><img class="gs" src="assets/grand-seiko-logo.png" alt="Grand Seiko"><i></i><img class="sk" src="assets/seiko-logo.png" alt="Seiko"></div>';
  function input(k, label, o) {
    o = o || {}; var err = st.errors[k];
    return '<div class="f"><label class="fl" for="i-' + k + '">' + e(label) + (o.opt ? ' <span>optional</span>' : '') + '</label><input class="inp" id="i-' + k + '" data-k="' + k + '" type="' + (o.type || 'text') + '" value="' + e(st[k]) + '" autocomplete="' + (o.ac || 'off') + '"' + (o.mode ? ' inputmode="' + o.mode + '"' : '') + ' maxlength="' + (o.max || 80) + '"' + (err ? ' aria-invalid="true" aria-describedby="e-' + k + '"' : '') + (o.cap ? ' autocapitalize="' + o.cap + '"' : '') + '>' +
      (err ? '<p class="err" id="e-' + k + '">' + ico('error') + '<span>' + e(err) + '</span></p>' : '') + '</div>';
  }
  // one question: Yes or No, and under Yes the ways and the brands. q = 'recommend' or 'news'
  function question(q, title, icon, text, amber) {
    var a = st[q], w = ways(), err = st.errors[q];
    var yn = function (val, label) { var on = a.answer === val; return '<label class="opt yn' + (on ? ' on' : '') + '"><input type="radio" name="' + q + '" data-q="' + q + '" data-answer="' + (val ? 'yes' : 'no') + '"' + (on ? ' checked' : '') + '><span>' + label + '</span></label>'; };
    var tick = function (kind, v, label, badge) { var on = a[kind].indexOf(v) > -1; return '<label class="opt' + (on ? ' on' : '') + '"><input type="checkbox" data-q="' + q + '" data-' + kind + '="' + e(v) + '"' + (on ? ' checked' : '') + '>' + (badge || '') + '<span>' + e(label) + '</span></label>'; };
    var more = '';
    if (a.answer === true) {
      more = '<div class="ifyes"><span class="k">If yes</span><h3 id="h-' + q + '-w">How would you like to hear from us?</h3>' +
        (w.length ? '<div class="opts" role="group" aria-labelledby="h-' + q + '-w">' + w.map(function (x) { return tick('channels', x[0], x[1], '<span class="rc" aria-hidden="true">' + (x[0] === 'whatsapp' ? WA : ico(x[2], 'c-' + x[0])) + '</span>'); }).join('') + '</div>'
          : '<p class="hint">Add your phone number or your email address above. The ways to choose then appear here.</p>') +
        (err ? '<p class="err" id="e-' + q + '">' + ico('error') + '<span>' + e(err) + '</span></p>' : '') +
        (cfg.brands.length > 1 ? '<h3 class="gap" id="h-' + q + '-b">Which brands?</h3><div class="two" role="group" aria-labelledby="h-' + q + '-b">' + cfg.brands.map(function (b) { return tick('brands', b, b); }).join('') + '</div>' : '') + '</div>';
    }
    return '<section class="card' + (amber ? ' m' : '') + '" aria-label="' + e(title) + '"><div class="band">' + ico(icon) + '<span>' + e(title) + '</span></div><div class="body"><h2 id="h-' + q + '">' + e(text) + '</h2>' +
      '<div class="row" role="radiogroup" aria-labelledby="h-' + q + '">' + yn(true, 'Yes') + yn(false, 'No') + '</div>' + more + '</div></section>';
  }
  function questions() { return question('recommend', 'Personal recommendations', 'watch', cfg.rq, false) + question('news', 'News and events', 'campaign', cfg.nq, true); }
  function errSum() { var ks = Object.keys(st.errors); return ks.length ? '<p class="errsum" role="alert"><b>Please check:</b> ' + ks.map(function (k) { return e(st.errors[k]); }).join(' ') + '</p>' : ''; }

  // ---- screens
  function Welcome() { return LOGOS + '<div class="card done"><h1 tabindex="-1">Welcome to SEIKO</h1><p class="lead">Tell us your name so that your consultant can look after you. It takes about a minute.</p></div><div class="save"><button type="button" class="btn" data-a="start">Start' + ico('arrow_forward') + '</button></div>'; }
  function Form() {
    var url = safeUrl(cfg.url);
    return LOGOS + '<h1 tabindex="-1">Boutique check-in</h1><div id="sum">' + errSum() + '</div>' +
      '<section class="card pad" aria-label="Your details"><div class="row">' + input('first', 'First name', { ac: 'given-name', cap: 'words' }) + input('last', 'Last name', { ac: 'family-name', cap: 'words' }) + '</div>' +
      input('mobile', 'Phone', { type: 'tel', ac: 'tel', mode: 'tel', max: 24 }) + input('email', 'Email', { type: 'email', ac: 'email', mode: 'email', max: 120, cap: 'none' }) + '</section>' +
      '<div id="qs">' + questions() + '</div>' +
      '<div class="privacy"><span class="k">Your privacy</span><p>' + e(cfg.statement) + '</p><p>' + e(cfg.rights) + ' <a href="mailto:' + e(cfg.contact) + '">' + e(cfg.contact) + '</a></p>' +
      (url ? '<a href="' + e(url) + '" target="_blank" rel="noopener noreferrer">Read the full Privacy Policy</a>' : '') + '</div>' +
      (st.failed ? '<p class="errsum" role="alert">We could not save your details. Please check the connection and try again, or tell your consultant.</p>' : '') +
      '<div class="save"><button type="button" class="btn" data-a="save"' + (st.sending ? ' disabled' : '') + '>' + (st.sending ? 'Saving…' : 'Save') + '</button><p class="cap">Your consultant sees these details on their screen straight away.</p>' +
      (kiosk ? '<button type="button" class="btn plain" data-a="reset">Cancel</button>' : '') + '</div>';
  }
  function recap(a) { return a.answer === true ? 'Yes · ' + a.channels.map(wayLabel).join(', ') + (a.brands.length ? ' · ' + a.brands.join(', ') : '') : a.answer === false ? 'No' : 'Not answered'; }
  function Done() {
    return LOGOS + '<div class="card done"><div class="tick">' + ico('check') + '</div><h1 tabindex="-1">Thank you, ' + e(st.first) + '</h1><p class="lead">Your consultant will be with you shortly.</p>' +
      '<div class="recap"><div class="rs"><small>Personal recommendations</small>' + e(st.recapR) + '</div><div class="rm"><small>News and events</small>' + e(st.recapN) + '</div></div></div>' +
      '<p class="cap">To change your choices at any time, tell any member of the boutique team or write to ' + e(cfg.contact) + '.</p>' +
      (kiosk ? '<div class="save"><button type="button" class="btn" data-a="reset">Finish</button></div>' : '<p class="cap">You can now close this page.</p>');
  }
  function Message(title, text, retry) { document.title = title + ' · SEIKO'; return LOGOS + '<div class="card done"><h1 tabindex="-1">' + e(title) + '</h1><p class="lead">' + e(text) + '</p></div>' + (retry ? '<div class="save"><button type="button" class="btn" data-a="reload">Try again</button></div>' : ''); }

  var SCREENS = { welcome: Welcome, form: Form, done: Done };
  var TITLES = { welcome: 'Welcome', form: 'Boutique check-in', done: 'Thank you' };
  function draw(focusTop) {
    page.innerHTML = SCREENS[st.step]();
    document.title = TITLES[st.step] + ' · SEIKO';
    if (focusTop) { var bad = page.querySelector('[aria-invalid="true"]') || page.querySelector('#qs .err'); if (bad && bad.tagName === 'INPUT') bad.focus(); else { var h = page.querySelector('h1'); if (h) h.focus(); window.scrollTo(0, 0); if (bad) bad.scrollIntoView({ block: 'center' }); } }
  }
  // only the two questions are drawn again after a choice or after typing, so the field being typed in is never replaced
  function drawQuestions(keep) {
    var box = document.getElementById('qs'); if (!box) return;
    var a = document.activeElement, sel = a && box.contains(a) && a.getAttribute('data-q') ? '[data-q="' + a.getAttribute('data-q') + '"]' + ['data-answer', 'data-channels', 'data-brands'].map(function (n) { return a.getAttribute(n) ? '[' + n + '="' + a.getAttribute(n) + '"]' : ''; }).join('') : '';
    box.innerHTML = questions();
    if (keep !== false && sel) { var n = box.querySelector(sel); if (n) n.focus(); }
  }
  // a way whose contact detail is no longer valid is dropped, never kept
  function prune() { var ok = ways().map(function (w) { return w[0]; }); ['recommend', 'news'].forEach(function (q) { st[q].channels = st[q].channels.filter(function (ch) { return ok.indexOf(ch) > -1; }); }); }

  function check() {
    var er = {};
    ['first', 'last', 'mobile', 'email'].forEach(function (k) { st[k] = String(st[k] || '').trim(); });
    if (!st.first) er.first = 'Enter your first name.'; if (!st.last) er.last = 'Enter your last name.';
    if (st.mobile && !validPhone(st.mobile)) er.mobile = 'Enter a phone number with 7 to 15 digits, for example 07700 900123. Or leave it empty.';
    if (st.email && !validEmail(st.email)) er.email = 'Enter a full email address, for example name@example.com. Or leave it empty.';
    prune();
    [['recommend', 'Personal recommendations'], ['news', 'News and events']].forEach(function (q) {
      var a = st[q[0]]; if (a.answer !== true || a.channels.length) return;
      er[q[0]] = q[1] + ': ' + (ways().length ? 'choose at least one way to hear from us, or choose No.' : 'add your phone number or email address, or choose No.');
    });
    st.errors = er; return !Object.keys(er).length;
  }
  function save() {
    if (st.sending) return;
    if (!check()) { draw(true); return; }
    var pick = function (a) { return { answer: a.answer, channels: a.answer === true ? a.channels.slice() : [], brands: a.answer === true ? a.brands.slice() : [] }; };
    var payload = { v: 4, ts: Date.now(), s: topic, first: st.first, last: st.last, mobile: st.mobile, email: st.email, recommend: pick(st.recommend), news: pick(st.news), noticeVersion: cfg.v, device: kiosk ? 'ipad' : 'phone' };
    st.sending = true; st.failed = false; draw();
    var done = function (ok) {
      st.sending = false;
      if (!ok) { st.failed = true; draw(); var b = page.querySelector('.errsum'); if (b) b.scrollIntoView({ block: 'center' }); return; }
      if (!kiosk) { try { sessionStorage.setItem(USED, JSON.stringify(usedCodes().concat([topic]))); } catch (x) {} }
      // nothing the customer typed stays in the page after the thank-you screen has been drawn
      var first = st.first, r = recap(payload.recommend), n = recap(payload.news);
      st = fresh(); st.step = 'done'; st.first = first; st.recapR = r; st.recapN = n;
      draw(true);
      if (kiosk) timer = setTimeout(reset, RETURN);
    };
    // On the same device the details wait in a short queue until the CRM collects them. A second customer never
    // replaces the first: the CRM may be locked, or busy, when they arrive.
    if (local) {
      try {
        var waiting = []; try { var w = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); waiting = Array.isArray(w) ? w : w && w.ts ? [w] : []; } catch (x) { waiting = []; }
        waiting = waiting.filter(function (p) { return p && p.ts && Date.now() - p.ts < 15 * 60000; }).slice(-20);
        waiting.push(payload); localStorage.setItem(LOCAL_KEY, JSON.stringify(waiting)); done(true);
      } catch (x) { done(false); }
      return;
    }
    encrypt(JSON.stringify(payload), topic).then(function (enc) {
      var body = JSON.stringify({ enc: enc }), left = RELAYS.length, ok = false;
      RELAYS.forEach(function (h) { withTimeout(h + '/' + topic, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain' } }, 9000).then(function (r) { if (r.ok && !ok) { ok = true; done(true); } }, function () {}).then(function () { if (--left === 0 && !ok) done(false); }); });
    }, function () { done(false); });
  }
  function reset() { clearTimeout(timer); st = fresh(); draw(true); }

  // ---- events
  page.addEventListener('input', function (ev) {
    var k = ev.target.getAttribute('data-k'); if (!k) return;
    st[k] = ev.target.value;
    if (k === 'mobile' || k === 'email') { clearTimeout(typeT); typeT = setTimeout(function () { prune(); drawQuestions(false); }, 250); }
  });
  page.addEventListener('change', function (ev) {
    var t = ev.target, q = t.getAttribute('data-q'); if (!q) return;
    var a = st[q];
    if (t.getAttribute('data-answer')) { a.answer = t.getAttribute('data-answer') === 'yes'; if (!a.answer) { a.channels = []; a.brands = []; } }
    ['channels', 'brands'].forEach(function (kind) { var v = t.getAttribute('data-' + kind); if (v == null) return; var i = a[kind].indexOf(v); if (t.checked && i < 0) a[kind].push(v); if (!t.checked && i > -1) a[kind].splice(i, 1); });
    delete st.errors[q];
    drawQuestions();
  });
  page.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.getAttribute('data-k')) { ev.preventDefault(); save(); } });
  page.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-a]'); if (!b || b.disabled) return;
    var a = b.getAttribute('data-a');
    if (a === 'start') { st.step = 'form'; draw(true); }
    else if (a === 'reset') reset();
    else if (a === 'reload') location.reload();
    else if (a === 'save') save();
  });
  // on the boutique iPad a form left half-filled is cleared, so the next customer never sees it
  function idle() { clearTimeout(idleT); if (kiosk) idleT = setTimeout(function () { if (st && st.step === 'form') reset(); idle(); }, IDLE); }
  ['click', 'input', 'keydown', 'touchstart'].forEach(function (n) { document.addEventListener(n, idle, { passive: true }); });

  // ---- start
  st = fresh();
  if (!topic || (!local && !key)) { page.innerHTML = Message('This page opens from a code', 'Please ask your consultant to show you the check-in code.'); return; }
  if (issued && Date.now() - issued > TTL) { page.innerHTML = Message('This code has expired', 'Please ask your consultant for a new code.'); return; }
  if (!kiosk && usedCodes().indexOf(topic) > -1) { page.innerHTML = Message('Thank you', 'Your details have been saved. You can now close this page.'); return; }
  if (!window.crypto || !crypto.subtle) { page.innerHTML = Message('This page cannot open here', 'Please ask your consultant for help.'); return; }
  loadCfg().then(function (c) {
    if (!c) { page.innerHTML = Message('The page could not load', 'Please check the connection and try again, or ask your consultant.', true); return; }
    cfg = c; draw(true); idle();
  });
})();
