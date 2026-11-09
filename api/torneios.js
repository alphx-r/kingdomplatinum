// Torneios no GitHub, junto com as fichas (arquivo com "_" não conta como função na Vercel).
//   data/torneios/<id>.json   -> torneio completo (participantes, chaves, placares)
//   data/torneios/index.json  -> resumo de todos (lista, busca e filtros)
//
// Ligado ao /api/ficha-salvar (ver LEIA-ME no fim deste arquivo):
//   GET  ?torneios=1                      -> índice
//   GET  ?torneio=xmascup                 -> torneio completo
//   POST { action:'torneio_salvar',  adm_nome, adm_senha, torneio, base?, novo?, de? }   (ADM) cria/edita/renomeia
//   POST { action:'torneio_excluir', adm_nome, adm_senha, id }                           (ADM)
//   POST { action:'torneio_inscrever', token, slug, torneio, por }   (dono da ficha ou ADM)
//   POST { action:'torneio_sair',      token, slug, torneio, por }   (dono da ficha ou ADM)
//
// Permissões:
//  - ADM: nome + senha conferidos em admin_login (mesmo projeto/variáveis do 'atribuir').
//  - Player: o token da ficha é conferido pelo Supabase (ficha_salvar), igual ao 'consumir' do ficha-salvar.
//    Os dados do participante (nome, foto, cor, pontos) vêm SEMPRE da ficha no GitHub, nunca do navegador.
const { readFile, commit } = require('./_gh');

const DIR = 'data/torneios/';
const IDX = DIR + 'index.json';
const ID = /^[a-z0-9]{1,60}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;

const err = (status, msg, code) => Object.assign(new Error(msg), { status, code });
const parse = t => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
const parseIdx = t => { const j = parse(t); return Array.isArray(j) ? j : []; };
const S = (v, n) => String(v ?? '').slice(0, n);
const I = (v, a, b, d) => { const x = Math.floor(Number(v)); return Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : d; };
const num = v => { const x = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };

// ---------- sanitização (nada que vem do navegador é gravado sem passar por aqui) ----------
function cleanPart(p) {
  if (!p || typeof p !== 'object' || !p.id) return null;
  return {
    id: S(p.id, 80), pid: p.pid == null ? undefined : S(p.pid, 40), nome: S(p.nome, 80),
    foto: /^https?:\/\//i.test(p.foto || '') ? S(p.foto, 500) : '',
    cor: /^#[0-9a-f]{3,8}$/i.test(p.cor || '') ? p.cor : '',
    ranking: Number(p.ranking) || 0, player: S(p.player, 60),
  };
}
const sc = v => (v === null || v === undefined || v === '') ? null : I(v, 0, 999, null);
const cm = m => ({ a: m && m.a ? S(m.a, 80) : null, b: m && m.b ? S(m.b, 80) : null, sa: sc(m && m.sa), sb: sc(m && m.sb) });
function limpar(t, id, at) {
  const formato = t.formato === 'rr' ? 'rr' : 'single';
  const arr = Array.isArray(t.m) ? t.m : [];
  const m = formato === 'rr'
    ? arr.slice(0, 4000).map(cm)
    : arr.slice(0, 10).map(r => (Array.isArray(r) ? r : []).slice(0, 128).map(cm));
  return {
    id, nome: S(t.nome, 80).trim() || id, formato,
    status: ['inscricao', 'andamento', 'fim'].includes(t.status) ? t.status : 'inscricao',
    seed: ['ranking', 'aleatorio', 'ordem'].includes(t.seed) ? t.seed : 'ranking',
    desc: S(t.desc, 2000), data: S(t.data, 32),
    vagas: I(t.vagas, 0, 256, 0), porPlayer: I(t.porPlayer, 1, 10, 1),
    md: [1, 3, 5].includes(+t.md) ? +t.md : 1, aberta: !!t.aberta,
    part: (Array.isArray(t.part) ? t.part : []).slice(0, 256).map(cleanPart).filter(Boolean),
    m, champ: t.champ ? S(t.champ, 80) : null, at,
  };
}
function resumo(t) {
  const c = t.part.find(p => p.id === t.champ);
  return {
    id: t.id, nome: t.nome, formato: t.formato, status: t.status, desc: t.desc.slice(0, 200), data: t.data,
    vagas: t.vagas, aberta: t.aberta, nPart: t.part.length, champ: t.champ, champNome: c ? c.nome : '',
    nomes: t.part.map(p => p.nome + ' ' + p.player).join(' ').slice(0, 3000), at: t.at,
  };
}
const gravar = (idx, t) => {
  const novo = idx.filter(x => x.id !== t.id); novo.push(resumo(t));
  return { path: IDX, content: JSON.stringify(novo.sort((a, b) => (b.at || 0) - (a.at || 0))) };
};

