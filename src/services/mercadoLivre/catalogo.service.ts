import { garantirAccessToken } from './auth.service.js';
import { mercadoLivreGet } from './client.js';

export async function buscarProdutosMercadoLivre(
  consulta: string
) {
  const accessToken = await garantirAccessToken();

  if (!accessToken) {
    throw new Error(
      'Não foi possível obter um access token válido do Mercado Livre.'
    );
  }

  const url =
    'https://api.mercadolibre.com/sites/MLB/search' +
    `?q=${encodeURIComponent(consulta)}` +
    '&limit=20';

  const resposta = await mercadoLivreGet(
    url,
    accessToken
  );

  const dados = await resposta.json();

  if (!resposta.ok) {
    throw new Error(
      `Mercado Livre retornou HTTP ${resposta.status}: ${JSON.stringify(dados)}`
    );
  }

  return dados;
}