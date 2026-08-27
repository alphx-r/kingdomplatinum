// /api/commit-items.js
// Rota serverless (Vercel) chamada pelo botão "Commitar items.json" do
// itemdex_adm.html. Recebe { items: [...] } no corpo, e commita esse
// conteúdo como items.json na raiz do repo alphx-r/kingdomplatinum via
// GitHub Contents API.
//
// O GITHUB_TOKEN vive só aqui, como env var da Vercel — nunca chega no
// navegador. Precisa ter escopo de escrita em "contents" nesse repo
// (um PAT clássico com escopo "repo", ou um fine-grained token
// restrito a alphx-r/kingdomplatinum com permissão Contents: Read/Write).

const OWNER = 'alphx-r';
const REPO = 'kingdomplatinum';
const FILE_PATH = 'items.json';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'GITHUB_TOKEN não configurado nas env vars da Vercel.' });
  }

  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Payload inválido: esperado { items: [...] }.' });
  }

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    // 1) Pega o sha do items.json atual (necessário pro GitHub aceitar o
    //    update; se o arquivo ainda não existir, segue sem sha = cria novo).
    let sha;
    const getRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
      { headers: ghHeaders }
    );
    if (getRes.ok) {
      const getData = await getRes.json();
      sha = getData.sha;
    } else if (getRes.status !== 404) {
      const errText = await getRes.text();
      return res.status(getRes.status).json({ error: `Erro ao ler items.json atual: ${errText}` });
    }

    // 2) Commita o novo conteúdo (branch padrão do repo, sem forçar nome).
    const content = Buffer.from(JSON.stringify(items, null, 2)).toString('base64');
    const putRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `chore: atualiza items.json (${items.length} itens) via itemdex_adm`,
          content,
          sha, // omitido (undefined) se o arquivo não existia ainda
        }),
      }
    );

    if (!putRes.ok) {
      const errText = await putRes.text();
      return res.status(putRes.status).json({ error: `Erro ao commitar: ${errText}` });
    }

    const putData = await putRes.json();
    return res.status(200).json({
      ok: true,
      commitSha: putData.commit?.sha,
      htmlUrl: putData.content?.html_url,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
