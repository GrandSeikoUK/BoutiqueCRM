// Seiko CRM V3.0 - the customer check-in page. One page, on one card:
// your details (name, phone, email, country, city, birthday), personal recommendations, newsletters and events,
// your privacy, Save. Then a thank-you screen with no way onward.
// The page cannot read anything from the CRM. What the customer enters is encrypted on this device FOR THE CRM that
// issued the code: the code carries a public key, and only that CRM holds the private key. Whoever holds the code can
// send details and cannot read them. The relays carry encrypted text only. checkin-rx.js explains the method (version 5).
(function () {
  'use strict';
  var RELAYS = ['https://ntfy.envs.net', 'https://ntfy.adminforge.de', 'https://ntfy.hostux.net', 'https://ntfy.mzte.de', 'https://ntfy.sh'];
  var LOCAL_KEY = 'seiko-crm3-checkin', LOCAL_CFG = 'seiko-crm3-checkin-cfg', USED = 'seiko-crm3-used', PROTOCOL = 5;
  var INFO_DETAILS = 'seiko-crm3 check-in details v5', INFO_WORDING = 'seiko-crm3 check-in wording v5', EC = { name: 'ECDH', namedCurve: 'P-256' };
  var qs = new URLSearchParams(location.search), hp = new URLSearchParams(location.hash.replace(/^#/, ''));
  var topic = qs.get('s') || '', local = qs.get('m') === 'local', kiosk = qs.get('d') === 'ipad', pub = hp.get('e') || '', mark = hp.get('h') || '', issued = Number(hp.get('t')) || 0;
  var TTL = kiosk ? 12 * 3600000 : 20 * 60000, IDLE = 120000, RETURN = 12000;
  var page = document.getElementById('page');
  // way of contact: key, label, icon, the detail it needs
  var WAYS = [['email', 'Email', 'mail', 'email'], ['phone', 'Phone', 'call', 'mobile'], ['sms', 'SMS', 'sms', 'mobile'], ['whatsapp', 'WhatsApp', '', 'mobile']];
  var WA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
  // every country, in the order of the flags in assets/flags-sprite.png (15 to a row, 40 x 30 each, shown at half size)
  var COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bermuda","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Cape Verde","Cayman Islands","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo, Democratic Republic","Congo, Republic","Costa Rica","Côte d\u0027Ivoire","Croatia","Cuba","Cyprus","Czechia","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Gibraltar","Greece","Grenada","Guatemala","Guernsey","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hong Kong","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Isle of Man","Israel","Italy","Jamaica","Japan","Jersey","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Macau","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","São Tomé and Príncipe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function countryIndex(name) { return COUNTRIES.indexOf(name); }
  function flagPos(i) { return i < 0 ? '0 -9999px' : '-' + (i % 15) * 20 + 'px -' + Math.floor(i / 15) * 15 + 'px'; }
  // the flag is placed by script, not by a style attribute: the page's Content-Security-Policy allows no style attribute
  function placeFlag() { var f = document.getElementById('flag-country'); if (f) f.style.backgroundPosition = flagPos(countryIndex(st.country)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var cfg = null, st = null, timer = null, idleT = null, typeT = null;
  // answer: null until the customer chooses; true = Yes; false = No. The country starts on United Kingdom, as the prototype's page did.
  function fresh() { return { step: kiosk ? 'welcome' : 'form', first: '', last: '', mobile: '', email: '', country: 'United Kingdom', city: '', bday: '', bmonth: '', recommend: { answer: null, channels: [], brands: [] }, news: { answer: null, channels: [], brands: [] }, errors: {}, sending: false, failed: false }; }

  // ---- small helpers
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function e(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function ico(n, cls) { return '<span class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + n + '</span>'; }
  function validEmail(x) { return /^[^\s@<>"()[\]\\,;:]+@[^\s@<>"()[\]\\,;:]+\.[^\s@<>"()[\]\\,;:]{2,}$/.test(String(x || '').trim()); }
  function validPhone(p) { var s = String(p || '').trim(), d = s.replace(/\D/g, ''); return /^[+\d][\d\s().-]*$/.test(s) && d.length >= 7 && d.length <= 15; }
  function has(kind) { return kind === 'email' ? validEmail(st.email) : validPhone(st.mobile); }
  function ways() { return WAYS.filter(function (w) { return has(w[3]); }); }
  function wayLabel(k) { return WAYS.filter(function (w) { return w[0] === k; })[0][1]; }
  function b64url(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function bytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function withTimeout(url, opts, ms) { var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms || 8000); opts = opts || {}; opts.signal = c.signal; return fetch(url, opts).then(function (r) { clearTimeout(t); return r; }, function (x) { clearTimeout(t); throw x; }); }
  function utf8(s) { return new TextEncoder().encode(String(s)); }
  function aesKey(secret, salt, info, usage) {
    return crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']).then(function (k) { return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: utf8(salt), info: utf8(info) }, k, { name: 'AES-GCM', length: 256 }, false, usage); });
  }
  // The details, encrypted for the CRM. A pair of keys is made for this one message; with the public key of the code it
  // gives a secret that only this page and the CRM can work out. Nothing that could open the message stays here.
  function seal(obj) {
    var mine, epk;
    return crypto.subtle.generateKey(EC, true, ['deriveBits']).then(function (k) { mine = k; return crypto.subtle.exportKey('raw', k.publicKey); })
      .then(function (raw) { epk = b64url(raw); return crypto.subtle.importKey('raw', bytes(pub), EC, false, []); })
      .then(function (theirs) { return crypto.subtle.deriveBits({ name: 'ECDH', public: theirs }, mine.privateKey, 256); })
      .then(function (secret) { return aesKey(secret, topic, INFO_DETAILS, ['encrypt']); })
      .then(function (k) { var iv = crypto.getRandomValues(new Uint8Array(12)); return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: utf8(topic + '|' + epk) }, k, utf8(JSON.stringify(obj))).then(function (ct) { ct = new Uint8Array(ct); var out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return { v: PROTOCOL, epk: epk, enc: b64url(out) }; }); });
  }
  // The wording, as the CRM published it for this code. It is accepted only when its fingerprint is the one in the code.
  function openWording(enc) {
    var hb = bytes(mark), all = bytes(enc), plain;
    return aesKey(hb, topic, INFO_WORDING, ['decrypt']).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12), additionalData: utf8(topic + '-cfg') }, k, all.slice(12)); })
      .then(function (p) { plain = new TextDecoder().decode(p); return crypto.subtle.digest('SHA-256', utf8(plain)); })
      .then(function (d) { if (b64url(new Uint8Array(d).slice(0, 16)) !== b64url(hb)) throw new Error('not the wording of this code'); return JSON.parse(plain); });
  }
  function usedCodes() { try { return JSON.parse(sessionStorage.getItem(USED) || '[]'); } catch (x) { return []; } }
  function safeUrl(u) { return /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : ''; }

  // ---- the privacy statement, the two questions and the brands come from the CRM, so the customer sees the published version
  function goodCfg(c) { return !!(c && c.v && c.statement && c.rq && c.nq && Array.isArray(c.brands)); }
  function loadCfg() {
    if (local) { try { var c = JSON.parse(localStorage.getItem(LOCAL_CFG) || 'null'); return Promise.resolve(goodCfg(c) ? c : null); } catch (x) { return Promise.resolve(null); } }
    // every message a relay holds for this code is tried, the newest first. One that is not the wording of this code is passed over.
    var tries = RELAYS.map(function (h) {
      return withTimeout(h + '/' + topic + '-cfg/json?poll=1&since=all', { cache: 'no-store' }, 7000).then(function (r) { if (!r.ok) throw new Error('refused'); return r.text(); }).then(function (t) {
        var found = [];
        t.split('\n').forEach(function (l) { if (!l.trim()) return; try { var m = JSON.parse(l); if (m.event === 'message') { var d = JSON.parse(m.message); if (d && d.v === PROTOCOL && typeof d.enc === 'string' && d.enc.length < 20000) found.unshift(d.enc); } } catch (x) {} });
        return found.slice(0, 5).reduce(function (p, enc) { return p.catch(function () { return openWording(enc).then(function (c) { if (!goodCfg(c)) throw new Error('bad'); return c; }); }); }, Promise.reject(new Error('none')));
      });
    });
    return new Promise(function (resolve) { var left = tries.length, done = false; tries.forEach(function (p) { p.then(function (c) { if (!done) { done = true; resolve(c); } }, function () { if (--left === 0 && !done) resolve(null); }); }); });
  }

  // ---- pieces
  var LOGOS = '<div class="logos"><img class="gs" src="assets/grand-seiko-logo.png" alt="Grand Seiko"><i></i><img class="sk" src="assets/seiko-logo.png" alt="Seiko"></div>';
  function errLine(k) { var err = st.errors[k]; return err ? '<p class="err" id="e-' + k + '">' + ico('error') + '<span>' + e(err) + '</span></p>' : ''; }
  function input(k, label, o) {
    o = o || {}; var err = st.errors[k];
    return '<div class="f"><label class="fl" for="i-' + k + '">' + e(label) + (o.opt ? ' <span>(optional)</span>' : '') + '</label><input class="inp" id="i-' + k + '" data-k="' + k + '" type="' + (o.type || 'text') + '" value="' + e(st[k]) + '" autocomplete="' + (o.ac || 'off') + '"' + (o.mode ? ' inputmode="' + o.mode + '"' : '') + ' maxlength="' + (o.max || 80) + '"' + (err ? ' aria-invalid="true" aria-describedby="e-' + k + '"' : '') + (o.cap ? ' autocapitalize="' + o.cap + '"' : '') + '>' + errLine(k) + '</div>';
  }
  // a list to choose from. opts: [[value, words]]. With a flag, the flag of the chosen country lies at the left of the box.
  function select(k, label, opts, o) {
    o = o || {}; var err = st.errors[k];
    return '<div class="sel' + (o.flag ? ' f-flag' : '') + '">' + (o.flag ? '<span class="flag" id="flag-' + k + '" aria-hidden="true"></span>' : '') +
      '<select class="inp" id="i-' + k + '" data-k="' + k + '"' + (label ? ' aria-label="' + e(label) + '"' : '') + (o.ac ? ' autocomplete="' + o.ac + '"' : '') + (err ? ' aria-invalid="true" aria-describedby="e-' + k + '"' : '') + '>' +
      opts.map(function (x) { return '<option value="' + e(x[0]) + '"' + (String(st[k]) === String(x[0]) ? ' selected' : '') + '>' + e(x[1]) + '</option>'; }).join('') + '</select>' + ico('expand_more', 'chev') + '</div>';
  }
  function details() {
    var days = [['', 'Day']], months = [['', 'Month']], i;
    for (i = 1; i <= 31; i++) days.push([String(i), String(i)]);
    for (i = 1; i <= 12; i++) months.push([String(i), MONTHS[i - 1]]);
    return '<section aria-label="Your details" class="fields"><div class="row">' + input('first', 'First name', { ac: 'given-name', cap: 'words' }) + input('last', 'Last name', { ac: 'family-name', cap: 'words' }) + '</div>' +
      input('mobile', 'Phone', { type: 'tel', ac: 'tel', mode: 'tel', max: 24 }) + input('email', 'Email', { type: 'email', ac: 'email', mode: 'email', max: 120, cap: 'none' }) +
      '<div class="f"><label class="fl" for="i-country">Country</label>' + select('country', '', COUNTRIES.map(function (n) { return [n, n]; }), { flag: true, ac: 'country-name' }) + '</div>' +
      input('city', 'City', { ac: 'address-level2', cap: 'words', max: 60 }) +
      '<div class="f"><span class="fl" id="l-bday">Birthday · day and month <span>(optional)</span></span><div class="row">' + select('bday', 'Birthday day', days) + select('bmonth', 'Birthday month', months) + '</div>' + errLine('bday') + '</div></section>';
  }
  // one question: Yes or No, and under Yes the ways and the brands. q = 'recommend' or 'news'
  function question(q, title, icon, text) {
    var a = st[q], w = ways(), err = st.errors[q];
    var yn = function (val, label) { var on = a.answer === val; return '<label class="opt yn' + (on ? ' on' : '') + '"><input type="radio" name="' + q + '" data-q="' + q + '" data-answer="' + (val ? 'yes' : 'no') + '"' + (on ? ' checked' : '') + '><span>' + label + '</span></label>'; };
    var tick = function (kind, v, label, badge) { var on = a[kind].indexOf(v) > -1; return '<label class="opt' + (on ? ' on' : '') + (badge ? '' : ' plain') + '"><input type="checkbox" data-q="' + q + '" data-' + kind + '="' + e(v) + '"' + (on ? ' checked' : '') + '>' + (badge || '') + '<span>' + e(label) + '</span></label>'; };
    var more = '';
    if (a.answer === true) {
      more = '<div class="ifyes"><span class="k">If yes</span><h3 id="h-' + q + '-w">How would you like to hear from us?</h3>' +
        (w.length ? '<div class="opts" role="group" aria-labelledby="h-' + q + '-w">' + w.map(function (x) { return tick('channels', x[0], x[1], '<span class="rc" aria-hidden="true">' + (x[0] === 'whatsapp' ? WA : ico(x[2], 'c-' + x[0])) + '</span>'); }).join('') + '</div>'
          : '<p class="hint">Add your phone number or your email address above. The ways to choose then appear here.</p>') +
        (err ? '<p class="err" id="e-' + q + '">' + ico('error') + '<span>' + e(err) + '</span></p>' : '') +
        (cfg.brands.length > 1 ? '<h3 class="gap" id="h-' + q + '-b">Which brands?</h3><div class="opts" role="group" aria-labelledby="h-' + q + '-b">' + cfg.brands.map(function (b) { return tick('brands', b, b); }).join('') + '</div>' : '') + '</div>';
    }
    return '<section class="q sep" aria-label="' + e(title) + '"><div class="qh">' + ico(icon) + '<span class="k">' + e(title) + '</span></div><h2 id="h-' + q + '">' + e(text) + '</h2>' +
      '<div class="two" role="radiogroup" aria-labelledby="h-' + q + '">' + yn(true, 'Yes') + yn(false, 'No') + '</div>' + more + '</section>';
  }
  function questions() { return question('recommend', 'Personal recommendations', 'watch', cfg.rq) + question('news', 'Newsletters and events', 'campaign', cfg.nq); }
  function errSum() { var ks = Object.keys(st.errors); return ks.length ? '<p class="errsum" role="alert"><b>Please check:</b> ' + ks.map(function (k) { return e(st.errors[k]); }).join(' ') + '</p>' : ''; }

  // ---- screens
  function Welcome() { return LOGOS + '<div class="card done"><h1 tabindex="-1">Welcome to SEIKO</h1><p class="lead">Tell us your name so that your consultant can look after you. It takes about a minute.</p></div><div class="save"><button type="button" class="btn" data-a="start">Start' + ico('arrow_forward') + '</button></div>'; }
  function Form() {
    var url = safeUrl(cfg.url);
    return LOGOS + '<h1 tabindex="-1">Boutique check-in</h1><div id="sum">' + errSum() + '</div>' +
      '<div class="card">' + details() +
      '<div id="qs">' + questions() + '</div>' +
      '<div class="privacy sep"><span class="k">Your privacy</span><p>' + e(cfg.statement) + '</p><p>' + e(cfg.rights) + ' <a href="mailto:' + e(cfg.contact) + '">' + e(cfg.contact) + '</a></p>' +
      (url ? '<a href="' + e(url) + '" target="_blank" rel="noopener noreferrer">Read the full Privacy Policy</a>' : '') + '</div>' +
      (st.failed ? '<p class="errsum" role="alert">We could not save your details. Please check the connection and try again, or tell your consultant.</p>' : '') +
      '<div class="save"><button type="button" class="btn" data-a="save"' + (st.sending ? ' disabled' : '') + '>' + (st.sending ? 'Saving…' : 'Save') + '</button><p class="cap">Your consultant sees these details on their screen straight away.</p>' +
      (kiosk ? '<button type="button" class="btn plain" data-a="reset">Cancel</button>' : '') + '</div></div>';
  }
  function recap(a) { return a.answer === true ? 'Yes · ' + a.channels.map(wayLabel).join(', ') + (a.brands.length ? ' · ' + a.brands.join(', ') : '') : a.answer === false ? 'No' : 'Not answered'; }
  function Done() {
    return LOGOS + '<div class="card done"><div class="tick">' + ico('check') + '</div><h1 tabindex="-1">Thank you, ' + e(st.first) + '</h1><p class="lead">Your consultant will be with you shortly.</p>' +
      '<div class="recap"><div><small>Personal recommendations</small>' + e(st.recapR) + '</div><div><small>Newsletters and events</small>' + e(st.recapN) + '</div></div></div>' +
      '<p class="cap">To change your choices at any time, tell any member of the boutique team or write to ' + e(cfg.contact) + '.</p>' +
      (kiosk ? '<div class="save"><button type="button" class="btn" data-a="reset">Finish</button></div>' : '<p class="cap">You can now close this page.</p>');
  }
  function Message(title, text, retry) { document.title = title + ' · SEIKO'; return LOGOS + '<div class="card done"><h1 tabindex="-1">' + e(title) + '</h1><p class="lead">' + e(text) + '</p></div>' + (retry ? '<div class="save"><button type="button" class="btn" data-a="reload">Try again</button></div>' : ''); }

  var SCREENS = { welcome: Welcome, form: Form, done: Done };
  var TITLES = { welcome: 'Welcome', form: 'Boutique check-in', done: 'Thank you' };
  function draw(focusTop) {
    page.innerHTML = SCREENS[st.step]();
    document.title = TITLES[st.step] + ' · SEIKO'; placeFlag();
    if (focusTop) { var bad = page.querySelector('[aria-invalid="true"]') || page.querySelector('#qs .err'); if (bad && (bad.tagName === 'INPUT' || bad.tagName === 'SELECT')) bad.focus(); else { var h = page.querySelector('h1'); if (h) h.focus(); window.scrollTo(0, 0); if (bad) bad.scrollIntoView({ block: 'center' }); } }
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
    ['first', 'last', 'mobile', 'email', 'city'].forEach(function (k) { st[k] = String(st[k] || '').replace(/\s+/g, ' ').trim(); });
    if (!st.first) er.first = 'Enter your first name.'; if (!st.last) er.last = 'Enter your last name.';
    if (st.mobile && !validPhone(st.mobile)) er.mobile = 'Enter a phone number with 7 to 15 digits, for example 07700 900123. Or leave it empty.';
    if (st.email && !validEmail(st.email)) er.email = 'Enter a full email address, for example name@example.com. Or leave it empty.';
    if (countryIndex(st.country) < 0) st.country = '';
    // the birthday is optional, but half of one is not kept: both the day and the month, or neither
    var d = Number(st.bday) || 0, m = Number(st.bmonth) || 0;
    if ((d && !m) || (m && !d)) er.bday = 'Choose both the day and the month of your birthday, or leave both empty.';
    else if (d && (m < 1 || m > 12 || d < 1 || d > MONTH_DAYS[m - 1])) er.bday = 'That day does not exist in ' + (MONTHS[m - 1] || 'that month') + '. Please choose again.';
    prune();
    [['recommend', 'Personal recommendations'], ['news', 'Newsletters and events']].forEach(function (q) {
      var a = st[q[0]]; if (a.answer !== true || a.channels.length) return;
      er[q[0]] = q[1] + ': ' + (ways().length ? 'choose at least one way to hear from us, or choose No.' : 'add your phone number or email address, or choose No.');
    });
    st.errors = er; return !Object.keys(er).length;
  }
  function save() {
    if (st.sending) return;
    if (!check()) { draw(true); return; }
    var pick = function (a) { return { answer: a.answer, channels: a.answer === true ? a.channels.slice() : [], brands: a.answer === true ? a.brands.slice() : [] }; };
    var payload = { v: PROTOCOL, ts: Date.now(), s: topic, first: st.first, last: st.last, mobile: st.mobile, email: st.email, country: st.country, city: st.city, birthday: st.bday && st.bmonth ? pad(Number(st.bmonth)) + '-' + pad(Number(st.bday)) : '', recommend: pick(st.recommend), news: pick(st.news), noticeVersion: cfg.v, device: kiosk ? 'ipad' : 'phone' };
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
    seal(payload).then(function (sealed) {
      var body = JSON.stringify(sealed), left = RELAYS.length, ok = false;
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
    var t = ev.target, k = t.getAttribute('data-k'), q = t.getAttribute('data-q');
    if (k) {
      st[k] = t.value;
      if (k === 'country') placeFlag();
      // a message about the birthday goes as soon as the day or the month is chosen again
      if (k === 'bday' || k === 'bmonth') { delete st.errors.bday; var m = document.getElementById('e-bday'); if (m) m.parentNode.removeChild(m); ['bday', 'bmonth'].forEach(function (x) { var s = document.getElementById('i-' + x); if (s) { s.removeAttribute('aria-invalid'); s.removeAttribute('aria-describedby'); } }); var sum = document.getElementById('sum'); if (sum) sum.innerHTML = errSum(); }
      return;
    }
    if (!q) return;
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
  // shown inside another page, somebody else would decide what the customer sees around it
  var framed = true; try { framed = window.top !== window.self; } catch (x) {}
  if (framed) { page.innerHTML = Message('This page cannot open here', 'Please open the check-in code with the camera of your phone.'); return; }
  if (!topic || !/^[A-Za-z0-9_-]{8,64}$/.test(topic) || (!local && (!/^[A-Za-z0-9_-]{80,100}$/.test(pub) || !/^[A-Za-z0-9_-]{20,24}$/.test(mark)))) { page.innerHTML = Message('This page opens from a code', 'Please ask your consultant to show you the check-in code.'); return; }
  if (issued && Date.now() - issued > TTL) { page.innerHTML = Message('This code has expired', 'Please ask your consultant for a new code.'); return; }
  if (!kiosk && usedCodes().indexOf(topic) > -1) { page.innerHTML = Message('Thank you', 'Your details have been saved. You can now close this page.'); return; }
  if (!window.crypto || !crypto.subtle) { page.innerHTML = Message('This page cannot open here', 'Please ask your consultant for help.'); return; }
  loadCfg().then(function (c) {
    if (!c) { page.innerHTML = Message('The page could not load', 'Please check the connection and try again, or ask your consultant.', true); return; }
    cfg = c; draw(true); idle();
  });
})();