// ---------- ADM (mesma conferência do 'atribuir') ----------
async function admOk(b) {
  const { adm_nome, adm_senha } = b;
  if (!adm_nome || !adm_senha) throw err(401, 'Informe o nome e a senha do organizador.');
  const IU = process.env.INDEX_SUPA_URL, IK = process.env.INDEX_SUPA_KEY;
  if (!IU || !IK) throw err(500, 'Servidor sem configuração (INDEX_SUPA_URL ou INDEX_SUPA_KEY).');
  const a = await fetch(`${IU}/rest/v1/rpc/admin_login`, {
    method: 'POST', headers: { apikey: IK, Authorization: 'Bearer ' + IK, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_nome: adm_nome, p_senha: adm_senha }),
  });
  let adm = a.ok ? await a.json().catch(() => null) : null; adm = Array.isArray(adm) ? adm[0] : adm;
  if (!adm || !adm.nome) throw err(403, 'Nome ou senha de organizador incorretos.');
  return adm;
}

// ---------- leitura ----------
async function lista(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send((await readFile(IDX)) || '[]');
}
async function obter(id, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  id = String(id || '');
  if (!ID.test(id)) return res.status(400).json({ error: 'Torneio inválido.' });
  const t = await readFile(DIR + id + '.json');
  if (t == null) return res.status(404).json({ error: 'Torneio não encontrado.' });
  return res.status(200).send(t);
}

// ---------- ADM: criar / editar / renomear ----------
async function salvar(b, res) {
  await admOk(b);
  const t0 = b.torneio && typeof b.torneio === 'object' ? b.torneio : {};
  const id = String(t0.id || ''), de = b.de ? String(b.de) : null;
  if (!ID.test(id) || (de && !ID.test(de))) throw err(400, 'Id de torneio inválido.');
  let fin = id;
  await commit(async parent => {
    const idx = parseIdx(await readFile(IDX, parent));
    const origem = b.novo ? null : (de || id);
    const cur = origem ? parse(await readFile(DIR + origem + '.json', parent)) : null;
    if (!b.novo && !cur) throw err(404, 'Torneio não encontrado.');
    if (cur && b.base != null && String(cur.at) !== String(b.base))
      throw err(409, 'Este torneio foi alterado por outra pessoa (por exemplo, uma inscrição). Recarregue e tente de novo.', 'conflito');
    fin = id;
    if (!cur || fin !== cur.id) { let n = 2; while (idx.some(x => x.id === fin && x.id !== (cur && cur.id))) fin = id + n++; }
    const t = limpar(t0, fin, Date.now());
    const ch = [{ path: DIR + fin + '.json', content: JSON.stringify(t) }];
    if (cur && cur.id !== fin) { ch.push({ path: DIR + cur.id + '.json', content: null }); idx.splice(0, idx.length, ...idx.filter(x => x.id !== cur.id)); }
    ch.push(gravar(idx, t));
    b._saida = t;
    return ch;
  }, `torneio: ${b.novo ? 'criar' : 'salvar'} ${id}`);
  return res.json({ ok: true, id: fin, at: b._saida.at });
}

async function excluir(b, res) {
  await admOk(b);
  const id = String(b.id || '');
  if (!ID.test(id)) throw err(400, 'Torneio inválido.');
  await commit(async parent => {
    const idx = parseIdx(await readFile(IDX, parent)).filter(x => x.id !== id);
    return [{ path: DIR + id + '.json', content: null }, { path: IDX, content: JSON.stringify(idx) }];
  }, `torneio: excluir ${id}`);
  return res.json({ ok: true });
}

