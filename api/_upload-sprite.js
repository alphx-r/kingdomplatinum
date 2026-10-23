// /api/_upload-sprite.js  (prefixo "_" → NÃO vira rota/função na Vercel)
//
// Chamado de dentro do /api/admin/backup-pokemon-now.js quando o POST vem como JSON.
//
// Upload de sprites (PNG/JPG/WEBP) do nationaldex_adm.html para o GitHub.
// O token (GH_SPRITE_TOKEN) fica só aqui no servidor; o navegador manda a imagem em base64.
//
// POST  (Content-Type: application/json) { files: [{ path: "sprites/pokemon/[#001] - Slug.png", base64: "..." }], message?: "..." }
//   → UM commit com todos os arquivos enviados.
//
// Variáveis de ambiente: GH_REPO, GH_BRANCH (já usadas pelo _gh.js),
//   GH_SPRITE_TOKEN  (PAT fine-grained só deste repo, Contents: Read and write)
//   ADMIN_UPLOAD_KEY (senha longa e aleatória; o adm manda no header x-admin-key)

import { timingSafeEqual } from 'node:crypto';
import { commit } from './_gh.js';

const MAX_FILES = 10;
const MAX_FILE_BYTES = 3 * 1024 * 1024;           // 3 MB por imagem (limite da Vercel ~4,5 MB por requisição)
const PATH_OK = /^sprites\/pokemon\/(shiny\/)?[^/\\]+\.(png|jpe?g|webp)$/i;

function autorizado(req) {
  const esperado = process.env.ADMIN_UPLOAD_KEY || '';
  const recebido = String(req.headers['x-admin-key'] || '');
  if (!esperado) return null;                     // não configurada → bloqueia tudo (fail closed)
  const a = Buffer.from(recebido), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// confere se os bytes são mesmo uma imagem (PNG, JPEG ou WEBP)
function ehImagem(buf) {
  if (buf.length < 12) return false;
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const webp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return png || jpg || webp;
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  if (Buffer.isBuffer(req.body)) chunks.push(req.body);
  else for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function handleUploadSprite(req, res) {
  const auth = autorizado(req);
  if (auth === null) return res.status(500).json({ error: 'Servidor sem ADMIN_UPLOAD_KEY configurada.' });
  if (!auth) return res.status(401).json({ error: 'Chave de admin inválida.' });

  const token = process.env.GH_SPRITE_TOKEN;
  if (!token) return res.status(500).json({ error: 'Servidor sem GH_SPRITE_TOKEN configurado.' });

  try {
    let body;
    try { body = await lerCorpo(req); } catch { return res.status(400).json({ error: 'JSON inválido.' }); }
    const files = body && body.files;
    if (!Array.isArray(files) || !files.length) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    if (files.length > MAX_FILES) return res.status(400).json({ error: `Máximo de ${MAX_FILES} arquivos por envio.` });

    const changes = [];
    for (const f of files) {
      const path = String((f && f.path) || '');
      if (!PATH_OK.test(path) || path.includes('..')) {
        return res.status(400).json({ error: 'Caminho não permitido: ' + path });
      }
      const buf = Buffer.from(String((f && f.base64) || ''), 'base64');
      if (!buf.length || buf.length > MAX_FILE_BYTES) {
        return res.status(400).json({ error: 'Arquivo vazio ou maior que 3 MB: ' + path });
      }
      if (!ehImagem(buf)) return res.status(400).json({ error: 'Não parece uma imagem PNG/JPG/WEBP: ' + path });
      changes.push({ path, content: buf });
    }

    const nomes = changes.map(c => c.path.split('/').pop());
    const msg = String(body.message || '').slice(0, 150)
      || `Sprite${nomes.length > 1 ? 's' : ''}: ${nomes.slice(0, 3).join(', ')}${nomes.length > 3 ? '…' : ''} (adm)`;
    // [skip ci]: as imagens são servidas pelo raw.githubusercontent.com, não precisa de novo deploy na Vercel
    const sha = await commit(async () => changes, msg + ' [skip ci]', { token });
    return res.status(200).json({ ok: true, commit: sha, total: changes.length });
  } catch (e) {
    console.error('upload-sprite falhou:', e);
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
}
