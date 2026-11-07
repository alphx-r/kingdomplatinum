// api/_missoes_publicar.js — (prefixo _ = a Vercel NÃO conta como função; é só um módulo importado)
// Chamado por /api/missoes_publicar, que o vercel.json reescreve para uma função que você já tem (ver instruções no chat).
// Grava missões criadas na Quests Guild direto no missoes.json do GitHub (commit automático).
// A Vercel refaz o deploy sozinha quando o commit entra na branch conectada.
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   GITHUB_QG_TOKEN   token fine-grained com "Contents: Read and write" no repositório do site
//   GITHUB_QG_REPO    "dono/repositorio" (ex.: "alphx-r/meu-site")
//   GITHUB_BRANCH  opcional, padrão "main"
//   MISSOES_PATH   opcional, padrão "missoes/missoes.json"
// Só admin: confere e-mail+senha pela função admin_login do Supabase (a mesma do login de admin do index).
const SUPA = 'https://ucbkodkjlbatttiuqjtv.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjYmtvZGtqbGJhdHR0aXVxanR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NjExODcsImV4cCI6MjA5MzMzNzE4N30.a65MSk7m4DvgTw2pHXhaqMOOEpjTB_wPsXJUfvOGiG4';
const TXT = ['titulo','ranking','estilo','pre_requisitos','local','mapa','capturavel','repetivel','descricao','recompensas'];
const CAMPOS = [...TXT, 'ordem', 'repeticao', 'ativa'];
const REP = ['livre','diaria','semanal','nao'];

function limpa(m) {
  if (!m || typeof m !== 'object') return null;
  const id = String(m.id ?? '');
  if (!/^[\w-]{1,60}$/.test(id)) return null;
  const o = { id };
  for (const k of TXT) {
    if (m[k] == null || m[k] === '') continue;
    if (typeof m[k] !== 'string' || m[k].length > 5000) return null;
    o[k] = m[k];
  }
  if (!o.titulo || o.titulo.length > 200) return null;
  if (m.ordem != null) { if (!Number.isInteger(m.ordem)) return null; o.ordem = m.ordem; }
  if (m.repeticao != null && m.repeticao !== 'livre') { if (!REP.includes(m.repeticao)) return null; o.repeticao = m.repeticao; }
  if (m.ativa === false) o.ativa = false;
  return o;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const GITHUB_TOKEN = process.env.GITHUB_QG_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_QG_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const path = process.env.MISSOES_PATH || 'missoes/missoes.json';
  if (!GITHUB_TOKEN || !GITHUB_REPO) return res.status(500).json({ error: 'Servidor sem GITHUB_QG_TOKEN/GITHUB_QG_REPO configurados na Vercel.' });

  let b = req.body;
  try { if (typeof b === 'string') b = JSON.parse(b || '{}'); } catch { b = {}; }
  b = b || {};
  const { nome, senha } = b;
  if (typeof nome !== 'string' || typeof senha !== 'string' || !nome || !senha) return res.status(400).json({ error: 'Informe e-mail e senha de admin.' });
  const enviadas = Array.isArray(b.missoes) ? b.missoes : [];
  const apagar = Array.isArray(b.apagar) ? b.apagar.map(String) : [];
  if ((!enviadas.length && !apagar.length) || enviadas.length > 50 || apagar.length > 50) return res.status(400).json({ error: 'Nada para publicar (máx. 50 por vez).' });
  if (apagar.some(id => !/^[\w-]{1,60}$/.test(id))) return res.status(400).json({ error: 'Alguma missão para apagar tem id inválido.' });
  const novas = enviadas.map(limpa);
  if (novas.some(x => !x)) return res.status(400).json({ error: 'Alguma missão está inválida (id/título/campos).' });

  // só admin
  let adm = null;
  try {
    const r = await fetch(SUPA + '/rest/v1/rpc/admin_login', {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_nome: nome, p_senha: senha })
    });
    const j = await r.json().catch(() => null);
    adm = r.ok ? (Array.isArray(j) ? j[0] : j) : null;
  } catch {}
  if (!adm || !adm.nome) return res.status(401).json({ error: 'E-mail ou senha de admin incorretos.' });

  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const gh = { Authorization: 'Bearer ' + GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'quests-guild' };

  // lê o arquivo atual, aplica por id (nada além das missões enviadas é tocado) e commita; 1 nova tentativa se alguém commitou no meio
  for (let t = 0; t < 2; t++) {
    const g = await fetch(url + '?ref=' + encodeURIComponent(branch), { headers: gh });
    if (!g.ok) return res.status(502).json({ error: `Não consegui ler ${path} no GitHub (HTTP ${g.status}). Confira GITHUB_REPO, GITHUB_BRANCH e MISSOES_PATH.` });
    const f = await g.json();
    let data;
    try { data = JSON.parse(Buffer.from(f.content || '', 'base64').toString('utf8')); }
    catch { return res.status(502).json({ error: `O ${path} atual no GitHub não é um JSON válido.` }); }
    const isArr = Array.isArray(data);
    const lista = isArr ? data : (Array.isArray(data?.missoes) ? data.missoes : null);
    if (!lista) return res.status(502).json({ error: `Formato inesperado no ${path} (esperava lista ou { "missoes": [...] }).` });

    for (const n of novas) {
      const i = lista.findIndex(x => String(x?.id) === n.id);
      if (i >= 0) { const base = { ...lista[i] }; CAMPOS.forEach(k => delete base[k]); lista[i] = { ...base, ...n }; }
      else lista.push(n);
    }
    let removidas = 0;
    for (const id of apagar) {
      const i = lista.findIndex(x => String(x?.id) === id);
      if (i >= 0) { lista.splice(i, 1); removidas++; }
    }
    const out = isArr ? lista : { ...data, missoes: lista };
    const p = await fetch(url, {
      method: 'PUT',
      headers: { ...gh, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Quests Guild: ${novas.length} publicada(s), ${removidas} apagada(s) por ${adm.nome}`,
        content: Buffer.from(JSON.stringify(out, null, 2) + '\n', 'utf8').toString('base64'),
        sha: f.sha, branch
      })
    });
    if ((p.status === 409 || p.status === 422) && t === 0) continue;
    if (!p.ok) { const e = await p.json().catch(() => null); return res.status(502).json({ error: 'GitHub recusou o commit: ' + (e?.message || 'HTTP ' + p.status) }); }
    return res.status(200).json({ ok: true, count: novas.length, apagadas: removidas });
  }
  return res.status(409).json({ error: 'O arquivo mudou durante a publicação. Tente de novo.' });
}
