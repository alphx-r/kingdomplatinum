// NPCs em JSON no GitHub (mesmo modelo das fichas). Arquivo com "_" não conta como função na Vercel;
// é chamado pelo api/ficha-salvar.js:
//   GET  /api/ficha-salvar?npcs=1            -> data/npcs/index.json
//   GET  /api/ficha-salvar?npc=slug          -> data/npcs/<slug>.json
//   GET  /api/ficha-salvar?npchist=slug      -> data/npcs-historico/<slug>.json
//   GET  /api/ficha-salvar?npcmigrar=1&chave=MIGRAR_KEY   -> migração única Supabase -> GitHub (repita até restam: 0)
//   POST { action:'npc_salvar',  nome, senha, slug?, campos:{...} }   (sem slug = cria; com slug = altera só os `campos` enviados)
//   POST { action:'npc_excluir', nome, senha, slug }
// Quem pode editar: nome + senha do player conferidos no projeto do index (igual ao ficha-token) e papel chefe/ADM em config.kp_staff.
// Variáveis: INDEX_SUPA_URL, INDEX_SUPA_KEY (já usadas), MIGRAR_KEY (só para migrar) e, opcionais,
//   NPCS_SUPA_URL / NPCS_SUPA_KEY (projeto antigo onde está a tabela npcs; já vêm com o padrão do npcdex).
const crypto = require('crypto');
const { REPO, BRANCH, readFile, listDir, commit } = require('./_gh');
const S = require('./_staff');

const IMG_BASE = (process.env.IMG_BASE || `https://raw.githubusercontent.com/${REPO}/${BRANCH}`).replace(/\/$/, '');
// Limite real: o corpo de uma requisição na Vercel é de 4,5 MB e o base64 pesa ~33% a mais, então ~3 MB de imagem é o teto que cabe.
const MAX_IMG = 3 * 1024 * 1024;
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const RESERVADOS = ['nova', 'desativadas', 'adm'];
const IDX = 'data/npcs/index.json';

const TEXTO = ['nome', 'categoria', 'cargo', 'localizacao', 'especialidade', 'idade', 'ocupacao', 'origem', 'classe', 'prova_valor', 'slogan', 'biografia', 'anotacoes', 'gym_descricao'];
const JSONF = ['time', 'relacionamentos', 'pokemon_ghs', 'cores'];
const IMGS = ['foto', 'banner', 'gym_imagem'];
const hist_LABEL_JSON = ['time', 'relacionamentos', 'pokemon_ghs', 'cores'];

const hash = b => crypto.createHash('sha1').update(b).digest('hex').slice(0, 10);
const erro = (msg, status, code) => Object.assign(new Error(msg), { status, code });
const parseIdx = t => { try { const j = JSON.parse(t); return Array.isArray(j) ? j : []; } catch { return []; } };
const sortIdx = a => a.sort((x, y) => {
  const ox = x.ordem == null ? 1e9 : +x.ordem, oy = y.ordem == null ? 1e9 : +y.ordem;
  return ox - oy || String(x.nome).localeCompare(String(y.nome), 'pt-BR');
});
const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

// ---------- imagens ----------
function parseImg(v) {
  if (!v) return null;
  if (typeof v !== 'string') throw erro('Imagem inválida.', 400);
  if (/^https?:\/\//i.test(v)) return { url: v };
  const m = v.match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw erro('Formato de imagem inválido.', 400);
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_IMG) throw erro('Imagem grande demais (máx. ' + (MAX_IMG / 1048576) + ' MB).', 400);
  return { buf, ext: m[1] === 'jpeg' ? 'jpg' : m[1] };
}
// cenário: 1 imagem = string; 2+ = array JSON (mesmo formato que o npcdex já usa)
function gymLista(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  const t = String(v).trim();
  if (t.charAt(0) === '[') { try { const a = JSON.parse(t); if (Array.isArray(a)) return a.filter(Boolean); } catch {} }
  return t ? [t] : [];
}
const gymSerializa = a => !a.length ? null : a.length === 1 ? a[0] : JSON.stringify(a);

