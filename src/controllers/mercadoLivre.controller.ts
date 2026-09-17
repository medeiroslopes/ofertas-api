import type { Request, Response } from 'express';

import {
  gerarUrlAutorizacaoMercadoLivre,
  processarCallbackOAuthMercadoLivre,
} from '../services/mercadoLivre/oauth.service.js';

export async function iniciarOAuthMercadoLivre(
  _req: Request,
  res: Response
) {
  try {
    const url =
      await gerarUrlAutorizacaoMercadoLivre();

    return res.redirect(url);
  } catch (erro) {
    console.error(
      'Erro iniciando OAuth Mercado Livre:',
      erro
    );

    return res.status(500).json({
      sucesso: false,
      erro:
        'Não foi possível iniciar a autorização do Mercado Livre.',
    });
  }
}

export async function callbackOAuthMercadoLivre(
  req: Request,
  res: Response
) {
  try {
    const {
      code,
      state,
      error,
      error_description,
    } = req.query;

    if (error) {
      return res.status(400).json({
        sucesso: false,
        erro: String(error),
        descricao:
          error_description
            ? String(error_description)
            : undefined,
      });
    }

    if (
      typeof code !== 'string' ||
      typeof state !== 'string'
    ) {
      return res.status(400).json({
        sucesso: false,
        erro:
          'code ou state não recebido.',
      });
    }

    const resultado =
      await processarCallbackOAuthMercadoLivre(
        code,
        state
      );

    return res.json({
      sucesso: true,
      mensagem:
        'Autorização do Mercado Livre concluída com sucesso.',
      token_recebido:
        Boolean(resultado.accessToken),
      token_salvo:
        resultado.tokenSalvo,
      usuario_id:
        resultado.usuarioId,
      scope:
        resultado.scope,
      expira_em:
        resultado.expiresAt,
    });
  } catch (erro) {
    console.error(
      'Erro no callback OAuth Mercado Livre:',
      erro
    );

    return res.status(400).json({
      sucesso: false,
      erro:
        erro instanceof Error
          ? erro.message
          : 'Erro processando callback do Mercado Livre.',
    });
  }
}