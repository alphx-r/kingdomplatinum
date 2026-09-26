// /api/commit-moves.js
// Rota serverless (Vercel) chamada pelo botão "Commitar moves.json" do
// movedex_adm.html. Recebe { moves: [...] } no corpo, e commita esse
// conteúdo como movedex/moves.json no repo alphx-r/kingdomplatinum via
// GitHub Contents API.
//
// Mesmo padrão de /api/commit-items.js: o GITHUB_TOKEN vive só aqui, como
// env var da Vercel — nunca chega no navegador.

const OWNER = 'alphx-r';
const REPO = 'kingdomplatinum';
const FILE_PATH = 'movedex/moves.json';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'GITHUB_TOKEN não configurado nas env vars da Vercel.' });
  }

  const { moves } = req.body || {};
  if (!Array.isArray(moves)) {
    return res.status(400).json({ error: 'Payload inválido: esperado { moves: [...] }.' });
  }

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    // 1) Pega o sha do moves.json atual (necessário pro GitHub aceitar o
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
      return res.status(getRes.status).json({ error: `Erro ao ler moves.json atual: ${errText}` });
    }

    // 2) Commita o novo conteúdo (branch padrão do repo, sem forçar nome).
    const content = Buffer.from(JSON.stringify(moves, null, 2)).toString('base64');
    const putRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `chore: atualiza moves.json (${moves.length} moves) via movedex_adm`,
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