// troca data URIs por URLs de arquivos do repo; devolve os campos já com URL e a lista de arquivos novos
function prepararImagens(campos, slug) {
  const novas = [];
  const um = (v, kind) => {
    const p = parseImg(v);
    if (!p) return null;
    if (p.url) return p.url;
    const path = `img/npcs/${slug}/${kind}-${hash(p.buf)}.${p.ext}`;
    if (!novas.some(n => n.path === path)) novas.push({ path, content: p.buf });
    return `${IMG_BASE}/${path}`;
  };
  const out = { ...campos };
  // sprites próprios dos Pokémon (time / pokemon_ghs): data URI vira arquivo no repo e o JSON guarda só a URL
  const spr = x => { if (x && typeof x === 'object' && typeof x.img === 'string' && /^data:image\//.test(x.img)) x.img = um(x.img, 'pk'); };
  if (Array.isArray(out.time)) out.time.forEach(spr);
  if (out.pokemon_ghs && typeof out.pokemon_ghs === 'object') Object.values(out.pokemon_ghs).forEach(v => Array.isArray(v) && v.forEach(spr));
  if ('foto' in out) out.foto = um(out.foto, 'foto');
  if ('banner' in out) out.banner = um(out.banner, 'banner');
  if ('gym_imagem' in out) out.gym_imagem = gymSerializa(gymLista(out.gym_imagem).map(v => um(v, 'gym')).filter(Boolean));
  return { campos: out, novas };
}

// ---------- validação dos campos ----------
function limpar(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw erro('Dados inválidos.', 400);
  const o = {};
  for (const k of TEXTO) if (k in c) o[k] = c[k] == null ? '' : String(c[k]).slice(0, 30000);
  for (const k of JSONF) if (k in c) {
    let v = c[k];
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    if (v != null && typeof v !== 'object') v = null;
    o[k] = v;
  }
  for (const k of IMGS) if (k in c) o[k] = c[k] == null || c[k] === '' ? null : (Array.isArray(c[k]) ? JSON.stringify(c[k]) : String(c[k]));
  if ('rel_total' in c) o.rel_total = Math.max(1, Math.min(60, parseInt(c.rel_total) || 6));
  if ('ativo' in c) o.ativo = c.ativo !== false;
  if ('ordem' in c) o.ordem = c.ordem == null || c.ordem === '' ? null : (Number.isFinite(+c.ordem) ? +c.ordem : null);
  return o;
}

// ---------- permissão ----------
const H = k => String(k).startsWith('sb_')
  ? { apikey: k, 'Content-Type': 'application/json' }
  : { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' };
async function autenticar(b) {
  const nome = String(b.nome || '').trim(), senha = String(b.senha || '');
  if (!nome || !senha) throw erro('Confirme seu nome e senha.', 401);
  const U = process.env.INDEX_SUPA_URL, K = process.env.INDEX_SUPA_KEY;
  if (!U || !K) throw erro('Servidor sem configuração (INDEX_SUPA_URL / INDEX_SUPA_KEY).', 500);
  let final = null, adm = false;
  const rpc = async fn => {
    const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(K), body: JSON.stringify({ p_nome: nome, p_senha: senha }) });
    if (!r.ok) return null;
    let j = await r.json().catch(() => null); return Array.isArray(j) ? j[0] : j;
  };
  const p = await rpc('player_login');
  if (p && p.id != null) final = p.nome || nome;
  else { const a = await rpc('admin_login'); if (a && a.nome) { final = a.nome; adm = true; } }
  if (!final) throw erro('Nome ou senha incorretos.', 403);
  if (!adm) {
    const staff = await S.lerStaff();
    const ok = n => ['chefe', 'admin'].includes(S.papel(staff, n));
    if (!ok(final) && !ok(nome)) throw erro('Só administradores editam NPCs.', 403);
  }
  return final;
}

// ---------- histórico ----------
function diff(antes, depois, por, agora) {
  const out = [];
  const add = (campo, a, n) => out.push({ campo, valor_anterior: a, valor_novo: n, editado_por: por, editado_em: agora });
  for (const k of TEXTO) if (k in depois && String(antes[k] ?? '') !== String(depois[k] ?? '')) add(k, String(antes[k] ?? ''), String(depois[k] ?? ''));
  for (const k of hist_LABEL_JSON) if (k in depois && JSON.stringify(antes[k] ?? null) !== JSON.stringify(depois[k] ?? null)) add(k, JSON.stringify(antes[k] ?? null), JSON.stringify(depois[k] ?? null));
  return out;
}
async function mudancaHist(parent, slug, novas) {
  if (!novas.length) return null;
  const path = `data/npcs-historico/${slug}.json`;
  let a = []; try { a = JSON.parse(await readFile(path, parent) || '[]'); } catch {}
  if (!Array.isArray(a)) a = [];
  return { path, content: JSON.stringify([...novas.slice().reverse(), ...a].slice(0, 300)) };   // mais novo primeiro
}

function indexEntry(n) {
  return { slug: n.slug, nome: n.nome, categoria: n.categoria || 'comum', cargo: n.cargo || '', foto: n.foto || null, ativo: n.ativo !== false, ordem: n.ordem ?? null, atualizado_em: n.atualizado_em };
}
const sprUrls = n => { const o = [], it = x => { if (x && typeof x.img === 'string') o.push(x.img); };
  (Array.isArray(n.time) ? n.time : []).forEach(it);
  if (n.pokemon_ghs && typeof n.pokemon_ghs === 'object') Object.values(n.pokemon_ghs).forEach(v => Array.isArray(v) && v.forEach(it));
  return o; };
const urlsEmUso = n => [n.foto, n.banner, ...gymLista(n.gym_imagem), ...sprUrls(n)].filter(u => typeof u === 'string');
const doDir = (existentes, emUso, manter) => existentes.filter(f => {
  const kind = f.name.split('-')[0];
  return ['foto', 'banner', 'gym', 'pk'].includes(kind) && !manter.has(f.path) && !emUso.some(u => u.endsWith('/' + f.path));
}).map(f => ({ path: f.path, content: null }));

// ---------- ações ----------
async function salvar(b, res) {
  const por = await autenticar(b);
  let slug = String(b.slug || '').trim();
  const novo = !slug;
  const campos0 = limpar(b.campos);
  if (!novo && !SLUG.test(slug)) throw erro('Slug inválido.', 400);
  if (novo) {
    if (!String(campos0.nome || '').trim()) throw erro('Informe o nome do NPC.', 400);
    let base = slugify(campos0.nome) || 'npc';
    if (RESERVADOS.includes(base)) base += '-npc';
    const ex = new Set(parseIdx(await readFile(IDX)).map(x => x.slug));
    slug = base; if (ex.has(slug)) slug = base + '-' + Date.now().toString(36).slice(-4);
  } else if ('nome' in campos0 && !campos0.nome.trim()) throw erro('O nome não pode ficar vazio.', 400);
  const { campos, novas } = prepararImagens(campos0, slug);
  const agora = new Date().toISOString();
  const caminho = `data/npcs/${slug}.json`;
  let saida = null;

  await commit(async parent => {
    const t = await readFile(caminho, parent);
    const cur = t ? JSON.parse(t) : null;
    if (novo && cur) throw erro('Já existe um NPC com esse endereço. Tente salvar de novo.', 409);
    if (!novo && !cur) throw erro('NPC não encontrado.', 404);
    const fin = { ...(cur || { ativo: true, rel_total: 6 }), ...campos, slug, atualizado_em: agora };
    saida = fin;
    const ch = [{ path: caminho, content: JSON.stringify(fin) }];
    const [existentes, idxTxt] = await Promise.all([listDir(`img/npcs/${slug}`, parent), readFile(IDX, parent)]);
    for (const n of novas) ch.push(n);
    ch.push(...doDir(existentes, urlsEmUso(fin), new Set(novas.map(n => n.path))));
    try { const h = await mudancaHist(parent, slug, cur ? diff(cur, fin, por, agora) : [{ campo: 'nome', valor_anterior: '', valor_novo: 'NPC criado', editado_por: por, editado_em: agora }]); if (h) ch.push(h); }
    catch (e) { console.warn('npcs: histórico falhou:', e.message); }
    const idx = parseIdx(idxTxt).filter(x => x.slug !== slug); idx.push(indexEntry(fin));
    ch.push({ path: IDX, content: JSON.stringify(sortIdx(idx)) });
    return ch;
  }, `npc: ${novo ? 'criar' : 'salvar'} ${slug}`);

  return res.json({ ok: true, slug, foto: saida.foto ?? null, banner: saida.banner ?? null, gym_imagem: saida.gym_imagem ?? null, atualizado_em: agora });
}

async function excluir(b, res) {
  await autenticar(b);
  const slug = String(b.slug || '');
  if (!SLUG.test(slug)) throw erro('Slug inválido.', 400);
  await commit(async parent => {
    const ch = [{ path: `data/npcs/${slug}.json`, content: null }, { path: `data/npcs-historico/${slug}.json`, content: null }];
    for (const f of await listDir(`img/npcs/${slug}`, parent)) ch.push({ path: f.path, content: null });
    const idx = parseIdx(await readFile(IDX, parent)).filter(x => x.slug !== slug);
    ch.push({ path: IDX, content: JSON.stringify(idx) });
    return ch;
  }, `npc: excluir ${slug}`);
  return res.json({ ok: true });
}

async function acao(action, b, res) {
  try {
    if (action === 'npc_salvar') return await salvar(b, res);
    if (action === 'npc_excluir') return await excluir(b, res);
    return res.status(400).json({ error: 'Ação desconhecida.' });
  } catch (e) { return res.status(e.status || 500).json({ error: e.message || 'Erro ao salvar o NPC.', code: e.code }); }
}

// ---------- leitura ----------
async function lista(res) {
  const t = await readFile(IDX);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10');
  return res.status(200).send(t || '[]');
}
async function obter(slug, res) {
  if (!SLUG.test(String(slug))) return res.status(400).json({ error: 'Slug inválido.' });
  const t = await readFile(`data/npcs/${slug}.json`);
  if (t == null) { res.setHeader('Cache-Control', 's-maxage=5'); return res.status(404).json({ error: 'NPC não encontrado.' }); }
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=2');
  return res.status(200).send(t);
}
async function historico(slug, res) {
  if (!SLUG.test(String(slug))) return res.status(400).json({ error: 'Slug inválido.' });
  const t = await readFile(`data/npcs-historico/${slug}.json`);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5');
  return res.status(200).send(t || '[]');
}

// ---------- migração única: tabela npcs do Supabase -> JSON no GitHub ----------
// Abra  /api/ficha-salvar?npcmigrar=1&chave=SUA_CHAVE  e recarregue até aparecer "restam": 0.
async function migrar(q, res) {
  const KEY = process.env.MIGRAR_KEY;
  if (!KEY || q.chave !== KEY) return res.status(403).json({ error: 'Chave inválida ou MIGRAR_KEY não configurada.' });
  const SU = (process.env.NPCS_SUPA_URL || 'https://fatdzivyqipmcbzaiftc.supabase.co').replace(/\/$/, '');
  const SK = process.env.NPCS_SUPA_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdGR6aXZ5cWlwbWNiemFpZnRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NTMyNDAsImV4cCI6MjA5ODQyOTI0MH0.0SRPZt1RYSpEbPQazv7ttHJBZNDOyIax2YRO49bvpmE';
  const sbGet = async p => {
    const r = await fetch(SU + '/rest/v1/' + p, { headers: { apikey: SK, Authorization: 'Bearer ' + SK, Range: '0-9999' } });
    if (!r.ok) throw new Error('Supabase HTTP ' + r.status);
    return r.json();
  };
  const lim = Math.max(1, Math.min(+q.n || 2, 4));
  const todos = await sbGet('npcs?select=slug&order=slug.asc');
  const validos = todos.map(x => x.slug).filter(s => SLUG.test(s || ''));
  const feitos = new Set(parseIdx(await readFile(IDX)).map(x => x.slug));
  const pend = validos.filter(s => !feitos.has(s));
  const lote = pend.slice(0, lim);
  if (!lote.length) return res.json({ ok: true, restam: 0, total: todos.length, ignorados: todos.length - validos.length, msg: 'Nada a migrar.' });

  const rows = [];
  for (const s of lote) { const r = await sbGet('npcs?slug=eq.' + encodeURIComponent(s)); if (r[0]) rows.push(r[0]); }
  const hists = {};
  for (const r of rows) { try { hists[r.slug] = await sbGet(`npcs_historico?npc_id=eq.${r.id}&order=editado_em.desc&limit=300`); } catch { hists[r.slug] = []; } }
  const jparse = (v, vazio) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return vazio; } } return v ?? vazio; };

  await commit(async parent => {
    const ch = [], idx = parseIdx(await readFile(IDX, parent));
    for (const r of rows) {
      const slug = r.slug;
      const bruto = { foto: r.foto || null, banner: r.banner || null, gym_imagem: r.gym_imagem || null };
      const { campos: im, novas } = prepararImagens(bruto, slug);
      ch.push(...novas);
      const npc = { slug, ativo: r.ativo !== false, ordem: r.ordem ?? null, rel_total: parseInt(r.rel_total) || 6, ...im, atualizado_em: r.updated_at || new Date().toISOString() };
      for (const k of TEXTO) npc[k] = r[k] == null ? '' : String(r[k]);
      npc.time = jparse(r.time, []); npc.relacionamentos = jparse(r.relacionamentos, []); npc.pokemon_ghs = jparse(r.pokemon_ghs, null); npc.cores = jparse(r.cores, null);
      ch.push({ path: `data/npcs/${slug}.json`, content: JSON.stringify(npc) });
      const h = (hists[slug] || []).map(x => ({ campo: x.campo, valor_anterior: x.valor_anterior, valor_novo: x.valor_novo, editado_por: x.editado_por || 'ADM', editado_em: x.editado_em }));
      if (h.length) ch.push({ path: `data/npcs-historico/${slug}.json`, content: JSON.stringify(h) });
      const i = idx.findIndex(e => e.slug === slug); if (i >= 0) idx.splice(i, 1);
      idx.push(indexEntry(npc));
    }
    ch.push({ path: IDX, content: JSON.stringify(sortIdx(idx)) });
    return ch;
  }, 'npc: migrar ' + lote.join(', '));

  return res.json({ ok: true, migrados: rows.map(r => r.slug), restam: pend.length - rows.length, total: todos.length, msg: pend.length - rows.length > 0 ? 'Recarregue esta página para continuar.' : 'Pronto! Todos migrados.' });
}

module.exports = { acao, lista, obter, historico, migrar };
