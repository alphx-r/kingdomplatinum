/* admin-player.js — acesso por PLAYER (Chefe / ADM / MOD por site) + botão no nome do player.
   Uso (em TODO html, no <head>):  <script src="/admin-player.js"></script>
   Opcional: data-site="torneios" para forçar o nome do site (senão sai do caminho da URL).
   A lista vem de config.kp_staff (projeto do index):
     { "chefe":"ricky", "admins":["jef","lucas"], "mods":{ "torneios":[], "stores":[] } }
   IMPORTANTE: isto só controla a INTERFACE. Quem protege os dados é o servidor (token do player). */
(function () {
  if (window.KPAdm) return;
  var SU = 'https://ucbkodkjlbatttiuqjtv.supabase.co', SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjYmtvZGtqbGJhdHR0aXVxanR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NjExODcsImV4cCI6MjA5MzMzNzE4N30.a65MSk7m4DvgTw2pHXhaqMOOEpjTB_wPsXJUfvOGiG4';
  var KS = 'kp_ficha_sessao', KP = 'kp_preview', KC = 'kp_staff_cache';
  var PADRAO = { chefe: 'ricky', admins: ['jef', 'lucas'], mods: {} };
  var nrm = function (s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toLowerCase(); };

  var cs = document.currentScript;
  var SITE = (cs && cs.getAttribute('data-site')) || (function () {
    var p = location.pathname.replace(/\/+$/, '').replace(/\.html$/, '').split('/').pop() || 'index';
    return { pokemart: 'stores' }[p] || p;
  })();

  function lista(a) { return Array.isArray(a) ? a.map(function (x) { return nrm(x && typeof x === 'object' ? x.nome : x); }).filter(Boolean) : []; }
  function norm(v) {
    if (!v || typeof v !== 'object') return null;
    var mods = {}; Object.keys(v.mods || {}).forEach(function (k) { mods[String(k).toLowerCase()] = lista(v.mods[k]); });
    return { chefe: nrm(v.chefe) || PADRAO.chefe, admins: lista(v.admins), mods: mods };
  }
  var staff = null;
  try { staff = norm(JSON.parse(sessionStorage.getItem(KC))); } catch (e) {}
  if (!staff) staff = PADRAO;

  function ses() { try { var s = JSON.parse(localStorage.getItem(KS)); return s && s.token ? s : null; } catch (e) { return null; } }
  function nome() { var s = ses(); return s ? s.nome || '' : ''; }
  function papel() {
    var n = nrm(nome()); if (!n) return null;
    if (n === staff.chefe) return 'chefe';
    if (staff.admins.indexOf(n) >= 0) return 'admin';
    var m = staff.mods[SITE]; if (m && m.indexOf(n) >= 0) return 'mod';
    return null;
  }
  function modoOn() { try { return sessionStorage.getItem(KP) !== '1'; } catch (e) { return true; } }

  var ouvintes = [];
  function emit() { ouvintes.forEach(function (f) { try { f(); } catch (e) {} }); }

  /* ── botão no nome do player ── */
  var busy = false;
  var SEL = '#nav-player-name,#nav-who';
  function pintar() {
    if (busy) return;
    var p = papel(), on = modoOn(), btnEq = document.getElementById('btn-equipe');
    if (btnEq) btnEq.style.display = (p === 'chefe' || p === 'admin') ? '' : 'none';
    Array.prototype.forEach.call(document.querySelectorAll(SEL), function (el) {
      var txt = el.textContent.replace(/^(ADM|MOD)\s+/, '').trim();
      /* páginas sem código próprio para o nome (npcdex...): preenche com o player logado */
      if ((!txt || txt === '—') && ses() && nome() && el.hasAttribute('data-kp-fill')) txt = nome();
      if (!p || !txt || txt === '—' || txt === 'Entrar') { el.classList.remove('kp-adm-tog', 'kp-off'); if (txt && el.textContent !== txt) { busy = true; el.textContent = txt; busy = false; } return; }
      var label = (on ? (p === 'mod' ? 'MOD ' : 'ADM ') : '') + txt;
      if (el.textContent !== label) { busy = true; el.textContent = label; busy = false; }
      el.classList.add('kp-adm-tog'); el.classList.toggle('kp-off', !on);
      el.title = on ? 'Modo ' + (p === 'mod' ? 'MOD' : 'ADM') + ' ativo. Toque para ver como player' : 'Modo player. Toque para voltar ao ' + (p === 'mod' ? 'MOD' : 'ADM');
    });
  }
  function toggle() {
    if (!papel()) return;
    /* torneios/stores já têm togPreview(): ela grava kp_preview e repinta a página */
    if (typeof window.togPreview === 'function') { window.togPreview(); setTimeout(function () { pintar(); emit(); }, 260); return; }
    try { sessionStorage.setItem(KP, modoOn() ? '1' : ''); } catch (e) {}
    pintar(); emit();
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest(SEL);
    if (t && papel()) { e.preventDefault(); e.stopImmediatePropagation(); toggle(); }
  }, true);


  /* ── senha do player (para ações que gravam no servidor); fica só nesta aba ── */
  var KK = 'kp_adm_cred';
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var DLG = 'padding:20px;border:1px solid rgba(255,255,255,.18);border-radius:14px;background:var(--bg,#1b1b20);color:var(--text,#fff);max-width:min(92vw,460px);width:100%;font:14px/1.4 system-ui,sans-serif';
  var INP = 'width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:inherit;font:inherit;margin:6px 0';
  var BTN = 'padding:9px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:inherit;font:inherit;font-weight:700;cursor:pointer';
  function credLimpar() { try { sessionStorage.removeItem(KK); } catch (e) {} }
  function cred(msg) {
    return new Promise(function (ok) {
      var c = null; try { c = JSON.parse(sessionStorage.getItem(KK)); } catch (e) {}
      if (c && c.n && c.s) return ok(c);
      var d = el('dialog', DLG);
      d.innerHTML = '<h3 style="margin:0 0 6px">Confirme sua senha</h3><p style="margin:0 0 8px;opacity:.75">' + esc(msg || 'Para salvar, confirme a senha do seu player.') + '</p>' +
        '<input id="kpc-n" style="' + INP + '" placeholder="Nome do player" value="' + esc(nome()) + '"><input id="kpc-s" type="password" style="' + INP + '" placeholder="Senha">' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button id="kpc-x" style="' + BTN + '">Cancelar</button><button id="kpc-o" style="' + BTN + ';background:#3bb54a;border-color:#3bb54a">Confirmar</button></div>';
      var v = null; document.body.appendChild(d);
      var go = function () { var n = d.querySelector('#kpc-n').value.trim(), s = d.querySelector('#kpc-s').value; if (!n || !s) return; v = { n: n, s: s }; try { sessionStorage.setItem(KK, JSON.stringify(v)); } catch (e) {} d.close(); };
      d.querySelector('#kpc-o').onclick = go; d.querySelector('#kpc-x').onclick = function () { d.close(); };
      d.querySelector('#kpc-s').onkeydown = function (e) { if (e.key === 'Enter') go(); };
      d.addEventListener('close', function () { d.remove(); ok(v); }, { once: true }); d.showModal();
    });
  }

  /* ── editor da lista de acesso (Chefe e ADMs) ── */
  var SITES = ['torneios', 'stores', 'mapa', 'npcdex', 'fichas', 'missoes', 'weathercast', 'datadex'];
  function editor() {
    var p = papel(); if (p !== 'chefe' && p !== 'admin') return;
    var nv = JSON.parse(JSON.stringify(staff)); nv.mods = nv.mods || {};
    SITES.forEach(function (k) { if (!nv.mods[k]) nv.mods[k] = []; });
    var d = el('dialog', DLG + ';max-height:88vh;overflow:auto'), dl = el('datalist'); dl.id = 'kpe-pl'; d.appendChild(dl);
    fetch(SU + '/rest/v1/players?select=nome&order=nome.asc', { headers: { apikey: SKEY, Authorization: 'Bearer ' + SKEY } }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (L) { dl.innerHTML = (L || []).map(function (x) { return '<option value="' + esc(x.nome) + '">'; }).join(''); }).catch(function () {});
    var corpo = el('div'); d.appendChild(corpo);
    function sec(titulo, arr) {
      var h = '<div style="margin:12px 0 4px;font-weight:800">' + esc(titulo) + '</div><div style="display:flex;flex-wrap:wrap;gap:6px">' +
        (arr.map(function (n, i) { return '<span style="padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.1)">' + esc(n) + ' <a href="#" data-del="' + i + '" style="color:inherit;text-decoration:none;opacity:.7">✕</a></span>'; }).join('') || '<span style="opacity:.6">ninguém</span>') + '</div>' +
        '<div style="display:flex;gap:6px"><input list="kpe-pl" placeholder="Adicionar player…" style="' + INP + '"><button data-add style="' + BTN + ';margin:6px 0">+</button></div>';
      var box = el('div', '', h);
      box.addEventListener('click', function (e) {
        var a = e.target.closest('[data-del]'), b = e.target.closest('[data-add]');
        if (a) { e.preventDefault(); arr.splice(+a.getAttribute('data-del'), 1); desenha(); }
        if (b) { var n = nrm(box.querySelector('input').value); if (n && arr.indexOf(n) < 0 && n !== nv.chefe) { arr.push(n); desenha(); } }
      });
      return box;
    }
    function desenha() {
      corpo.innerHTML = '<h3 style="margin:0 0 4px">Equipe de acesso</h3><p style="margin:0;opacity:.75">Chefe: <b>' + esc(nv.chefe) + '</b>. O chefe só é trocado direto no banco.</p>';
      corpo.appendChild(sec('ADMs (todos os sites)', nv.admins));
      Object.keys(nv.mods).sort().forEach(function (k) { corpo.appendChild(sec('MODs · ' + k, nv.mods[k])); });
      var rod = el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px', '<span id="kpe-err" style="flex:1;color:#ff8a8a;align-self:center"></span><button id="kpe-x" style="' + BTN + '">Fechar</button><button id="kpe-s" style="' + BTN + ';background:#3bb54a;border-color:#3bb54a">Salvar</button>');
      corpo.appendChild(rod);
      rod.querySelector('#kpe-x').onclick = function () { d.close(); };
      rod.querySelector('#kpe-s').onclick = async function () {
        var err = rod.querySelector('#kpe-err'); err.textContent = '';
        var c = await cred('Confirme a senha do seu player para salvar a equipe.'); if (!c) return;
        try {
          var r = await fetch('/api/ficha-salvar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'staff_salvar', nome: c.n, senha: c.s, staff: nv }) });
          var j = await r.json().catch(function () { return {}; });
          if (!r.ok) { if (r.status === 401 || r.status === 403) credLimpar(); throw new Error(j.error || 'Erro ' + r.status); }
          staff = norm(j.staff) || staff; try { sessionStorage.setItem(KC, JSON.stringify(staff)); } catch (e) {}
          pintar(); emit(); d.close();
        } catch (e) { err.textContent = e.message; }
      };
    }
    desenha(); document.body.appendChild(d); d.addEventListener('close', function () { d.remove(); }, { once: true }); d.showModal();
  }

  var st = document.createElement('style');
  st.textContent = '#nav-player-name.kp-adm-tog{cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent}#nav-player-name.kp-adm-tog.kp-off{opacity:.8}';
  document.head.appendChild(st);

  function iniciar() {
    Array.prototype.forEach.call(document.querySelectorAll(SEL), function (el) {
      new MutationObserver(pintar).observe(el, { childList: true, characterData: true, subtree: true });
    });
    pintar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  window.addEventListener('storage', function (e) { if (e.key === KS) { pintar(); emit(); } });

  /* ── carrega a lista de acesso ── */
  var ready = fetch(SU + '/rest/v1/config?chave=eq.kp_staff&select=valor', { headers: { apikey: SKEY, Authorization: 'Bearer ' + SKEY } })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      var v = rows && rows[0] && rows[0].valor; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
      var n = norm(v); if (n) { staff = n; try { sessionStorage.setItem(KC, JSON.stringify(v)); } catch (e) {} }
    })
    .catch(function () {})
    .then(function () { pintar(); emit(); });

  window.KPAdm = {
    site: SITE, ready: ready,
    papel: papel,                                                   // 'chefe' | 'admin' | 'mod' | null (ignora o botão)
    isStaff: function () { return !!papel(); },                     // tem acesso, mesmo no modo player
    modoOn: modoOn,
    isChefe: function () { return papel() === 'chefe' && modoOn(); },
    isAdm: function () { var p = papel(); return (p === 'chefe' || p === 'admin') && modoOn(); },   // use isto para liberar telas/botões de ADM
    isMod: function () { return papel() === 'mod' && modoOn(); },
    pode: function () { return !!papel() && modoOn(); },            // ADM ou MOD deste site, com o botão ligado
    nome: nome, staff: function () { return staff; },
    toggle: toggle, onChange: function (f) { ouvintes.push(f); },
    cred: cred, credLimpar: credLimpar,                             // {n,s} da senha do player (cache só na aba); mande como admin_nome/admin_senha
    editor: editor                                                  // abre o editor da equipe (Chefe/ADM)
  };
})();
