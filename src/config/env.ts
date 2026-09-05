
import 'dotenv/config';

function obterObrigatoria(nome: string): string {
  const valor = process.env[nome];

  if (!valor) {
    throw new Error(
      `Variável de ambiente obrigatória não configurada: ${nome}`
    );
  }

  return valor;
}

export const env = {
  port: Number(process.env.PORT || 3000),

  mercadoLivre: {
    apiBase: process.env.ML_API_BASE || 'https://api.mercadolibre.com',
    siteId: process.env.ML_SITE_ID || 'MLB',

    clientId: obterObrigatoria('ML_CLIENT_ID'),
    clientSecret: obterObrigatoria('ML_CLIENT_SECRET'),
    redirectUri: obterObrigatoria('ML_REDIRECT_URI'),
  },

  supabase: {
    url: obterObrigatoria('SUPABASE_URL'),
    serviceRoleKey: obterObrigatoria('SUPABASE_SERVICE_ROLE_KEY'),
  },
};
