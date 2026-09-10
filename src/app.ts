import express from 'express';

import {
  obterDadosToken,
  garantirAccessToken,
} from './services/mercadoLivre/auth.service.js';
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
    const resposta = await fetch('https://api.ipify.org?format=json');

    const dados = await resposta.json();

    return res.status(200).json({
      sucesso: true,
      ipRender: dados.ip,
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error?.message || 'Erro ao descobrir IP do Render.',
    });
  }
});


app.get('/api/mercadolivre/teste-usuario', async (_req, res) => {
  try {
    const token = obterDadosToken();

    if (!token.access_token) {
      return res.status(401).json({
        sucesso: false,
        erro: 'Access token não disponível.',
      });
    }

    const resposta = await fetch(
      'https://api.mercadolibre.com/users/me',
      {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: 'application/json',
        },
      }
    );

    const dados = await resposta.json();

    return res.status(resposta.status).json({
      sucesso: resposta.ok,
      statusMercadoLivre: resposta.status,
      usuarioId: dados.id || null,
      nickname: dados.nickname || null,
      erro: dados.error || null,
      mensagem: dados.message || null,
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error?.message || 'Erro ao consultar usuário do Mercado Livre.',
    });
  }
});

app.get('/api/mercadolivre/teste-banco', async (_req, res) => {
  try {
    const token = obterDadosToken();

    return res.json({
      sucesso: true,
      memoria: {
        usuarioId: token.usuarioId,
        accessTokenConfigurado: token.accessTokenConfigurado,
        tokenValido: token.tokenValido,
        tokenScope: token.tokenScope,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error?.message || 'Erro ao verificar token.',
    });
  }
});


app.get('/api/mercadolivre/produtos', async (req, res) => {
  try {
    const consulta = String(req.query.q || '').trim();

    if (!consulta) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe uma busca. Exemplo: ?q=celular',
      });
    }

    const resposta = await fetch(
      `https://api.mercadolibre.com/products/search?status=active&site_id=MLB&q=${encodeURIComponent(consulta)}`,
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
      erro: error?.message || 'Erro ao buscar produtos no Mercado Livre.',
    });
  }
});
