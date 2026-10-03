// /api/commit-rewards — commita itemdex/rewards.json no GitHub.
// O token fica só na Vercel (env GITHUB_TOKEN). Só escreve esse arquivo, e só
// para um admin que ainda exista no banco (mesma checagem admin_list do painel).
const REPO = 'alphx-r/kingdomplatinum';
const BRANCH = 'main';
const PATH = 'itemdex/rewards.json';
const AUTH_URL = process.env.AUTH_SUPA_URL || 'https://ucbkodkjlbatttiuqjtv.supabase.co';
const AUTH_KEY = process.env.AUTH_SUPA_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjYmtvZGtqbGJhdHR0aXVxanR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NjExODcsImV4cCI6MjA5MzMzNzE4N30.a65MSk7m4DvgTw2pHXhaqMOOEpjTB_wPsXJUfvOGiG4';
const CATS = ['badges', 'ribbons', 'pins', 'randoms'];

async function adminOk(email) {
  if (!email || typeof email !== 'string') return false;
  const r = await fetch(`${AUTH_URL}/rest/v1/rpc/admin_list`, {
    method: 'POST',
    headers: { apikey: AUTH_KEY, Authorization: 'Bearer ' + AUTH_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) return false;
  const lista = await r.json().catch(() => []);
  return Array.isArray(lista) && lista.some(a => a && a.nome === email);
}

function limpa(rewards) {
  if (!rewards || typeof rewards !== 'object') return null;
  const out = {};
  for (const c of CATS) {
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

function formata(r) {
  return '{\n' + CATS.map(c => `  "${c}": [` + (r[c].length ? '\n' + r[c].map(x => '    ' + JSON.stringify(x)).join(',\n') + '\n  ' : '') + ']').join(',\n') + '\n}\n';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN não configurado na Vercel' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  try {
    if (!(await adminOk(body?.admin))) return res.status(401).json({ error: 'Sessão de administrador inválida. Faça login de novo no index.html.' });
    const rewards = limpa(body?.rewards);
    if (!rewards) return res.status(400).json({ error: 'Conteúdo do rewards.json inválido' });

    const url = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
    const gh = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'kingdomplatinum-itemdex' };
    const cur = await fetch(`${url}?ref=${BRANCH}`, { headers: gh });
    let sha, antigo = null;
    if (cur.ok) {
      const j = await cur.json();
      sha = j.sha;
      antigo = Buffer.from(j.content || '', 'base64').toString('utf8');
    } else if (cur.status !== 404) {
      return res.status(502).json({ error: `GitHub respondeu HTTP ${cur.status} ao ler ${PATH}` });
    }

    const texto = formata(rewards);
    if (antigo === texto) return res.status(200).json({ ok: true, unchanged: true });

    const put = await fetch(url, {
      method: 'PUT',
      headers: { ...gh, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Atualiza itemdex/rewards.json (ItemDex ADM)',
        content: Buffer.from(texto, 'utf8').toString('base64'),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });
    const out = await put.json().catch(() => ({}));
    if (!put.ok) return res.status(502).json({ error: out.message || `GitHub respondeu HTTP ${put.status} ao commitar` });
    return res.status(200).json({ ok: true, sha: out.content?.sha || null });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Erro inesperado' });
  }
};
