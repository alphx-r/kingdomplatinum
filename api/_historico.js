// Histórico de alterações das fichas.
// A cada save/uso de item, compara a ficha ANTES e DEPOIS e grava entradas legíveis em
// data/historico/AAAA-MM.json (um arquivo por mês, no mesmo commit do save).
// Entrada: { ts, slug, nome, player, por, cat, txt }
//   cat: ficha | pokemon | bag | compra | dinheiro | stats | conquista | perfil | timeline
const PASTA = 'data/historico';
const MAX_MES = 4000;

const s = v => (v == null ? '' : String(v)).trim();
const num = v => { const n = parseFloat(s(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; };
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const curto = v => { const t = s(v); return t.length > 40 ? t.slice(0, 37) + '…' : t; };
const arr = v => (Array.isArray(v) ? v : []);
const nk = v => s(v).toLowerCase();

const BAGS = { item: 'Item Bag', snack: 'Snack Case', forage: 'Forage Bag', trash: 'Trash Pocket' };
const bagNome = b => BAGS[b] || BAGS.item;

function mesDe(ts) {   // mês no horário de Brasília (UTC-3)
  const d = new Date(new Date(ts).getTime() - 3 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// ---------- Pokémon (Time + Box) ----------
function listaPoke(d) {
  const out = [];
  for (const loc of ['time', 'box']) arr(d?.[loc]).forEach((x, i) => { if (x && s(x.nome)) out.push({ loc, i, x }); });
  return out;
}
const LOC = { time: 'Time Principal', box: 'Box' };
const nomePk = x => (s(x.apelido) ? `${x.apelido} (${x.nome})` : s(x.nome));
const GEN = { male: 'macho', female: 'fêmea', genderless: 'sem gênero' };

function movesDe(x) { return arr(x.moves).map(m => s(m?.n)).filter(Boolean); }

function editaPk(a, b) {   // a = antes, b = depois (mesmo Pokémon)
  const ch = [];
  if (s(a.apelido) !== s(b.apelido)) ch.push(s(a.apelido) ? (s(b.apelido) ? `apelido "${a.apelido}" → "${b.apelido}"` : `removeu o apelido "${a.apelido}"`) : `apelido definido: "${b.apelido}"`);
  for (const [k, l] of [['nature', 'nature'], ['ability', 'habilidade'], ['feature', 'feature']]) {
    if (s(a[k]) !== s(b[k])) ch.push(s(a[k]) ? (s(b[k]) ? `${l} ${curto(a[k])} → ${curto(b[k])}` : `removeu ${l} ${curto(a[k])}`) : `${l} definida: ${curto(b[k])}`);
  }
  // ball/gender: o site preenche um padrão ao abrir, então só conta troca de um valor já existente
  if (s(a.ball) && s(b.ball) && s(a.ball) !== s(b.ball)) ch.push(`pokébola ${a.ball} → ${b.ball}`);
  if (s(a.gender) && s(b.gender) && s(a.gender) !== s(b.gender)) ch.push(`gênero ${GEN[a.gender] || a.gender} → ${GEN[b.gender] || b.gender}`);
  if (!!a.shiny !== !!b.shiny) ch.push(b.shiny ? 'marcado como shiny' : 'não é mais shiny');
  if (s(a.vinculado) !== s(b.vinculado)) ch.push(s(b.vinculado) ? `vinculado a ${curto(b.vinculado)}` : 'vínculo removido');
  const ma = movesDe(a), mb = movesDe(b);
  const novos = mb.filter(m => !ma.some(y => nk(y) === nk(m))), velhos = ma.filter(m => !mb.some(y => nk(y) === nk(m)));
  if (novos.length) ch.push('aprendeu ' + novos.join(', '));
  if (velhos.length) ch.push('esqueceu ' + velhos.join(', '));
  const sa = a.stats || {}, sb = b.stats || {}, st = [];
  for (const k of ['hp', 'atk', 'def', 'satk', 'sdef', 'spd']) if (s(sa[k]) !== s(sb[k]) && (s(sa[k]) || s(sb[k]))) st.push(`${k.toUpperCase()} ${s(sa[k]) || '—'} → ${s(sb[k]) || '—'}`);
  if (st.length) ch.push('stats: ' + st.join(', '));
  if (s(a.combo) !== s(b.combo)) ch.push('editou o Combo');
  if (s(a.sobre) !== s(b.sobre)) ch.push('editou "Sobre o Pokémon"');
  return ch;
}

function diffPokemon(A, B) {
  const ev = [], ant = listaPoke(A), dep = listaPoke(B), pares = [];
  const pass = (fn) => {
    for (const o of ant.filter(o => !o.par)) {
      const n = dep.find(n => !n.par && fn(o, n));
      if (n) { o.par = n; n.par = o; pares.push([o, n]); }
    }
  };
  pass((o, n) => o.loc === n.loc && o.i === n.i && nk(o.x.nome) === nk(n.x.nome));
  pass((o, n) => nk(o.x.nome) === nk(n.x.nome) && nk(o.x.apelido) === nk(n.x.apelido));
  pass((o, n) => nk(o.x.nome) === nk(n.x.nome));
  for (const [o, n] of pares) {
    if (o.loc !== n.loc) ev.push({ cat: 'pokemon', txt: `Moveu ${nomePk(n.x)} do ${LOC[o.loc]} para o ${LOC[n.loc]}` });
    const ch = editaPk(o.x, n.x);
    if (ch.length) ev.push({ cat: 'pokemon', txt: `Editou ${nomePk(n.x)}: ${ch.join('; ')}` });
  }
  for (const n of dep.filter(n => !n.par)) ev.push({ cat: 'pokemon', txt: `Adicionou ${nomePk(n.x)} ao ${LOC[n.loc]}` });
  for (const o of ant.filter(o => !o.par)) ev.push({ cat: 'pokemon', txt: `Removeu ${nomePk(o.x)} do ${LOC[o.loc]}` });
  return ev;
}

// ---------- Bag ----------
function mapaBag(d) {
  const m = new Map();
  for (const x of arr(d?.inventario)) {
    if (!x || !s(x.nome)) continue;
    const b = BAGS[x.bag] ? x.bag : 'item', k = nk(x.nome) + '|' + b;
    const e = m.get(k) || { nome: s(x.nome), bag: b, qtd: 0 };
    e.qtd += parseInt(x.qtd) || 1; m.set(k, e);
  }
  return m;
}
function diffBag(A, B) {
  const ev = [], a = mapaBag(A), b = mapaBag(B);
  for (const [k, n] of b) {
    const o = a.get(k);
    if (!o) ev.push({ cat: 'bag', txt: `Adicionou ${n.qtd}× ${n.nome} (${bagNome(n.bag)})` });
    else if (n.qtd > o.qtd) ev.push({ cat: 'bag', txt: `+${n.qtd - o.qtd}× ${n.nome} (${bagNome(n.bag)}): ${o.qtd} → ${n.qtd}` });
    else if (n.qtd < o.qtd) ev.push({ cat: 'bag', txt: `−${o.qtd - n.qtd}× ${n.nome} (${bagNome(n.bag)}): ${o.qtd} → ${n.qtd}` });
  }
  for (const [k, o] of a) if (!b.has(k)) ev.push({ cat: 'bag', txt: `Removeu ${o.qtd}× ${o.nome} (${bagNome(o.bag)})` });
  return ev;
}

// ---------- números, perfil, conquistas, listas ----------
const NUMS = [['ranking', 'Ranking'], ['reputacao', 'Reputação'], ['pv', 'PV'], ['pontos', 'Pontos'], ['pts_ranking', 'Pontos de Ranking']];
const PERFIL = [['classe', 'Classe'], ['ocupacao', 'Ocupação'], ['idade', 'Idade'], ['equipe', 'Equipe'], ['naturalidade', 'Naturalidade'], ['pronomes', 'Pronomes'], ['frase', 'Frase'], ['aniversario', 'Aniversário'], ['indole', 'Alinhamento'], ['altura', 'Altura'], ['peso', 'Peso'], ['tipo_fisico', 'Tipo Físico']];
const TEXTOS = [['anotacoes', 'Anotações'], ['historia', 'História']];
const CONQ = [['insignias', 'Insígnia'], ['ribbons', 'Ribbon'], ['pins', 'Pin'], ['premiacoes', 'Honorário']];

function diffDinheiro(A, B) {
  const a = s(A?.dinheiro), b = s(B?.dinheiro);
  if (a === b) return [];
  const na = num(a), nb = num(b);
  if (na != null && nb != null) { const dif = nb - na; return [{ cat: 'dinheiro', txt: `Dinheiro ${fmt(na)} → ${fmt(nb)} (${dif > 0 ? '+' : '−'}${fmt(Math.abs(dif))})` }]; }
  return [{ cat: 'dinheiro', txt: `Dinheiro ${a || '—'} → ${b || '—'}` }];
}
function diffNums(A, B) {
  const ev = [];
  for (const [k, l] of NUMS) if (s(A?.[k]) !== s(B?.[k])) ev.push({ cat: 'stats', txt: `${l} ${s(A?.[k]) || '—'} → ${s(B?.[k]) || '—'}` });
  return ev;
}
function diffPerfil(A, B, fa, fb) {
  const ch = [];
  if (s(fa?.nome) !== s(fb?.nome)) ch.push(`Nome "${curto(fa?.nome)}" → "${curto(fb?.nome)}"`);
  for (const [k, l] of PERFIL) if (s(A?.[k]) !== s(B?.[k])) ch.push(`${l}: ${curto(A?.[k]) || '—'} → ${curto(B?.[k]) || '—'}`);
  const ev = ch.length ? [{ cat: 'perfil', txt: 'Perfil: ' + ch.join('; ') }] : [];
  for (const [k, l] of TEXTOS) if (s(A?.[k]) !== s(B?.[k])) ev.push({ cat: 'perfil', txt: `Editou ${l}` });
  if (s(fa?.foto) !== s(fb?.foto)) ev.push({ cat: 'perfil', txt: fb?.foto ? 'Trocou a foto' : 'Removeu a foto' });
  if (s(fa?.banner) !== s(fb?.banner)) ev.push({ cat: 'perfil', txt: fb?.banner ? 'Trocou o banner' : 'Removeu o banner' });
  return ev;
}
function diffNomes(la, lb, add, rem, cat) {
  const A = arr(la).map(x => s(x?.nome)).filter(Boolean), B = arr(lb).map(x => s(x?.nome)).filter(Boolean), ev = [];
  const cont = (l, n) => l.filter(x => nk(x) === nk(n)).length;
  for (const n of [...new Set(B)]) if (cont(B, n) > cont(A, n)) ev.push({ cat, txt: add(n) });
  for (const n of [...new Set(A)]) if (cont(A, n) > cont(B, n)) ev.push({ cat, txt: rem(n) });
  return ev;
}
function diffConquistas(A, B) {
  const ev = [];
  for (const [k, l] of CONQ) ev.push(...diffNomes(A?.[k], B?.[k], n => `Ganhou ${l}: ${n}`, n => `Perdeu ${l}: ${n}`, 'conquista'));
  return ev;
}
function diffListas(A, B) {
  return [
    ...diffNomes(A?.timeline, B?.timeline, n => `Timeline: adicionou o evento "${curto(n)}"`, n => `Timeline: removeu o evento "${curto(n)}"`, 'timeline'),
    ...diffNomes(A?.relacionados, B?.relacionados, n => `Relacionado adicionado: ${n}`, n => `Relacionado removido: ${n}`, 'perfil'),
  ];
}

// ---------- API ----------
// antes: ficha anterior (ou null = ficha nova); depois: ficha nova. Retorna lista de {cat, txt}.
function diffFicha(antes, depois, opts = {}) {
  const B = depois?.d || {};
  if (!antes) return [{ cat: 'ficha', txt: 'Ficha criada' }];
  const A = antes.d || {};
  const ev = [];
  if (!!A.desativada !== !!B.desativada) ev.push({ cat: 'ficha', txt: B.desativada ? 'Desativou a ficha' : 'Reativou a ficha' });
  ev.push(...diffPokemon(A, B));
  if (!opts.semBag) ev.push(...diffBag(A, B));
  if (!opts.semDinheiro) ev.push(...diffDinheiro(A, B));
  ev.push(...diffNums(A, B), ...diffConquistas(A, B), ...diffListas(A, B), ...diffPerfil(A, B, antes, depois));
  return ev;
}

// transforma eventos em entradas completas
function entradas(ficha, por, eventos, ts = new Date().toISOString()) {
  const d = ficha?.d || {};
  return eventos.map(e => ({ ts, slug: ficha.slug, nome: s(ficha.nome), player: s(d.player), por: s(por).slice(0, 40) || null, cat: e.cat, txt: e.txt }));
}

// eventos explícitos das ações da loja/captura (itens vêm da requisição, não do diff)
function eventosItens(action, itens, custo, op) {
  const lista = itens.map(i => `${i.qtd}× ${i.nome}`).join(', ');
  if (action === 'consumir') return [{ cat: 'bag', txt: `Usou ${lista}${op ? ` (${op})` : ''}` }];
  if (custo > 0) return [{ cat: 'compra', txt: `Comprou ${lista} por ${fmt(custo)}` }];
  return [{ cat: 'bag', txt: `Recebeu ${lista}${op ? ` (${op})` : ''}` }];
}

// monta a alteração do arquivo do mês para incluir no commit
async function mudancaHist(readFile, parent, novas) {
  if (!novas.length) return null;
  const mes = mesDe(novas[0].ts), path = `${PASTA}/${mes}.json`;
  let atual = [];
  try { const t = await readFile(path, parent); const j = t ? JSON.parse(t) : []; if (Array.isArray(j)) atual = j; } catch {}
  const todas = atual.concat(novas).slice(-MAX_MES);
  return { path, content: JSON.stringify(todas) };
}

module.exports = { diffFicha, entradas, eventosItens, mudancaHist, mesDe, PASTA };
