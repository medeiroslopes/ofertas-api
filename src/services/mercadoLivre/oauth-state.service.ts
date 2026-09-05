import type { OAuthState } from '../../types/oauth.types.js';
import { supabase } from '../../config/supabase.js';

const OAUTH_STATE_EXPIRACAO_MS = 10 * 60 * 1000;

export async function salvarOAuthState(
  state: string,
  dados: OAuthState
): Promise<void> {
  const { error } = await supabase
    .from('mercado_livre_oauth_states')
    .insert({
      state,
      code_verifier: dados.codeVerifier,
      created_at: dados.createdAt,
    });

  if (error) {
    throw new Error(
      `Erro salvando OAuth state: ${error.message}`
    );
  }
}

export async function obterOAuthState(
  state: string
): Promise<OAuthState | undefined> {
  const { data, error } = await supabase
    .from('mercado_livre_oauth_states')
    .select('code_verifier, created_at')
    .eq('state', state)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro buscando OAuth state: ${error.message}`
    );
  }

  if (!data) {
    return undefined;
  }

  return {
    codeVerifier: data.code_verifier,
    createdAt: Number(data.created_at),
  };
}

export async function removerOAuthState(
  state: string
): Promise<void> {
  const { error } = await supabase
    .from('mercado_livre_oauth_states')
    .delete()
    .eq('state', state);

  if (error) {
    throw new Error(
      `Erro removendo OAuth state: ${error.message}`
    );
  }
}

export async function limparStatesAntigos(): Promise<void> {
  const limite = Date.now() - OAUTH_STATE_EXPIRACAO_MS;

  const { error } = await supabase
    .from('mercado_livre_oauth_states')
    .delete()
    .lt('created_at', limite);

  if (error) {
    throw new Error(
      `Erro limpando OAuth states antigos: ${error.message}`
    );
  }
}