// ---------- Player: inscrever / sair ----------
async function fichaDoToken(b, sbRpc) {
  const { token, slug } = b;
  if (!token || typeof token !== 'string') throw err(401, 'Sessão ausente. Entre no site novamente.');
  if (!SLUG.test(slug || '')) throw err(400, 'Ficha inválida.');
  if (!ID.test(String(b.torneio || ''))) throw err(400, 'Torneio inválido.');
  const f = parse(await readFile(`data/fichas/${slug}.json`));
  if (!f) throw err(404, 'Ficha não encontrada.');
  // o Supabase confere se o token pode mexer nesta ficha (dono ou ADM); regrava os mesmos dados, sem mudar nada
  await sbRpc('ficha_salvar', { p_token: token, p_slug: slug, p_nome: f.nome, p_foto: f.foto ?? null, p_banner: f.banner ?? null, p_d: f.d || {} });
  return f;
}
async function inscrever(b, res, sbRpc) {
  const f = await fichaDoToken(b, sbRpc);
  if (f.d && f.d.desativada) throw err(400, 'Esta ficha está desativada.');
  const id = String(b.torneio);
  let saida = null;
  await commit(async parent => {
    const t = parse(await readFile(DIR + id + '.json', parent));
    if (!t) throw err(404, 'Torneio não encontrado.');
    saida = t;
    if (t.part.some(p => p.id === f.slug)) return [];                       // já inscrito: não repete
    if (t.status !== 'inscricao') throw err(409, 'As inscrições deste torneio já foram encerradas.');
    if (!t.aberta) throw err(403, 'As inscrições deste torneio estão fechadas.');
    if (t.vagas && t.part.length >= t.vagas) throw err(409, 'Torneio cheio.');
    const pid = f.player_id;
    if (pid != null && pid !== 'admin' && t.part.filter(p => String(p.pid) === String(pid)).length >= (t.porPlayer || 1))
      throw err(409, `Você já inscreveu o limite de ${t.porPlayer || 1} personagem(ns) neste torneio.`);
    const d = f.d || {};
    t.part.push(cleanPart({ id: f.slug, pid, nome: f.nome, foto: f.thumb || f.foto || '', cor: d.cor_pri, ranking: num(d.pts_ranking), player: d.player }));
    t.at = Date.now();
    return [{ path: DIR + id + '.json', content: JSON.stringify(t) }, gravar(parseIdx(await readFile(IDX, parent)), t)];
  }, `torneio: inscrever ${f.slug} em ${id}`);
  return res.json({ ok: true, torneio: saida });
}
async function sair(b, res, sbRpc) {
  const f = await fichaDoToken(b, sbRpc);
  const id = String(b.torneio);
  let saida = null;
  await commit(async parent => {
    const t = parse(await readFile(DIR + id + '.json', parent));
    if (!t) throw err(404, 'Torneio não encontrado.');
    saida = t;
    if (!t.part.some(p => p.id === f.slug)) return [];
    if (t.status !== 'inscricao') throw err(409, 'O torneio já começou. Fale com a organização para sair.');
    t.part = t.part.filter(p => p.id !== f.slug); t.at = Date.now();
    return [{ path: DIR + id + '.json', content: JSON.stringify(t) }, gravar(parseIdx(await readFile(IDX, parent)), t)];
  }, `torneio: sair ${f.slug} de ${id}`);
  return res.json({ ok: true, torneio: saida });
}

async function acao(nome, b, res, sbRpc) {
  if (nome === 'torneio_salvar') return salvar(b, res);
  if (nome === 'torneio_excluir') return excluir(b, res);
  if (nome === 'torneio_inscrever') return inscrever(b, res, sbRpc);
  if (nome === 'torneio_sair') return sair(b, res, sbRpc);
  throw err(400, 'Ação desconhecida.');
}
module.exports = { lista, obter, acao };

/* LEIA-ME — 3 linhas no api/ficha-salvar.js (nenhuma função nova na Vercel):
   1) no topo, junto dos outros require:
        const T = require('./_torneios');
   2) no bloco GET (dentro do try, antes de `if (q.lista)`):
        if (q.torneios) { res.setHeader('Cache-Control', 'no-store'); return await T.lista(res); }
        if (q.torneio)  { res.setHeader('Cache-Control', 'no-store'); return await T.obter(q.torneio, res); }
   3) no bloco POST, logo abaixo da linha do 'atribuir':
        if (/^torneio_/.test(action)) return await T.acao(action, b, res, sbRpc);   // ADM usa nome+senha; player usa o token da ficha
*/
