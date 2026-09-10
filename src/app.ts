import express from 'express';

import { obterDadosToken } from './services/mercadoLivre/auth.service.js';
import {
  iniciarOAuthMercadoLivre,
  callbackOAuthMercadoLivre,
} from './controllers/mercadoLivre.controller.js';

export const app = express();

app.use(express.json());

app.get(
  '/auth/mercadolivre',
  iniciarOAuthMercadoLivre
);

app.get(
  '/auth/mercadolivre/callback',
  callbackOAuthMercadoLivre
);

app.get('/', (_req, res) => {
  res.json({
    nome: 'Ofertas API',
    status: 'online',
    mensagem: 'API do Ofertas App funcionando.',
    versao: 'busca-catalogo-3.0',
  });
});

app.get('/api/mercadolivre/status', (_req, res) => {
  res.json({
    sucesso: true,
    ...obterDadosToken(),
  });
});


app.get('/api/mercadolivre/teste-rede', async (_req, res) => {
  try {
    const resposta = await fetch(
      'https://api.mercadolibre.com/sites/MLB'
    );

    const dados = await resposta.json();

    return res.status(resposta.status).json({
      sucesso: resposta.ok,
      statusMercadoLivre: resposta.status,
      dados,
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error?.message || 'Erro ao acessar Mercado Livre.',
    });
  }
});
