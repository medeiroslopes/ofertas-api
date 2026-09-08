import crypto from 'node:crypto';

import { env } from '../../config/env.js';
import {
  limparStatesAntigos,
  salvarOAuthState,
  obterOAuthState,
  removerOAuthState,
} from './oauth-state.service.js';
import {
  salvarTokenNoBanco,
} from './auth.service.js';

interface MercadoLivreOAuthTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  user_id?: number;
  refresh_token?: string;
  scope?: string;
}

export async function gerarUrlAutorizacaoMercadoLivre(): Promise<string> {
  await limparStatesAntigos();

  const state =
    crypto
      .randomBytes(32)
      .toString('hex');

  const codeVerifier =
    crypto
      .randomBytes(32)
      .toString('base64url');

  const codeChallenge =
    crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

  await salvarOAuthState(
    state,
    {
      codeVerifier,
      createdAt: Date.now(),
    }
  );

  const url =
    new URL(
      'https://auth.mercadolivre.com.br/authorization'
    );

  url.searchParams.set(
    'response_type',
    'code'
  );

  url.searchParams.set(
    'client_id',
    env.mercadoLivre.clientId
  );

  url.searchParams.set(
    'redirect_uri',
    env.mercadoLivre.redirectUri
  );

  url.searchParams.set(
    'state',
    state
  );

  url.searchParams.set(
    'code_challenge',
    codeChallenge
  );

  url.searchParams.set(
    'code_challenge_method',
    'S256'
  );

  url.searchParams.set(
    'scope',
    'offline_access read write'
  );

  return url.toString();
}

export async function processarCallbackOAuthMercadoLivre(
  code: string,
  state: string
) {
  const dadosState =
    await obterOAuthState(state);

  if (!dadosState) {
    throw new Error(
      'state inválido ou expirado.'
    );
  }

  const expirado =
    Date.now() - dadosState.createdAt >
    10 * 60 * 1000;

  if (expirado) {
    await removerOAuthState(state);

    throw new Error(
      'state expirado.'
    );
  }

  await removerOAuthState(state);

  const resposta =
    await fetch(
      `${env.mercadoLivre.apiBase}/oauth/token`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body:
          new URLSearchParams({
            grant_type:
              'authorization_code',

            client_id:
              env.mercadoLivre.clientId,

            client_secret:
              env.mercadoLivre.clientSecret,

            code,

            redirect_uri:
              env.mercadoLivre.redirectUri,

            code_verifier:
              dadosState.codeVerifier,
          }),
      }
    );

  const dados =
    await resposta.json() as
      MercadoLivreOAuthTokenResponse;

    console.log('DIAGNOSTICO OAUTH MERCADO LIVRE:', {
    accessTokenRecebido: Boolean(dados.access_token),
    refreshTokenRecebido: Boolean(dados.refresh_token),
    expiresIn: dados.expires_in,
    usuarioId: dados.user_id,
    scope: dados.scope,
    camposRecebidos: Object.keys(dados),
    });
  
    if (!resposta.ok) {
    console.error(
      'Erro trocando código OAuth:',
      resposta.status,
      dados
    );

    throw new Error(
      `Mercado Livre recusou o código OAuth. Status: ${resposta.status}`
    );
  }

  if (!dados.access_token) {
    throw new Error(
      'Mercado Livre não retornou access token.'
    );
  }

  const expiresAt =
    dados.expires_in
      ? Date.now() +
        Number(dados.expires_in) *
          1000
      : null;

  const salvo =
    await salvarTokenNoBanco(
      dados.access_token,
      dados.refresh_token || null,
      expiresAt,
      dados.user_id
        ? Number(dados.user_id)
        : null,
      dados.scope || null
    );

  return {
    accessToken: dados.access_token,
    refreshToken:
      dados.refresh_token || null,
    expiresAt,
    usuarioId:
      dados.user_id
        ? Number(dados.user_id)
        : null,
    scope:
      dados.scope || null,
    tokenSalvo: salvo,
  };
}
