const ALLOWED_ENDPOINTS = new Set([
  'sessoes',
  'fichas',
  'honey',
  'shiny-charm',
  'bonus',
]);

export default async function handler(req, res) {
  const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
  if (!ALLOWED_ENDPOINTS.has(rawPath)) {
    return res.status(404).json({ message: 'Endpoint de integração não encontrado.' });
  }

  const allowedMethods = rawPath === 'fichas' ? ['GET'] : ['POST'];
  if (!allowedMethods.includes(req.method)) {
    res.setHeader('Allow', allowedMethods.join(', '));
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (req.headers.authorization) {
    headers.Authorization = req.headers.authorization;
  }

  try {
    const upstream = await fetch(
      `https://kpfichas.vercel.app/api/integracoes/rolagens/${rawPath}`,
      {
        method: req.method,
        headers,
        body: req.method === 'GET' ? undefined : JSON.stringify(req.body || {}),
      },
    );
    const responseBody = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(responseBody);
  } catch (error) {
    console.error('[fichario-proxy]', error);
    return res.status(502).json({ message: 'Não foi possível acessar o Fichário agora.' });
  }
}
