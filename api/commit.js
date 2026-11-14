// /api/commit — função única que substitui commit-abilities, commit-moves, commit-rewards,
// commit-items, commit-image, commit-stores e missoes_publicar (a Vercel Hobby aceita no máximo 12 funções).
// O tipo vem do rewrite do vercel.json (/api/commit-stores -> /api/commit?tipo=stores),
// então as páginas continuam chamando os mesmos endereços de antes.
// O GITHUB_TOKEN fica só na Vercel (env var); o navegador nunca vê o token.

const OWNER = 'alphx-r';
const REPO = process.env.GITHUB_REPO ? process.env.GITHUB_REPO.split('/')[1] : 'kingdomplatinum';
const OWN = process.env.GITHUB_REPO ? process.env.GITHUB_REPO.split('/')[0] : OWNER;
const BRANCH = process.env.GITHUB_BRANCH || 'main';
import crypto from 'crypto';
const API = `https://api.github.com/repos/${OWN}/${REPO}`;

const AUTH_URL = process.env.AUTH_SUPA_URL || 'https://ucbkodkjlbatttiuqjtv.supabase.co';
const AUTH_KEY = process.env.AUTH_SUPA_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjYmtvZGtqbGJhdHR0aXVxanR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NjExODcsImV4cCI6MjA5MzMzNzE4N30.a65MSk7m4DvgTw2pHXhaqMOOEpjTB_wPsXJUfvOGiG4';

// abilities e moves nunca checaram admin (as páginas deles não enviam o campo "admin").
// Deixe false para não quebrar essas duas páginas; quando elas passarem a enviar
// admin: <email do adm_session>, troque para true e o endpoint fica protegido.
const EXIGIR_ADMIN_EM_TODOS = false;
const SEM_ADMIN_LEGADO = new Set(['abilities', 'moves']);

class HttpErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const ghHeaders = token => ({
  Authorization: 'Bearer ' + token,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kingdomplatinum-commit',
});

// Chave de transição: true = ainda aceita o modo antigo (só o nome/email do admin, SEM senha).
// Esse modo é a falha de segurança: desligue (false) assim que todas as páginas ADM enviarem admin_nome/admin_senha.
const ACEITAR_EMAIL_LEGADO = true;

// Modo novo: nome+senha do PLAYER, conferidos no servidor, e papel lido de config.kp_staff.
// chefe/admin editam tudo; MOD só edita o tipo do seu site (mods[tipo]). Retorna null se o corpo não usa o modo novo.
// Crachá de equipe emitido pelo /api/ficha-token no login (nome + validade assinados com COMMIT_SECRET).
function nomeDoCt(ct) {
  const segredo = process.env.COMMIT_SECRET;
  if (!segredo || typeof ct !== 'string') return null;
  const [p, sig] = ct.split('.');
  if (!p || !sig) return null;
  const esperado = crypto.createHmac('sha256', segredo).update(p).digest('base64url');
  const A = Buffer.from(sig), B = Buffer.from(esperado);
  if (A.length !== B.length || !crypto.timingSafeEqual(A, B)) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    return d && typeof d.n === 'string' && d.exp > Date.now() ? d.n : null;
  } catch (e) { return null; }
}

