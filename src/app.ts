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