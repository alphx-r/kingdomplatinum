// Helper do GitHub (arquivos que começam com "_" não viram rota na Vercel)
const REPO = process.env.GH_REPO;               // ex.: "kingdomplatinum/fichas"
const BRANCH = process.env.GH_BRANCH || 'main';
const TOKEN = process.env.GH_TOKEN;             // PAT fine-grained: Contents = Read and write

const need = () => { if (!REPO || !TOKEN) throw new Error('Servidor sem GH_REPO/GH_TOKEN configurados.'); };

async function gh(path, opts = {}) {
  need();
  const r = await fetch('https://api.github.com/repos/' + REPO + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'fichas-kp',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
  return r;
}
const enc = p => p.split('/').map(encodeURIComponent).join('/');

// Lê um arquivo de texto (null se não existir). ref = branch ou sha de commit.
async function readFile(path, ref = BRANCH) {
  const r = await gh('/contents/' + enc(path) + '?ref=' + encodeURIComponent(ref), {
    headers: { Accept: 'application/vnd.github.raw+json' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub (ler) HTTP ' + r.status);
  return await r.text();
}
// Lista arquivos de uma pasta ([] se não existir)
async function listDir(path, ref = BRANCH) {
  const r = await gh('/contents/' + enc(path) + '?ref=' + encodeURIComponent(ref));
  if (r.status === 404) return [];
  if (!r.ok) throw new Error('GitHub (listar) HTTP ' + r.status);
  const j = await r.json();
  return Array.isArray(j) ? j.filter(x => x.type === 'file') : [];
}

// Faz UM commit com várias mudanças. build(parentSha) devolve [{path, content}] (content=null apaga).
// Refaz tudo se alguém commitou ao mesmo tempo (conflito).
async function commit(build, message) {
  const blobCache = new Map();
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    let r = await gh('/git/ref/heads/' + encodeURIComponent(BRANCH));
    if (!r.ok) throw new Error('GitHub (ref) HTTP ' + r.status);
    const parent = (await r.json()).object.sha;
    r = await gh('/git/commits/' + parent);
    if (!r.ok) throw new Error('GitHub (commit) HTTP ' + r.status);
    const baseTree = (await r.json()).tree.sha;

    const changes = await build(parent);
    if (!changes.length) return null;

    const tree = [];
    for (const c of changes) {
      if (c.content == null) { tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null }); continue; }
      const buf = Buffer.isBuffer(c.content) ? c.content : Buffer.from(String(c.content), 'utf8');
      const key = c.path + ':' + buf.length + ':' + buf.toString('base64').slice(0, 64);
      let sha = blobCache.get(key);
      if (!sha) {
        const b = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }) });
        if (!b.ok) throw new Error('GitHub (blob) HTTP ' + b.status);
        sha = (await b.json()).sha; blobCache.set(key, sha);
      }
      tree.push({ path: c.path, mode: '100644', type: 'blob', sha });
    }
    r = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) });
    if (!r.ok) throw new Error('GitHub (tree) HTTP ' + r.status);
    const newTree = (await r.json()).sha;
    r = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: newTree, parents: [parent] }) });
    if (!r.ok) throw new Error('GitHub (novo commit) HTTP ' + r.status);
    const sha = (await r.json()).sha;
    r = await gh('/git/refs/heads/' + encodeURIComponent(BRANCH), { method: 'PATCH', body: JSON.stringify({ sha, force: false }) });
    if (r.ok) return sha;
    if (r.status !== 422 && r.status !== 409) throw new Error('GitHub (atualizar ref) HTTP ' + r.status);
    // conflito: outro commit entrou no meio; tenta de novo
  }
  throw new Error('Muitos salvamentos ao mesmo tempo. Tente de novo.');
}

module.exports = { REPO, BRANCH, readFile, listDir, commit };
