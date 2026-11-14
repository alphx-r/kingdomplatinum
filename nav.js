/* nav.js — menu lateral ÚNICO do Kingdom Platinum: monta o menu INTEIRO (topo, hambúrguer, logo, links,
   Entrar, badge do player com o switch ADM/MOD e o ✕) e injeta o CSS do menu.
   Uso (no <body>, onde o menu deve ficar):
     <script src="/nav.js"></script>
   Opções no próprio <script>:  data-nav="index"   → no index, itens do app viram goTo(...) em vez de link
                                data-entrar="off"  → sem o botão Entrar (o index tem tela de login própria)
   Para mudar o menu em TODAS as páginas, edite só ITEMS / MAIS / o CSS abaixo.
   Funções da página (opcionais): sair() ou fazerLogoutPlayer() = o ✕; navEntrar() = o botão Entrar (padrão: abre #lg).
   Páginas antigas, que ainda têm o próprio <nav> com <div id="nav-links">, continuam funcionando: nelas o nav.js só preenche a lista de links. */
(function () {
  if (window.KPNav) return;
  var cs = document.currentScript;
  var legacyBox = document.getElementById('nav-links');           // página antiga: já tem o <nav> e só quer os links
  var attr = function (n) { return (cs && cs.getAttribute(n)) || (legacyBox && legacyBox.getAttribute(n)) || ''; };
  var IDX = attr('data-nav') === 'index';
  var ENTRAR = attr('data-entrar') !== 'off';
  var path = location.pathname.replace(/\/+$/, '') || '/';
  var g = function (id) { return document.getElementById(id); };

  var LOGO = 'https://raw.githubusercontent.com/alphx-r/kingdomplatinum/refs/heads/main/sprites/rpg/kp-logo-darkgray.png';
  var CSS = ":root{--sidenav-w:64px;--sidenav-w-open:220px}\nbody{padding-left:var(--sidenav-w);transition:padding-left .25s ease}\n.nav{display:flex;flex-direction:column;align-items:stretch;padding:0;width:var(--sidenav-w);height:100vh;height:100dvh;background:var(--nav-bg,var(--brand));position:fixed;top:0;left:0;z-index:9000;overflow:hidden;transition:width .25s ease;box-shadow:2px 0 12px rgba(0,0,0,.15)}\n.nav.expanded{width:var(--sidenav-w-open);box-shadow:4px 0 24px rgba(0,0,0,.3)}\n.nav-top{display:flex;align-items:center;gap:10px;padding:0 14px;height:58px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.1)}\n.nav-hamburger{position:relative;display:flex;justify-content:center;align-items:center;width:36px;height:36px;min-width:36px;background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.25);border-radius:8px;cursor:pointer;padding:0;flex-shrink:0;color:#fff;transition:background .2s,border-color .2s,color .2s}\n.nav-hamburger svg{width:18px;height:18px;display:block}\n#nav-player-badge.is-admin{border-color:rgba(255,255,255,.3)}\n.nav-logo{font-family:var(--font-title);font-size:15px;font-weight:700;color:#fff;letter-spacing:1px;white-space:nowrap;opacity:0;transition:opacity .2s;pointer-events:none}\n.nav.expanded .nav-logo{opacity:1;transition:opacity .3s ease .1s}\n.nav-logo span{color:var(--accent)}\n.nav-links{display:flex;flex-direction:column;gap:2px;padding:8px;overflow-y:auto;overflow-x:hidden;flex:1}\n.nav-link{display:flex;align-items:center;gap:12px;font-size:13px;font-weight:600;font-family:var(--font-body);padding:10px 12px;border-radius:10px;border:none;background:transparent;color:rgba(255,255,255,.7);cursor:pointer;transition:all .2s;white-space:nowrap;width:100%;text-align:left;text-decoration:none!important}\n.nav-link:hover,.nav-link:visited,.nav-link:active,.nav-link:focus{text-decoration:none!important}\n.nav-link:hover{background:rgba(255,255,255,.12);color:#fff}\n.nav-link.active{background:rgba(255,255,255,.18);color:#fff}\n.nav-link .nav-ico{font-size:17px;min-width:20px;text-align:center;flex-shrink:0;display:flex;align-items:center;justify-content:center}\n.nav-ico svg{width:17px;height:17px;display:block}\n.nav-link .nav-label{opacity:0;transition:opacity .15s;overflow:hidden}\n.nav.expanded .nav-link .nav-label{opacity:1;transition:opacity .25s ease .08s}\n.nav-drop-wrap{position:relative;display:flex;flex-direction:column}\n.nav-drop-btn{font-size:13px;font-weight:600;font-family:var(--font-body);padding:10px 12px;border-radius:10px;border:none;background:transparent;color:rgba(255,255,255,.7);cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:12px;width:100%;text-align:left;white-space:nowrap}\n.nav-drop-btn:hover,.nav-drop-btn.open,.nav-drop-btn.active{background:rgba(255,255,255,.2);color:#fff}\n.nav-drop-btn .nav-ico{font-size:17px;min-width:20px;text-align:center;flex-shrink:0;display:flex;align-items:center;justify-content:center}\n.nav-drop-btn .nav-label{opacity:0;transition:opacity .15s;overflow:hidden;flex:1}\n.nav.expanded .nav-drop-btn .nav-label{opacity:1;transition:opacity .25s ease .08s}\n.nav-drop-btn .nav-drop-arrow{font-size:10px;line-height:1;opacity:0;transition:opacity .15s,transform .2s;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px}\n.nav.expanded .nav-drop-btn .nav-drop-arrow{opacity:1}\n.nav-drop-btn.open .nav-drop-arrow{transform:rotate(180deg)}\n.nav-drop-menu{display:none;flex-direction:column;gap:2px;padding:2px 0 2px 14px;margin-top:2px}\n.nav-drop-menu.open{display:flex}\n.nav-drop-item{font-size:12.5px;font-weight:600;font-family:var(--font-body);padding:9px 12px;border-radius:8px;border:none;background:transparent;color:rgba(255,255,255,.75);cursor:pointer;transition:all .15s;text-align:left;white-space:nowrap;display:flex;align-items:center;gap:10px}\n.nav-drop-item:hover{background:rgba(255,255,255,.15);color:#fff}\n.nav-bottom{padding:8px;border-top:1px solid rgba(255,255,255,.1);flex-shrink:0}\n.nav-login{font-size:12px;font-weight:700;font-family:var(--font-body);padding:10px 12px;border-radius:10px;border:1.5px solid rgba(255,255,255,.5);background:transparent;color:#fff;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:12px;width:100%;white-space:nowrap}\n.nav-login .nav-ico{font-size:16px;min-width:20px;text-align:center;flex-shrink:0;display:flex;align-items:center;justify-content:center}\n.nav-login .nav-label{opacity:0;transition:opacity .15s;overflow:hidden}\n.nav.expanded .nav-login .nav-label{opacity:1;transition:opacity .25s ease .08s}\n.nav-login:hover{background:var(--accent);border-color:var(--accent)}\n.nav-login.active{background:var(--accent);border-color:var(--accent)}\n.nav-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:8999}\n.nav-overlay.open{display:block}\n#nav-player-badge{display:none;align-items:center;gap:0;justify-content:center;\n  background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.3);\n  border-radius:20px;padding:8px 0;font-size:12px;font-weight:700;color:#fff;\n  width:100%;overflow:hidden;white-space:nowrap;}\n#nav-player-name{overflow:hidden;text-overflow:ellipsis;text-align:center;opacity:0;width:0;transition:opacity .15s}\n.nav-player-ico{width:14px;height:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center}\n.nav-player-ico svg{width:14px;height:14px;display:block}\n.nav.expanded #nav-player-badge{gap:6px;padding:8px 10px;width:100%}\n.nav.expanded #nav-player-name{opacity:1;width:auto;flex:1;transition:opacity .25s ease .08s}\n#nav-player-badge .player-logout-btn{background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;\n  font-size:13px;padding:0 0 0 6px;line-height:1;transition:color .15s,opacity .15s;flex-shrink:0;\n  opacity:0;width:0;overflow:hidden;pointer-events:none;}\n.nav.expanded #nav-player-badge .player-logout-btn{opacity:1;width:auto;padding:0 0 0 6px;pointer-events:auto;transition:opacity .2s ease .08s}\n#nav-player-badge .player-logout-btn:hover{color:#fff}\na.nav-login,a.nav-drop-item{text-decoration:none}\na.nav-login{margin-bottom:6px}\n#nav-player-badge .kp-sw{display:none}\n.nav.expanded #nav-player-badge .kp-sw{display:block}\n@media(max-width:768px){\n:root{--sidenav-w:0px}\nbody{padding-left:0!important}\nbody.nav-expanded{padding-left:0!important}\nbody.nav-expanded{padding-left:0!important}\n.nav{flex-direction:row;align-items:center;justify-content:flex-start;\n    width:100%!important;height:52px;padding:0 14px;\n    position:sticky;top:0;left:auto;\n    overflow:visible;box-shadow:0 2px 12px rgba(0,0,0,.25);}\n.nav.expanded{width:100%!important;box-shadow:0 2px 12px rgba(0,0,0,.25)}\n.nav-top{padding:0;height:auto;border-bottom:none;flex:0 0 auto;width:auto}\n.nav-logo{font-size:14px;opacity:1!important;pointer-events:auto}\n.nav-links{display:none;position:fixed;top:52px;left:0;right:0;\n    flex-direction:column;flex:none;padding:8px 10px 12px;\n    background:var(--nav-bg,var(--brand));box-shadow:0 6px 20px rgba(0,0,0,.3);\n    max-height:calc(100dvh - 52px);overflow-y:auto;gap:2px;}\n.nav.expanded .nav-links{display:flex}\n.nav-bottom{border-top:none;padding:0;flex:0 0 auto;display:flex;align-items:center;margin-left:auto}\n.nav-login{width:auto;padding:6px 12px;font-size:11px}\n.nav-login .nav-label{opacity:1!important;width:auto!important}\n#nav-player-badge,.nav.expanded #nav-player-badge{width:auto!important;min-width:0!important;flex-shrink:0;gap:14px!important;padding:11px 24px!important}\n#nav-player-name{opacity:1!important;width:auto!important;font-size:14px;letter-spacing:.2px}\n#nav-player-badge .player-logout-btn,.nav.expanded #nav-player-badge .player-logout-btn{opacity:1!important;width:auto!important;pointer-events:auto!important;padding:0!important;font-size:16px}\n.nav.expanded #nav-player-name{flex:none}\na.nav-login{margin:0 6px 0 0}\n#nav-player-badge,.nav.expanded #nav-player-badge{padding:9px 14px!important;gap:8px!important;max-width:42vw}\n.nav-bottom{min-width:0}\n#nav-player-badge .kp-sw,.nav.expanded #nav-player-badge .kp-sw{display:block!important;margin-left:0!important}\n}\n";
  var ICO_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';
  var ICO_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
  var ICO_PAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="11" rx="5.5"/><line x1="7" y1="10.5" x2="7" y2="14.5"/><line x1="5" y1="12.5" x2="9" y2="12.5"/><circle cx="16" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="18.2" cy="13.5" r="1" fill="currentColor" stroke="none"/></svg>';

  // t: go = goTo() no index / link nas demais · fichas = abrirFichas() no index · link = sempre link · pokegram = abrirPokegram()
  var ITEMS = [
  {k:"roller",l:"Rolador",h:"/",m:["/", "/dados"],t:"go",i:"<span class=\"nav-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><circle cx=\"8\" cy=\"8\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"16\" cy=\"8\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"8\" cy=\"16\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"16\" cy=\"16\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/></svg></span>"},
  {k:"bioma",l:"Local",h:"/porlocal",m:["/bioma", "/porlocal"],t:"go",i:"<span class=\"nav-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><polygon points=\"16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76\"/></svg></span>"},
  {k:"fichas",l:"Fichário",h:"/fichas",m:["/fichas"],t:"fichas",i:"<span class=\"nav-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/></svg></span>"},
  {k:"stores",l:"Stores",h:"/stores",m:["/stores", "/pokemart"],t:"link",i:"<span class=\"nav-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 9l1.5-5h15L21 9\"/><path d=\"M4 9v11h16V9\"/><path d=\"M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0\"/><path d=\"M10 20v-5h4v5\"/></svg></span>"},
  {k:"missoes",l:"Quests Guild",h:"/missoes",m:["/missoes"],t:"link",i:"<span class=\"nav-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4\"/><path d=\"M19 17V5a2 2 0 0 0-2-2H4\"/><path d=\"M15 8h-5\"/><path d=\"M15 12h-5\"/></svg></span>"},
  {k:"datadex",l:"Datadex",h:"/datadex",m:["/datadex"],t:"link",i:"<span class=\"nav-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 19.5A2.5 2.5 0 0 1 6.5 17H20\"/><path d=\"M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z\"/></svg></span>"},
  {k:"eventos-hub",l:"Calendário",h:"/calendario",m:["/calendario"],t:"go",i:"<span class=\"nav-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"2\"/><line x1=\"3\" y1=\"10\" x2=\"21\" y2=\"10\"/><line x1=\"8\" y1=\"2\" x2=\"8\" y2=\"6\"/><line x1=\"16\" y1=\"2\" x2=\"16\" y2=\"6\"/></svg></span>"},
  {k:"tramas",l:"Tramas",h:"/tramas",m:["/tramas"],t:"go",i:"<span class=\"nav-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 6.5C10.5 5.2 8.2 4.5 6 4.5c-1 0-2 .1-3 .4v13c1-.3 2-.4 3-.4 2.2 0 4.5.7 6 2 1.5-1.3 3.8-2 6-2 1 0 2 .1 3 .4v-13c-1-.3-2-.4-3-.4-2.2 0-4.5.7-6 2z\"/><path d=\"M12 6.5v13\"/></svg></span>"},
  {k:"pokegram",l:"Pokégram",h:null,m:[],t:"pokegram",i:"<span class=\"nav-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z\"/><circle cx=\"12\" cy=\"13\" r=\"4\"/></svg></span>"}
  ];
  var MAIS = [['sistemas', 'Sistemas', '/sistemas'], ['ganhos', 'Ganhos', '/ganhos'], ['nature', 'Natures', '/nature'], ['batalhas', 'Batalhas', '/batalhas']];
  var MAIS_ICO = "<span class=\"nav-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"5\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"19\" cy=\"12\" r=\"1.5\" fill=\"currentColor\" stroke=\"none\"/></svg></span>";

  function at(list) {
    return list.some(function (p) { return p === '/' ? path === '/' : (path === p || path.indexOf(p + '/') === 0); });
  }
  function lab(l) { return '<span class="nav-label">' + l + '</span>'; }

  function linksHtml() {
    var h = ITEMS.map(function (it) {
      var act = IDX ? it.k === 'roller' : at(it.m);
      var cls = 'nav-link' + (act ? ' active' : '');
      var inner = it.i + lab(it.l);
      // páginas sem abrirPokegram() (ex.: mapa) abrem o Pokégram direto em outra aba
      if (it.t === 'pokegram') return '<button class="' + cls + '" onclick="typeof abrirPokegram===\'function\'?abrirPokegram():window.open(\'https://pokegramrpg.vercel.app/\',\'_blank\',\'noopener\')">' + inner + '</button>';
      if (IDX && it.t === 'go') return '<button class="' + cls + '" onclick="goTo(\'' + it.k + '\',this)">' + inner + '</button>';
      if (IDX && it.t === 'fichas') return '<a class="' + cls + '" href="' + it.h + '" onclick="return abrirFichas(event)">' + inner + '</a>';
      // data-r: a página de fichas navega internamente (sem recarregar) nos links com esse atributo
      return '<a class="' + cls + '" href="' + it.h + '"' + (it.k === 'fichas' ? ' data-r' : '') + '>' + inner + '</a>';
    }).join('\n');
    var maisAtivo = !IDX && MAIS.some(function (m) { return at([m[2]]); });
    h += '\n<div class="nav-drop-wrap" id="nav-drop-wrap"><button class="nav-drop-btn' + (maisAtivo ? ' active' : '') + '" id="nav-drop-btn" onclick="toggleNavDrop(event)">' +
      MAIS_ICO + lab('Mais') + '<span class="nav-drop-arrow">▾</span></button><div class="nav-drop-menu" id="nav-drop-menu">' +
      MAIS.map(function (m) {
        return IDX
          ? '<button class="nav-drop-item" onclick="goTo(\'' + m[0] + '\',null);closeNavDrop()">' + lab(m[1]) + '</button>'
          : '<a class="nav-drop-item" href="' + m[2] + '">' + lab(m[1]) + '</a>';
      }).join('') + '</div></div>';
    return h;
  }

  var st = document.createElement('style');
  st.id = 'kp-nav-css'; st.textContent = 'a.nav-drop-item,a.nav-drop-item:hover{text-decoration:none}';

  if (legacyBox) {
    /* página antiga: só a lista de links (o resto do menu é da própria página) */
    legacyBox.innerHTML = linksHtml();
    document.head.appendChild(st);
  } else {
    /* menu completo. CSS no INÍCIO do <head>: se a página ainda tiver regra própria, a dela prevalece */
    var css = document.createElement('style'); css.id = 'kp-nav-base'; css.textContent = CSS + '\na.nav-login,a.nav-drop-item{text-decoration:none}\na.nav-drop-item,a.nav-drop-item:hover{text-decoration:none}';
    document.head.insertBefore(css, document.head.firstChild);
    var nav = g('main-nav');
    if (!nav) {
      nav = document.createElement('nav'); nav.className = 'nav'; nav.id = 'main-nav';
      if (cs && cs.parentNode) cs.parentNode.insertBefore(nav, cs); else document.body.insertBefore(nav, document.body.firstChild);
    }
    nav.innerHTML =
      '<div class="nav-top">' +
        '<button class="nav-hamburger" id="nav-hamburger" onclick="toggleSidenav()" aria-label="Menu">' + ICO_MENU + '</button>' +
        '<div class="nav-logo"><img src="' + LOGO + '" style="height:26px;object-fit:contain;" alt="Kingdom Platinum"></div>' +
      '</div>' +
      '<div class="nav-links" id="nav-links">' + linksHtml() + '</div>' +
      '<div class="nav-bottom">' +
        (ENTRAR ? '<button class="nav-login" id="btn-entrar" onclick="KPNav.entrar()"><span class="nav-ico">' + ICO_PAD + '</span><span class="nav-label">Entrar</span></button>' : '') +
        '<div id="nav-player-badge">' +
          '<span id="nav-player-ico" class="nav-player-ico"></span>' +
          '<span id="nav-player-name">—</span>' +
          '<button class="player-logout-btn" onclick="KPNav.sair()" title="Sair">✕</button>' +
        '</div>' +
      '</div>';
    if (!g('nav-overlay')) {
      var ov = document.createElement('div'); ov.className = 'nav-overlay'; ov.id = 'nav-overlay'; ov.setAttribute('onclick', 'closeSidenavMobile()');
      nav.parentNode.insertBefore(ov, nav.nextSibling);
    }
    document.head.appendChild(st);
  }

  /* ── abrir/fechar o menu: reserva — se a página definir as dela (declaradas depois), as da página prevalecem ── */
  window.renderHamburgerIcon = window.renderHamburgerIcon || function () {
    var b = g('nav-hamburger'), n = g('main-nav'); if (!b) return;
    b.innerHTML = n && n.classList.contains('expanded') ? ICO_CLOSE : ICO_MENU;
  };
  window.openSidenav = window.openSidenav || function () {
    var n = g('main-nav'), b = g('nav-hamburger'), o = g('nav-overlay');
    if (n) n.classList.add('expanded'); if (b) b.classList.add('open');
    document.body.classList.add('nav-expanded'); if (o) o.classList.add('open'); window.renderHamburgerIcon();
  };
  window.closeSidenav = window.closeSidenav || function () {
    var n = g('main-nav'), b = g('nav-hamburger'), o = g('nav-overlay');
    if (n) n.classList.remove('expanded'); if (b) b.classList.remove('open');
    document.body.classList.remove('nav-expanded'); if (o) o.classList.remove('open');
    var m = g('nav-drop-menu'), d = g('nav-drop-btn'); if (m) m.classList.remove('open'); if (d) d.classList.remove('open');
    window.renderHamburgerIcon();
  };
  window.toggleSidenav = window.toggleSidenav || function () {
    var n = g('main-nav'); if (n && n.classList.contains('expanded')) window.closeSidenav(); else window.openSidenav();
  };
  window.closeSidenavMobile = window.closeSidenavMobile || function () { window.closeSidenav(); };
  window.toggleNavDrop = window.toggleNavDrop || function (e) {
    e.stopPropagation();
    var nav = g('main-nav');
    if (nav && !nav.classList.contains('expanded') && typeof window.openSidenav === 'function') window.openSidenav();
    var m = g('nav-drop-menu'), b = g('nav-drop-btn');
    var open = m.classList.toggle('open');
    b.classList.toggle('open', open);
    if (open) document.addEventListener('click', window.closeNavDrop, { once: true });
  };
  window.closeNavDrop = window.closeNavDrop || function () {
    var m = g('nav-drop-menu'), b = g('nav-drop-btn');
    if (m) m.classList.remove('open');
    if (b) b.classList.remove('open');
  };

  /* ── botões Entrar e ✕ (usam as funções da própria página) ── */
  window.KPNav = {
    entrar: function () {
      if (typeof window.closeSidenav === 'function') window.closeSidenav();
      if (typeof window.navEntrar === 'function') return window.navEntrar();
      var d = g('lg'); if (d && d.showModal) return d.showModal();
      var ov = g('player-login-overlay'); if (ov) ov.style.display = 'flex';
    },
    sair: function () {
      var f = window.sair || window.fazerLogoutPlayer || window.logout;
      if (typeof f === 'function') f();
    }
  };
})();
