import { env } from '../../config/env.js';
import { supabase } from '../../config/supabase.js';

interface MercadoLivreTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  user_id?: number;
  refresh_token?: string;
  scope?: string;
}

let ML_ACCESS_TOKEN: string | null = null;

let ML_REFRESH_TOKEN: string | null =
  process.env.ML_REFRESH_TOKEN?.trim() || null;

let ML_TOKEN_EXPIRES_AT: number | null = null;

let ML_USER_ID: number | null = null;

let ML_TOKEN_SCOPE: string | null = null;

export function invalidarAccessToken(): void {
  ML_ACCESS_TOKEN = null;
  ML_TOKEN_EXPIRES_AT = null;
  ML_TOKEN_SCOPE = null;
}

export function tokenAindaValido(): boolean {
  return Boolean(
    ML_ACCESS_TOKEN &&
      ML_TOKEN_EXPIRES_AT &&
      Date.now() < ML_TOKEN_EXPIRES_AT - 60_000
  );
}

export async function salvarTokenNoBanco(
  accessToken: string | null,
  refreshToken: string | null,
  expiresAt: number | null,
  usuarioId: number | null,
  scope: string | null
): Promise<boolean> {
  if (!supabase) {
    console.error('Supabase não configurado.');
    return false;
  }

  if (!accessToken) {
    console.error('Access token ausente.');
    return false;
  }

  if (!refreshToken) {
    console.error('Refresh token ausente.');
    return false;
  }

  try {
    const {
      data: existente,
      error: erroBusca,
    } = await supabase
      .from('mercado_livre_tokens')
      .select('id')
      .order('id', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (erroBusca) {
      console.error('Erro buscando token:', erroBusca);
      return false;
    }

    const dados = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      usuario_id:
        usuarioId ??
        ML_USER_ID ??
        null,
      scope:
        scope ??
        ML_TOKEN_SCOPE ??
        null,
      atualizado_em:
        new Date().toISOString(),
    };

    if (existente?.id) {
      const { error } =
        await supabase
          .from('mercado_livre_tokens')
          .update(dados)
          .eq('id', existente.id);

      if (error) {
        console.error('Erro atualizando token:', error);

        const dadosSemScope = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          usuario_id:
            usuarioId ??
            ML_USER_ID ??
            null,
          atualizado_em:
            new Date().toISOString(),
        };

        const tentativa =
          await supabase
            .from('mercado_livre_tokens')
            .update(dadosSemScope)
            .eq('id', existente.id);

        if (tentativa.error) {
          console.error(
            'Erro atualizando token sem scope:',
            tentativa.error
          );
          return false;
        }
      }

      return true;
    }

    const { error } =
      await supabase
        .from('mercado_livre_tokens')
        .insert(dados);

    if (error) {
      console.error('Erro inserindo token:', error);

      const dadosSemScope = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        usuario_id:
          ML_USER_ID ??
          null,
        atualizado_em:
          new Date().toISOString(),
      };

      const tentativa =
        await supabase
          .from('mercado_livre_tokens')
          .insert(dadosSemScope);

      if (tentativa.error) {
        console.error(
          'Erro inserindo token sem scope:',
          tentativa.error
        );
        return false;
      }
    }

    return true;
  } catch (erro) {
    console.error('Erro Supabase:', erro);
    return false;
  }
}

export async function carregarTokenDoBanco(): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  try {
    let resultado =
      await supabase
        .from('mercado_livre_tokens')
        .select(
          'id, access_token, refresh_token, expires_at, usuario_id, scope'
        )
        .order('id', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

    if (resultado.error) {
      resultado =
        await supabase
          .from('mercado_livre_tokens')
          .select(
            'id, access_token, refresh_token, expires_at, usuario_id'
          )
          .order('id', {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();
    }

    const {
      data,
      error,
    } = resultado;

    if (error) {
      console.error('Erro carregando token:', error);
      return false;
    }

    if (!data) {
      return false;
    }

    ML_ACCESS_TOKEN =
      data.access_token || null;

    ML_REFRESH_TOKEN =
      data.refresh_token || null;

    ML_TOKEN_EXPIRES_AT =
      data.expires_at
        ? Number(data.expires_at)
        : null;

    ML_USER_ID =
      data.usuario_id
        ? Number(data.usuario_id)
        : null;

    ML_TOKEN_SCOPE =
      (data as any).scope ||
      null;

    return Boolean(
      ML_ACCESS_TOKEN ||
        ML_REFRESH_TOKEN
    );
  } catch (erro) {
    console.error('Erro lendo Supabase:', erro);
    return false;
  }
}

async function renovarAccessToken(): Promise<string | null> {
  if (
    !ML_REFRESH_TOKEN ||
    !env.mercadoLivre.clientId ||
    !env.mercadoLivre.clientSecret
  ) {
    console.error('Credenciais ou refresh token ausentes.');
    return null;
  }

  try {
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
                'refresh_token',
              client_id:
                env.mercadoLivre.clientId,
              client_secret:
                env.mercadoLivre.clientSecret,
              refresh_token:
                ML_REFRESH_TOKEN,
            }),
        }
      );

    const dados =
      await resposta.json() as
        MercadoLivreTokenResponse;

    if (!resposta.ok) {
      console.error(
        'Falha renovando token:',
        resposta.status,
        dados
      );
      return null;
    }

    if (!dados.access_token) {
      return null;
    }

    ML_ACCESS_TOKEN =
      dados.access_token;

    if (dados.refresh_token) {
      ML_REFRESH_TOKEN =
        dados.refresh_token;
    }

    ML_TOKEN_EXPIRES_AT =
      dados.expires_in
        ? Date.now() +
          Number(dados.expires_in) *
            1000
        : null;

    if (dados.user_id) {
      ML_USER_ID =
        Number(dados.user_id);
    }

    ML_TOKEN_SCOPE =
      dados.scope ||
      ML_TOKEN_SCOPE ||
      null;

    const salvo =
      await salvarTokenNoBanco(
        ML_ACCESS_TOKEN,
        ML_REFRESH_TOKEN,
        ML_TOKEN_EXPIRES_AT,
        ML_USER_ID,
        ML_TOKEN_SCOPE
      );

    if (!salvo) {
      console.error(
        'Token renovado, mas não salvo no Supabase.'
      );
    }

    return ML_ACCESS_TOKEN;
  } catch (erro) {
    console.error(
      'Erro renovando access token:',
      erro
    );
    return null;
  }
}

export async function garantirAccessToken(): Promise<string | null> {
  if (tokenAindaValido()) {
    return ML_ACCESS_TOKEN;
  }

  if (
    !ML_ACCESS_TOKEN &&
    !ML_REFRESH_TOKEN
  ) {
    await carregarTokenDoBanco();
  }

  if (tokenAindaValido()) {
    return ML_ACCESS_TOKEN;
  }

  if (ML_REFRESH_TOKEN) {
    return renovarAccessToken();
  }

  await carregarTokenDoBanco();

  if (tokenAindaValido()) {
    return ML_ACCESS_TOKEN;
  }

  return null;
}

export function obterDadosToken() {
  return {
    usuarioId: ML_USER_ID,
    accessTokenConfigurado:
      Boolean(
        ML_ACCESS_TOKEN ||
          ML_REFRESH_TOKEN
      ),
    tokenValido:
      tokenAindaValido(),
    tokenScope:
      ML_TOKEN_SCOPE,
  };
}