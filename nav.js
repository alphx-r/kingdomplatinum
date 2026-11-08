/* nav.js — menu lateral ÚNICO do Kingdom Platinum (os links; segue o menu do index).
   Cada página mantém o próprio <nav> (topo, hambúrguer, login/badge, CSS) e troca só a lista de links por:
     <div class="nav-links" id="nav-links"></div>
     <script src="/nav.js"></script>
   No index.html use data-nav="index" no #nav-links: os itens do app (Rolador, Local, Calendário, Tramas e o menu Mais)
   viram goTo(...) em vez de link. Para mudar o menu em TODAS as páginas, edite só ITEMS / MAIS abaixo. */
(function () {
  var box = document.getElementById('nav-links');
  if (!box) return;
  var IDX = box.getAttribute('data-nav') === 'index';
  var path = location.pathname.replace(/\/+$/, '') || '/';

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
  box.innerHTML = h;

  var st = document.createElement('style');
  st.textContent = 'a.nav-drop-item,a.nav-drop-item:hover{text-decoration:none}';
  document.head.appendChild(st);

  // Reserva: só vale em página que não define as suas (as funções das páginas, declaradas depois, têm prioridade).
  window.toggleNavDrop = window.toggleNavDrop || function (e) {
    e.stopPropagation();
    var nav = document.getElementById('main-nav');
    if (nav && !nav.classList.contains('expanded') && typeof openSidenav === 'function') openSidenav();
    var m = document.getElementById('nav-drop-menu'), b = document.getElementById('nav-drop-btn');
    var open = m.classList.toggle('open');
    b.classList.toggle('open', open);
    if (open) document.addEventListener('click', window.closeNavDrop, { once: true });
  };
  window.closeNavDrop = window.closeNavDrop || function () {
    var m = document.getElementById('nav-drop-menu'), b = document.getElementById('nav-drop-btn');
    if (m) m.classList.remove('open');
    if (b) b.classList.remove('open');
  };
})();
