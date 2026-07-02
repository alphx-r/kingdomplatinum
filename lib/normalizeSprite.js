const sharp = require('sharp');

const CANVAS = 475;
const FILL_RATIO = 0.80;

// Baixa uma imagem e devolve o Buffer.
async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} baixando ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Recorta o "respiro" transparente/preto ao redor do sprite e recentraliza
// tudo num canvas fixo, com o conteúdo sempre ocupando a mesma proporção.
// Mesma lógica validada no script local (batch_normalize.mjs).
async function normalizeBuffer(inputBuffer, opts = {}) {
  const canvas = opts.canvas || CANVAS;
  const fillRatio = opts.fillRatio || FILL_RATIO;

  const trimmed = await sharp(inputBuffer)
    .trim({ threshold: 12 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = trimmed;
  const { width: tw, height: th } = info;

  const scale = (canvas * fillRatio) / Math.max(tw, th);
  const newW = Math.max(1, Math.round(tw * scale));
  const newH = Math.max(1, Math.round(th * scale));

  const resized = await sharp(data, { raw: { width: tw, height: th, channels: info.channels } })
    .resize(newW, newH)
    .png()
    .toBuffer();

  const left = Math.round((canvas - newW) / 2);
  const top = Math.round((canvas - newH) / 2);

  const out = await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();

  return out;
}

// Sobe um Buffer PNG pro Supabase Storage (upsert = sobrescreve se já existir).
async function uploadToSupabase(buffer, { bucket, path, supabaseUrl, supabaseKey }) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true'
    },
    body: buffer
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Falha no upload pro Storage: ${res.status} — ${err}`);
  }
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

module.exports = { fetchBuffer, normalizeBuffer, uploadToSupabase };
