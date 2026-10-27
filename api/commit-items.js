const OWNER = 'alphx-r', REPO = 'kingdomplatinum', BRANCH = 'main';
const FILE_PATH = 'itemdex/items.json';
const AUTH_SUPA_URL = process.env.AUTH_SUPA_URL || 'https://ucbkodkjlbatttiuqjtv.supabase.co';
const AUTH_SUPA_KEY = process.env.AUTH_SUPA_KEY || '<a mesma chave anon que está no commit-image.js>';
const PATH_RE = /^sprites\/(items(\/[\p{L}\p{N}][\p{L}\p{N}._ -]*)?|rewards\/(badges|ribbons|pins|randoms))\/[a-z0-9][a-z0-9._-]*\.(png|webp|gif|jpg|jpeg)$/u;

async function adminValido(nome) {
  if (!nome) return false;
  try {
    const r = await fetch(`${AUTH_SUPA_URL}/rest/v1/rpc/admin_list`, {
      method: 'POST',
      headers: { apikey: AUTH_SUPA_KEY, Authorization: 'Bearer ' + AUTH_SUPA_KEY, 'Content-Type': 'application/json' },
      body: '{}',
    });
    return r.ok && ((await r.json()) || []).some(a => a.nome === nome);
  } catch (e) { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Método não permitido.' }); }
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN não configurado.' });

  const { items, images = [], admin } = req.body || {};
  if (!Array.isArray(items) || !Array.isArray(images)) return res.status(400).json({ error: 'Payload inválido.' });
  if (!(await adminValido(admin))) return res.status(401).json({ error: 'Sessão de admin inválida. Faça login de novo.' });
  for (const im of images) {
    if (!im?.path || !PATH_RE.test(im.path) || im.path.includes('..')) return res.status(400).json({ error: `Caminho não permitido: ${im?.path}` });
    if (!/^[A-Za-z0-9+/=]+$/.test(im.contentBase64 || '') || im.contentBase64.length > 2_000_000) return res.status(400).json({ error: `Imagem inválida ou grande demais: ${im.path}` });
  }

  const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'kingdomplatinum-itemdex-adm' };
  const gh = async (path, method = 'GET', body) => {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || `GitHub HTTP ${r.status}`);
    return d;
  };

  try {
    const headSha = (await gh(`git/ref/heads/${BRANCH}`)).object.sha;
    const baseTree = (await gh(`git/commits/${headSha}`)).tree.sha;

    const entries = [];
    for (const im of images) {
      const b = await gh('git/blobs', 'POST', { content: im.contentBase64, encoding: 'base64' });
      entries.push({ path: im.path, mode: '100644', type: 'blob', sha: b.sha });
    }
    const jb = await gh('git/blobs', 'POST', { content: JSON.stringify(items, null, 2), encoding: 'utf-8' });
    entries.push({ path: FILE_PATH, mode: '100644', type: 'blob', sha: jb.sha });

    const tree = await gh('git/trees', 'POST', { base_tree: baseTree, tree: entries });
    if (tree.sha === baseTree) return res.status(200).json({ ok: true, unchanged: true });

    const commit = await gh('git/commits', 'POST', {
      message: `chore: atualiza ${FILE_PATH} (${items.length} itens, ${images.length} imagens) via itemdex_adm`,
      tree: tree.sha, parents: [headSha],
    });
    await gh(`git/refs/heads/${BRANCH}`, 'PATCH', { sha: commit.sha });
    return res.status(200).json({ ok: true, commitSha: commit.sha });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