const CT_DIAS = 30;
function assinarCt(nome) {
  const segredo = process.env.COMMIT_SECRET;
  if (!segredo) return null;
  const p = Buffer.from(JSON.stringify({ n: nome, exp: Date.now() + CT_DIAS * 864e5 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', segredo).update(p).digest('base64url');
}

async function adminOkPlayer(body, tipo) {
  if (body.ct) {   // sessão: sem senha. O papel é lido de config.kp_staff a cada pedido.
    const nome = nomeDoCt(body.ct);
    if (nome) {
      try {
        const m = await import('./_staff.js'); const ST = m.default || m;
        const p = ST.papel(await ST.lerStaff(), nome, tipo);
        return p === 'chefe' || p === 'admin' || p === 'mod';
      } catch (e) { return false; }
    }
    if (!body.admin_nome || !body.admin_senha) return false;   // crachá vencido/inválido e sem senha -> 401
  }
  if (!body.admin_nome || !body.admin_senha) return null;
  try {
    const m = await import('./_staff.js'); const ST = m.default || m;
    const eu = await ST.verificarPlayer(body.admin_nome, body.admin_senha);
    if (!eu) return false;
    const p = ST.papel(await ST.lerStaff(), eu.nome, tipo);
    const ok = p === 'chefe' || p === 'admin' || p === 'mod';
    if (ok) body._ctNovo = assinarCt(eu.nome);   // senha confirmada: devolve um crachá novo (a pessoa não precisa digitar de novo)
    return ok;
  } catch (e) { return false; }
}

async function adminOk(email) {
  if (!email || typeof email !== 'string') return false;
  try {
    const r = await fetch(`${AUTH_URL}/rest/v1/rpc/admin_list`, {
      method: 'POST',
      headers: { apikey: AUTH_KEY, Authorization: 'Bearer ' + AUTH_KEY, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) return false;
    const lista = await r.json().catch(() => []);
    return Array.isArray(lista) && lista.some(a => a && a.nome === email);
  } catch (e) { return false; }
}

// Cria/atualiza UM arquivo via Contents API. conteudo: { texto } (utf8) ou { base64 }.
async function putArquivo(token, path, conteudo, mensagem, { pularSeIgual = false } = {}) {
  const url = `${API}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const H = ghHeaders(token);
  let sha, antigo = null;
  const cur = await fetch(`${url}?ref=${encodeURIComponent(BRANCH)}`, { headers: H });
  if (cur.ok) {
    const j = await cur.json();
    sha = j.sha;
    antigo = Buffer.from(j.content || '', 'base64').toString('utf8');
  } else if (cur.status !== 404) {
    throw new HttpErr(502, `GitHub respondeu HTTP ${cur.status} ao ler ${path}`);
  }
  if (pularSeIgual && conteudo.texto != null && antigo === conteudo.texto) return { unchanged: true };
  const b64 = conteudo.base64 != null ? conteudo.base64 : Buffer.from(conteudo.texto, 'utf8').toString('base64');
  const put = await fetch(url, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: String(mensagem).slice(0, 200), content: b64, branch: BRANCH, ...(sha ? { sha } : {}) }),
  });
  const out = await put.json().catch(() => ({}));
  if (!put.ok) throw new HttpErr(502, out.message || `GitHub respondeu HTTP ${put.status} ao commitar ${path}`);
  return { unchanged: false, sha: out.content?.sha || null, commitSha: out.commit?.sha || null, htmlUrl: out.content?.html_url || null };
}

/* ───────────── abilities ───────────── */
async function hAbilities(token, body) {
  const { abilities } = body;
  if (!Array.isArray(abilities)) throw new HttpErr(400, 'Payload inválido: esperado { abilities: [...] }.');
  const r = await putArquivo(token, 'abilitydex/abilities.json', { texto: JSON.stringify(abilities, null, 2) },
    `chore: atualiza abilities.json (${abilities.length} habilidades) via abilitydex_adm`);
  return { ok: true, commitSha: r.commitSha, htmlUrl: r.htmlUrl };
}

/* ───────────── moves ───────────── */
async function hMoves(token, body) {
  const { moves } = body;
  if (!Array.isArray(moves)) throw new HttpErr(400, 'Payload inválido: esperado { moves: [...] }.');
  const r = await putArquivo(token, 'movedex/moves.json', { texto: JSON.stringify(moves, null, 2) },
    `chore: atualiza moves.json (${moves.length} moves) via movedex_adm`);
  return { ok: true, commitSha: r.commitSha, htmlUrl: r.htmlUrl };
}

/* ───────────── rewards ───────────── */
const REW_CATS = ['badges', 'ribbons', 'pins', 'randoms'];
function limpaRewards(rewards) {
  if (!rewards || typeof rewards !== 'object') return null;
  const out = {};
  for (const c of REW_CATS) {
    const a = rewards[c] === undefined ? [] : rewards[c];
    if (!Array.isArray(a) || a.length > 1000) return null;
    out[c] = [];
    for (const x of a) {
      const nome = typeof x?.nome === 'string' ? x.nome.trim() : '';
      const sprite = typeof x?.sprite === 'string' ? x.sprite.trim() : '';
      if (!nome || nome.length > 120 || sprite.length > 240) return null;
      if (sprite && (/^[a-z][a-z0-9+.-]*:/i.test(sprite) || sprite.startsWith('//') || sprite.includes('..'))) return null;
      out[c].push({ nome, sprite });
    }
  }
  return out;
}
const formataRewards = r => '{\n' + REW_CATS.map(c => `  "${c}": [` + (r[c].length ? '\n' + r[c].map(x => '    ' + JSON.stringify(x)).join(',\n') + '\n  ' : '') + ']').join(',\n') + '\n}\n';
async function hRewards(token, body) {
  const rewards = limpaRewards(body.rewards);
  if (!rewards) throw new HttpErr(400, 'Conteúdo do rewards.json inválido');
  const r = await putArquivo(token, 'itemdex/rewards.json', { texto: formataRewards(rewards) },
    'Atualiza itemdex/rewards.json (ItemDex ADM)', { pularSeIgual: true });
  return r.unchanged ? { ok: true, unchanged: true } : { ok: true, sha: r.sha };
}

/* ───────────── items (items.json + imagens, 1 commit só) ───────────── */
const IMG_PATH_RE = /^sprites\/(items(\/[\p{L}\p{N}][\p{L}\p{N}._ -]*)?|rewards\/(badges|ribbons|pins|randoms))\/[a-z0-9][a-z0-9._-]*\.(png|webp|gif|jpg|jpeg)$/u;
async function hItems(token, body) {
  const { items, images = [] } = body;
  if (!Array.isArray(items) || !Array.isArray(images)) throw new HttpErr(400, 'Payload inválido.');
  for (const im of images) {
    if (!im?.path || !IMG_PATH_RE.test(im.path) || im.path.includes('..')) throw new HttpErr(400, `Caminho não permitido: ${im?.path}`);
    if (!/^[A-Za-z0-9+/=]+$/.test(im.contentBase64 || '') || im.contentBase64.length > 2_000_000) throw new HttpErr(400, `Imagem inválida ou grande demais: ${im.path}`);
  }
  const FILE = 'itemdex/items.json';
  const H = { ...ghHeaders(token), 'Content-Type': 'application/json' };
  const gh = async (path, method = 'GET', b) => {
    const r = await fetch(`${API}/${path}`, { method, headers: H, body: b ? JSON.stringify(b) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || `GitHub HTTP ${r.status}`);
    return d;
  };
  const headSha = (await gh(`git/ref/heads/${BRANCH}`)).object.sha;
  const baseTree = (await gh(`git/commits/${headSha}`)).tree.sha;
  const entries = [];
  for (const im of images) {
    const b = await gh('git/blobs', 'POST', { content: im.contentBase64, encoding: 'base64' });
    entries.push({ path: im.path, mode: '100644', type: 'blob', sha: b.sha });
  }
  const jb = await gh('git/blobs', 'POST', { content: JSON.stringify(items, null, 2), encoding: 'utf-8' });
  entries.push({ path: FILE, mode: '100644', type: 'blob', sha: jb.sha });
  const tree = await gh('git/trees', 'POST', { base_tree: baseTree, tree: entries });
  if (tree.sha === baseTree) return { ok: true, unchanged: true };
  const commit = await gh('git/commits', 'POST', {
    message: `chore: atualiza ${FILE} (${items.length} itens, ${images.length} imagens) via itemdex_adm`,
    tree: tree.sha, parents: [headSha],
  });
  await gh(`git/refs/heads/${BRANCH}`, 'PATCH', { sha: commit.sha });
  return { ok: true, commitSha: commit.sha };
}

/* ───────────── image (uma imagem em sprites/) ───────────── */
async function hImage(token, body) {
  const { path, contentBase64, message } = body;
  if (!path || !IMG_PATH_RE.test(path) || path.includes('..'))
    throw new HttpErr(400, 'Caminho não permitido. Use sprites/items/<categoria>/ ou sprites/rewards/<badges|ribbons|pins|randoms>/ com nome em minúsculas.');
  if (!contentBase64 || !/^[A-Za-z0-9+/=]+$/.test(contentBase64)) throw new HttpErr(400, 'Imagem inválida.');
  if (contentBase64.length > 2_000_000) throw new HttpErr(413, 'Imagem grande demais (máx. ~1,5 MB).');
  const r = await putArquivo(token, path, { base64: contentBase64 }, message || `Atualiza ${path}`);
  return { ok: true, path, sha: r.sha, commit: r.commitSha };
}

/* ───────────── stores (stores/stores.json) ───────────── */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ESTACOES = ['primavera', 'verao', 'outono', 'inverno'];
const RECURSOS = ['reciclagem', 'tm_voucher'];
const HEX = /^#[0-9a-f]{6}$/i;
const CAMPOS_LOJA = new Set(['slug', 'nome', 'empresa', 'descricao', 'logo', 'banner', 'modo', 'compra', 'sell_pct', 'estacoes', 'requisitos', 'recursos', 'ativa', 'ordem', 'promocao', 'promo_ate', 'tema', 'detalhes']);
const txt = (v, max) => { const s = typeof v === 'string' ? v.trim() : ''; return s.length > max ? null : s; };
const urlOk = u => u === '' || ((/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u)) && !u.includes('..'));

function limpaLoja(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const slug = typeof x.slug === 'string' ? x.slug : '';
  if (!SLUG_RE.test(slug)) return null;
  const nome = txt(x.nome, 120), empresa = txt(x.empresa, 120), descricao = txt(x.descricao, 500);
  const logo = txt(x.logo, 400), banner = txt(x.banner, 400), promocao = txt(x.promocao, 120);
  if (!nome || empresa == null || descricao == null || logo == null || banner == null || promocao == null) return null;
  if (!urlOk(logo) || !urlOk(banner)) return null;

  const o = {};
  // campos extras (ex.: compra_venda_flag) passam desde que sejam valores simples
  for (const [k, v] of Object.entries(x)) {
    if (CAMPOS_LOJA.has(k) || !/^[a-z][a-z0-9_]{0,39}$/i.test(k)) continue;
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 500)) o[k] = v;
  }
  o.slug = slug; o.nome = nome; o.empresa = empresa; o.descricao = descricao; o.logo = logo; o.banner = banner;
  o.modo = x.modo === 'catalogo' ? 'catalogo' : 'loja';
  o.compra = x.compra !== false;
  const sp = Number(x.sell_pct);
  o.sell_pct = Number.isFinite(sp) ? Math.min(1, Math.max(0, sp)) : 0.5;

  if (x.estacoes == null) o.estacoes = null;
  else {
    if (!Array.isArray(x.estacoes) || x.estacoes.some(e => !ESTACOES.includes(e))) return null;
    o.estacoes = x.estacoes.length ? [...new Set(x.estacoes)] : null;
  }
  o.requisitos = x.requisitos && x.requisitos.vip ? { vip: true } : null;
  if (x.recursos == null) o.recursos = [];
  else {
    if (!Array.isArray(x.recursos) || x.recursos.some(r => !RECURSOS.includes(r))) return null;
    o.recursos = [...new Set(x.recursos)];
  }
  o.ativa = x.ativa !== false;
  const ord = Number(x.ordem);
  o.ordem = Number.isFinite(ord) ? ord : 99;

  if (promocao) {
    o.promocao = promocao;
    if (x.promo_ate != null && x.promo_ate !== '') {
      if (typeof x.promo_ate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.promo_ate)) return null;
      o.promo_ate = x.promo_ate;
    }
  }
  if (x.tema != null) {
    if (typeof x.tema !== 'object' || Array.isArray(x.tema)) return null;
    const t = {};
    for (const k of ['brand', 'brandMid', 'accent', 'bg', 'surface', 'text']) {
      if (x.tema[k] == null) continue;
      if (typeof x.tema[k] !== 'string' || !HEX.test(x.tema[k])) return null;
      t[k] = x.tema[k];
    }
    if (Object.keys(t).length) o.tema = t;
  }
  // detalhes por item (lojas de catálogo): { [nomeNormalizado]: { qtd: inteiro>=0 | null, obs: texto } }
  if (x.detalhes != null) {
    if (typeof x.detalhes !== 'object' || Array.isArray(x.detalhes)) return null;
    const es = Object.entries(x.detalhes);
    if (es.length > 500) return null;
    const d = {};
    for (const [k, v] of es) {
      if (!/^[a-z0-9]{1,80}$/.test(k) || !v || typeof v !== 'object' || Array.isArray(v)) return null;
      let qtd = null;
      if (v.qtd != null && v.qtd !== '') {
        const n = Number(v.qtd);
        if (!Number.isFinite(n) || n < 0 || n > 999999) return null;
        qtd = Math.floor(n);
      }
      const obs = txt(v.obs == null ? '' : v.obs, 300);
      if (obs == null) return null;
      if (qtd == null && !obs) continue;
      d[k] = { qtd, obs };
    }
    if (Object.keys(d).length) o.detalhes = d;
  }
  return o;
}
function limpaLojas(lista) {
  if (!Array.isArray(lista) || lista.length < 1 || lista.length > 200) return null;
  const out = [], vistos = new Set();
  for (const x of lista) {
    const l = limpaLoja(x);
    if (!l || vistos.has(l.slug)) return null;
    vistos.add(l.slug); out.push(l);
  }
  return out;
}
async function hStores(token, body) {
  const lojas = limpaLojas(body.lojas);
  if (!lojas) throw new HttpErr(400, 'Conteúdo do stores.json inválido (confira slug, nome, cores e se há slugs repetidos).');
  const r = await putArquivo(token, 'stores/stores.json', { texto: JSON.stringify(lojas, null, 2) + '\n' },
    'Atualiza stores/stores.json (Stores ADM)', { pularSeIgual: true });
  return r.unchanged ? { ok: true, unchanged: true, lojas } : { ok: true, sha: r.sha, lojas };
}

/* ───────────── missões (missoes/missoes.json — Quests Guild) ─────────────
   Recebe { missoes: [...novas/editadas], apagar: [ids] } (o mesmo lote que o missoes.html guarda como rascunho),
   aplica sobre o missoes.json publicado e faz UM commit. Aceita array puro ou { missoes: [...] } e mantém o formato.
   Campos fora de CAMPOS_MISSAO que já existam na missão publicada são preservados. */
const CAMPOS_MISSAO = ['titulo', 'ranking', 'estilo', 'pre_requisitos', 'local', 'mapa', 'capturavel', 'repetivel', 'descricao', 'recompensas', 'ordem', 'repeticao', 'repeticao_dias', 'ativa', 'vagas'];
// mesmos valores do <select> de repetição do missoes.html ('dias' = personalizado, usa repeticao_dias)
const REPETICOES = new Set(['livre', 'sem_limite', 'diaria', '3dias', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'dias', 'nao']);
function limpaMissao(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const id = m.id == null ? '' : String(m.id).trim();
  if (!id || id.length > 80) return null;
  const o = { id };
  for (const k of CAMPOS_MISSAO) {
    const v = m[k];
    if (v == null || v === '') continue;
    if (typeof v === 'string') { if (v.length > 5000) return null; o[k] = v; }
    else if (typeof v === 'number') { if (!Number.isFinite(v)) return null; o[k] = v; }
    else if (typeof v === 'boolean') o[k] = v;
    else return null;
  }
  if (typeof o.titulo !== 'string' || !o.titulo.trim()) return null;
  if (o.repeticao != null && !REPETICOES.has(o.repeticao)) return null;
  if (o.repeticao === 'dias') { const d = parseInt(o.repeticao_dias, 10); if (!(d > 0 && d <= 3650)) return null; o.repeticao_dias = d; }
  else delete o.repeticao_dias;
  return o;
}
async function lerArquivo(token, path) {
  const url = `${API}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { headers: ghHeaders(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpErr(502, `GitHub respondeu HTTP ${r.status} ao ler ${path}`);
  const j = await r.json();
  return Buffer.from(j.content || '', 'base64').toString('utf8');
}
async function hMissoes(token, body) {
  const { missoes = [], apagar = [] } = body;
  if (!Array.isArray(missoes) || !Array.isArray(apagar) || missoes.length > 500 || apagar.length > 500)
    throw new HttpErr(400, 'Payload inválido: esperado { missoes: [...], apagar: [...] }.');
  const lote = missoes.map(limpaMissao);
  if (lote.some(x => !x)) throw new HttpErr(400, 'Missão inválida (confira id e título).');
  const ids = apagar.map(String);
  if (!lote.length && !ids.length) throw new HttpErr(400, 'Nada para publicar.');

  const FILE = 'missoes/missoes.json';
  const texto = await lerArquivo(token, FILE);
  let raiz = [];
  if (texto != null) { try { raiz = JSON.parse(texto); } catch (e) { throw new HttpErr(502, 'missoes.json atual não é um JSON válido.'); } }
  const ehArray = Array.isArray(raiz);
  let lista = ehArray ? raiz : (raiz && Array.isArray(raiz.missoes) ? raiz.missoes : null);
  if (!lista) throw new HttpErr(502, 'Formato inesperado no missoes.json atual.');
  lista = lista.slice();

  let novas = 0, editadas = 0, apagadas = 0;
  for (const m of lote) {
    const i = lista.findIndex(x => x && String(x.id) === m.id);
    if (i >= 0) {
      const extras = {};
      for (const [k, v] of Object.entries(lista[i])) if (k !== 'id' && !CAMPOS_MISSAO.includes(k)) extras[k] = v;
      lista[i] = { id: m.id, ...extras, ...m }; editadas++;
    } else { lista.push(m); novas++; }
  }
  if (ids.length) {
    const antes = lista.length;
    lista = lista.filter(x => !(x && ids.includes(String(x.id))));
    apagadas = antes - lista.length;
  }
  const saida = ehArray ? lista : { ...raiz, missoes: lista };
  const r = await putArquivo(token, FILE, { texto: JSON.stringify(saida, null, 2) + '\n' },
    `Quests Guild: +${novas} nova(s), ~${editadas} editada(s), -${apagadas} apagada(s) (missoes.html)`, { pularSeIgual: true });
  return r.unchanged ? { ok: true, unchanged: true, novas, editadas, apagadas }
                     : { ok: true, novas, editadas, apagadas, commitSha: r.commitSha, htmlUrl: r.htmlUrl };
}

/* ───────────── roteamento ───────────── */
const TIPOS = { abilities: hAbilities, moves: hMoves, rewards: hRewards, items: hItems, image: hImage, stores: hStores, missoes: hMissoes };

function tipoDe(req) {
  const q = req.query && req.query.tipo;
  if (q) return String(Array.isArray(q) ? q[0] : q).toLowerCase();
  const m = String(req.url || '').match(/commit-([a-z]+)/i);
  return m ? m[1].toLowerCase() : '';
}

export default async function handler(req, res) {
  const tipo = tipoDe(req);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Método não permitido.' }); }
  const fn = TIPOS[tipo];
  if (!fn) return res.status(400).json({ error: 'Tipo de commit desconhecido: ' + (tipo || '(vazio)') });
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN não configurado na Vercel.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Corpo da requisição inválido.' });

  try {
    const exige = EXIGIR_ADMIN_EM_TODOS || !SEM_ADMIN_LEGADO.has(tipo) || body.admin != null || body.admin_nome != null;
    if (exige) {
      const viaPlayer = await adminOkPlayer(body, tipo);
      const ok = viaPlayer !== null ? viaPlayer : (ACEITAR_EMAIL_LEGADO && await adminOk(body.admin));
      if (!ok) return res.status(401).json({ error: 'Sem permissão. Entre com seu player (nome e senha) e ative o modo ADM.' });
    }
    const out = await fn(token, body);
    return res.status(200).json(body._ctNovo ? { ...out, ct: body._ctNovo } : out);
  } catch (e) {
    return res.status(e instanceof HttpErr ? e.status : 500).json({ error: e.message || 'Erro inesperado' });
  }
}
