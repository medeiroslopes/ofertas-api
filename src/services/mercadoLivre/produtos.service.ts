import {
  garantirAccessToken,
  obterDadosToken,
} from './auth.service.js';

import { mercadoLivreGet } from './client.js';

export interface ProdutoMercadoLivre {
  id: string;
  title: string;
  price: number;
  available_quantity?: number;
  permalink: string;
  thumbnail?: string;

  pictures?: {
    url: string;
    secure_url: string;
    size?: string;
    max_size?: string;
  }[];

  status?: string;
  condition?: string;
}

async function obterImagemMaiorResolucao(
  pictureId: string,
  accessToken: string
): Promise<string> {
  const resposta = await mercadoLivreGet(
    `https://api.mercadolibre.com/pictures/${pictureId}`,
    accessToken
  );

  if (!resposta.ok) {
    return "";
  }

  const dados = await resposta.json();

  const variacoes = dados.variations || [];

  if (variacoes.length === 0) {
    return "";
  }

  const maior = variacoes.reduce((melhor: any, atual: any) => {
    const areaMelhor =
      Number(melhor.width || 0) *
      Number(melhor.height || 0);

    const areaAtual =
      Number(atual.width || 0) *
      Number(atual.height || 0);

    return areaAtual > areaMelhor ? atual : melhor;
  });

  return maior.secure_url || maior.url || "";
}

export async function buscarMeusProdutosMercadoLivre(): Promise<
  ProdutoMercadoLivre[]
> {
  const accessToken = await garantirAccessToken();

  if (!accessToken) {
    throw new Error(
      'Não foi possível obter um access token válido do Mercado Livre.'
    );
  }

  const dadosToken = obterDadosToken();

  if (!dadosToken.usuarioId) {
    throw new Error(
      'Não foi possível identificar o usuário do Mercado Livre.'
    );
  }

  const url =
    `https://api.mercadolibre.com/users/${dadosToken.usuarioId}/items/search` +
    '?limit=50';

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

  const ids: string[] = dados.results || [];

  if (ids.length === 0) {
    return [];
  }

  const produtos: ProdutoMercadoLivre[] = [];

  for (const id of ids) {
    const respostaProduto = await mercadoLivreGet(
      `https://api.mercadolibre.com/items/${id}`,
      accessToken
    );

    if (!respostaProduto.ok) {
      continue;
    }

    const produto = await respostaProduto.json();

    produtos.push({
      id: produto.id,
      title: produto.title,
      price: Number(produto.price || 0),
      available_quantity: produto.available_quantity,
      permalink: produto.permalink,
      thumbnail: produto.thumbnail,

      pictures: produto.pictures || [],

      status: produto.status,
      condition: produto.condition,
    });
  }

  return produtos;
}