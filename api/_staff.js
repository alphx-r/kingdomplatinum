// api/_staff.js — lista de acesso (config.kp_staff no projeto do index) e checagem por PLAYER.
// Arquivo com "_" não conta como função na Vercel (limite de 12 no plano Hobby).
// Formato:  { chefe:'ricky', admins:['jef','lucas'], mods:{ torneios:[], stores:[] } }   (nomes sem acento/espaço, minúsculos)
const nrm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toLowerCase();
const H = k => String(k).startsWith('sb_')
  ? { apikey: k, 'Content-Type': 'application/json' }   // chaves novas (sb_publishable_/sb_secret_) só vão no header apikey
  : { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' };   // chaves antigas (JWT)
const PADRAO = { chefe: 'ricky', admins: ['jef', 'lucas'], mods: {} };

const lista = a => Array.isArray(a) ? [...new Set(a.map(x => nrm(x && typeof x === 'object' ? x.nome : x)).filter(Boolean))] : [];
function normaliza(v) {
  if (!v || typeof v !== 'object') return null;
  const mods = {};
  for (const [k, a] of Object.entries(v.mods || {})) mods[String(k).toLowerCase()] = lista(a);
  return { chefe: nrm(v.chefe) || PADRAO.chefe, admins: lista(v.admins), mods };
}

async function lerStaff() {
  try {
    const r = await fetch(`${process.env.INDEX_SUPA_URL}/rest/v1/config?chave=eq.kp_staff&select=valor`, { headers: H(process.env.INDEX_SUPA_KEY) });
    if (!r.ok) return PADRAO;
    let v = (await r.json().catch(() => []))?.[0]?.valor;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    return normaliza(v) || PADRAO;
  } catch { return PADRAO; }
}

// 'chefe' | 'admin' | 'mod' | null  (site só importa para mod)
function papel(staff, nome, site) {
  const n = nrm(nome); if (!n) return null;
  if (n === staff.chefe) return 'chefe';
  if (staff.admins.includes(n)) return 'admin';
  if (site && (staff.mods[String(site).toLowerCase()] || []).includes(n)) return 'mod';
  return null;
}

// confere nome+senha do PLAYER (mesma função do login normal) -> { id, nome } ou null
async function verificarPlayer(nome, senha) {
  if (!nome || !senha) return null;
  const r = await fetch(`${process.env.INDEX_SUPA_URL}/rest/v1/rpc/player_login`, { method: 'POST', headers: H(process.env.INDEX_SUPA_KEY), body: JSON.stringify({ p_nome: nome, p_senha: senha }) });
  if (!r.ok) return null;
  let j = await r.json().catch(() => null); j = Array.isArray(j) ? j[0] : j;
  return j && j.id != null ? { id: String(j.id), nome: j.nome || nome } : null;
}

// POST /api/ficha-salvar { action:'staff_salvar', nome, senha, staff:{ admins:[], mods:{site:[]} } }
// Chefe e ADM editam a lista; ninguém troca o chefe por aqui (isso é feito direto no banco).
async function salvar(b, res) {
  const SK = process.env.INDEX_SUPA_SERVICE_KEY;
  if (!SK || !process.env.INDEX_SUPA_URL) return res.status(500).json({ error: 'Servidor sem INDEX_SUPA_SERVICE_KEY.' });
  const eu = await verificarPlayer(b.nome, b.senha);
  if (!eu) return res.status(401).json({ error: 'Nome ou senha incorretos.' });
  const atual = await lerStaff();
  const p = papel(atual, eu.nome);
  if (p !== 'chefe' && p !== 'admin') return res.status(403).json({ error: 'Só o chefe e os ADMs editam a lista de acesso.' });
  const novo = normaliza(b.staff);
  if (!novo) return res.status(400).json({ error: 'Lista inválida.' });
  novo.chefe = atual.chefe;
  novo.admins = novo.admins.filter(x => x !== novo.chefe);
  const r = await fetch(`${process.env.INDEX_SUPA_URL}/rest/v1/config?on_conflict=chave`, {
    method: 'POST', headers: { ...H(SK), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ chave: 'kp_staff', valor: novo })
  });
  if (!r.ok) return res.status(500).json({ error: 'Falha ao salvar a lista.' });
  return res.status(200).json({ ok: true, staff: novo });
}

module.exports = { nrm, PADRAO, lerStaff, papel, verificarPlayer, salvar };
