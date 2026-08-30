import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;

const ML_REDIRECT_URI =
  process.env.ML_REDIRECT_URI ||
  'https://ofertas-api-hzi5.onrender.com/auth/mercadolivre/callback';
   
let ML_ACCESS_TOKEN: string | null = null;
let ML_REFRESH_TOKEN: string | null = null;
let ML_TOKEN_EXPIRES_AT: number | null = null;

// Armazena temporariamente state e PKCE verifier.
// Para nosso primeiro teste, isso é suficiente.
// Em produção, vamos substituir por armazenamento persistente/seguro.
const oauthStates = new Map<
  string,
  {
    codeVerifier: string;
    createdAt: number;
  }
>();

app.get('/', (_req, res) => {
  res.json({
    nome: 'Ofertas API',
    status: 'online',
    mensagem: 'API do Ofertas App funcionando.',
  });
});

app.get('/api/teste', (_req, res) => {
  res.json({
    sucesso: true,
    mensagem: 'Backend funcionando corretamente.',
  });
});


async function garantirAccessToken(): Promise<string | null> {
  if (
    ML_ACCESS_TOKEN &&
    ML_TOKEN_EXPIRES_AT &&
    Date.now() < ML_TOKEN_EXPIRES_AT - 60_000
  ) {
    return ML_ACCESS_TOKEN;
  }

  if (!ML_REFRESH_TOKEN || !ML_CLIENT_ID || !ML_CLIENT_SECRET) {
    return null;
  }

  try {
    const resposta = await fetch(
      'https://api.mercadolibre.com/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: ML_CLIENT_ID,
          client_secret: ML_CLIENT_SECRET,
          refresh_token: ML_REFRESH_TOKEN,
        }),
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error('Erro ao renovar token do Mercado Livre:', dados);
      return null;
    }

    ML_ACCESS_TOKEN = dados.access_token;

    if (dados.refresh_token) {
      ML_REFRESH_TOKEN = dados.refresh_token;
    }

    if (dados.expires_in) {
      ML_TOKEN_EXPIRES_AT =
        Date.now() + Number(dados.expires_in) * 1000;
    }

    return ML_ACCESS_TOKEN;
  } catch (erro) {
    console.error('Erro ao renovar token:', erro);
    return null;
  }
}

app.get('/api/produtos', async (req, res) => {
  const busca = String(req.query.busca || '').trim();

  if (!busca) {
    return res.json({
      sucesso: true,
      busca: '',
      quantidade: 0,
      produtos: [],
    });
  }

  const accessToken = await garantirAccessToken();

  if (!accessToken) {
    return res.status(401).json({
      sucesso: false,
      erro: 'Mercado Livre não autorizado ou token expirado.',
    });
  }

  try {
    // 1. Busca produtos de catálogo
    const buscaUrl = new URL(
      'https://api.mercadolibre.com/products/search'
    );

    buscaUrl.searchParams.set('status', 'active');
    buscaUrl.searchParams.set('site_id', 'MLB');
    buscaUrl.searchParams.set('q', busca);
    buscaUrl.searchParams.set('limit', '10');

    const respostaBusca = await fetch(buscaUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const dadosBusca = await respostaBusca.json();

    if (!respostaBusca.ok) {
      console.error(
        'Erro na busca de produtos do Mercado Livre:',
        dadosBusca
      );

      return res.status(respostaBusca.status).json({
        sucesso: false,
        erro: 'Não foi possível pesquisar produtos no Mercado Livre.',
        detalhes: dadosBusca,
      });
    }

    const produtosCatalogo = dadosBusca.results || [];

    // 2. Para cada produto, busca as publicações/ofertas
    const produtosComOfertas = await Promise.all(
      produtosCatalogo.map(async (produto: any) => {
        try {
          const ofertasUrl = new URL(
            `https://api.mercadolibre.com/products/${produto.id}/items`
          );

          ofertasUrl.searchParams.set('limit', '20');

          const respostaOfertas = await fetch(
            ofertasUrl.toString(),
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );

          const dadosOfertas = await respostaOfertas.json();

          if (!respostaOfertas.ok) {
            console.error(
              `Erro nas ofertas do produto ${produto.id}:`,
              dadosOfertas
            );

            return [];
          }

          return (dadosOfertas.results || []).map(
            (oferta: any) => ({
              id: oferta.item_id,
              produtoId: produto.id,
              nome: produto.name,
              plataforma: 'Mercado Livre',
              preco: oferta.price,
              moeda: oferta.currency_id,
              vendedorId: oferta.seller_id,
              condicao: oferta.condition,
              link: `https://www.mercadolivre.com.br/p/${produto.id}`,
              imagem: produto.pictures?.[0]?.url || null,
            })
          );
        } catch (erro) {
          console.error(
            `Erro ao consultar ofertas do produto ${produto.id}:`,
            erro
          );

          return [];
        }
      })
    );

    // 3. Junta todas as ofertas
    const ofertas = produtosComOfertas.flat();

    // 4. Remove ofertas sem preço
    const ofertasValidas = ofertas.filter(
      (oferta: any) =>
        typeof oferta.preco === 'number' &&
        oferta.preco > 0
    );

    // 5. Ordena do menor para o maior preço
    ofertasValidas.sort(
      (a: any, b: any) => a.preco - b.preco
    );

    return res.json({
      sucesso: true,
      busca,
      quantidade: ofertasValidas.length,
      produtos: ofertasValidas,
    });
  } catch (erro) {
    console.error(
      'Erro geral ao buscar produtos:',
      erro
    );

    return res.status(500).json({
      sucesso: false,
      erro: 'Falha de comunicação com o Mercado Livre.',
    });
  }
});


// Inicia o OAuth do Mercado Livre
app.get('/auth/mercadolivre', (_req, res) => {
  if (!ML_CLIENT_ID) {
    return res.status(500).json({
      sucesso: false,
      erro: 'ML_CLIENT_ID não configurado no servidor.',
    });
  }

  const state = crypto.randomBytes(32).toString('hex');

  const codeVerifier = crypto.randomBytes(32).toString('base64url');

  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  oauthStates.set(state, {
    codeVerifier,
    createdAt: Date.now(),
  });

  const authorizationUrl = new URL(
    'https://auth.mercadolivre.com.br/authorization'
  );

  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', ML_CLIENT_ID);
  authorizationUrl.searchParams.set('redirect_uri', ML_REDIRECT_URI);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', codeChallenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');

  return res.redirect(authorizationUrl.toString());
});

// Callback do OAuth
app.get('/auth/mercadolivre/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).json({
      sucesso: false,
      erro: error,
      descricao: error_description || 'Autorização recusada.',
    });
  }

  if (!code || !state) {
    return res.status(400).json({
      sucesso: false,
      erro: 'code ou state não recebido.',
    });
  }

  const oauthState = oauthStates.get(String(state));

  if (!oauthState) {
    return res.status(400).json({
      sucesso: false,
      erro: 'state inválido ou expirado.',
    });
  }

  // State de uso único
  oauthStates.delete(String(state));

  // Expira states antigos após 10 minutos
  if (Date.now() - oauthState.createdAt > 10 * 60 * 1000) {
    return res.status(400).json({
      sucesso: false,
      erro: 'A autorização expirou. Tente novamente.',
    });
  }

  if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) {
    return res.status(500).json({
      sucesso: false,
      erro: 'Credenciais do Mercado Livre não configuradas no servidor.',
    });
  }

  try {
    const resposta = await fetch(
      'https://api.mercadolibre.com/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: ML_CLIENT_ID,
          client_secret: ML_CLIENT_SECRET,
          code: String(code),
          redirect_uri: ML_REDIRECT_URI,
          code_verifier: oauthState.codeVerifier,
        }),
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error('Erro OAuth Mercado Livre:', dados);

      return res.status(resposta.status).json({
        sucesso: false,
        erro: 'Mercado Livre recusou a troca do código por token.',
        detalhes: dados,
      });
    }

ML_ACCESS_TOKEN = dados.access_token;
ML_REFRESH_TOKEN = dados.refresh_token || null;

if (dados.expires_in) {
  ML_TOKEN_EXPIRES_AT =
    Date.now() + Number(dados.expires_in) * 1000;
} else {
  ML_TOKEN_EXPIRES_AT = null;
}

    // NÃO mostramos o access_token na resposta.
    // Ele deverá ser armazenado com segurança em uma etapa posterior.
    return res.json({
      sucesso: true,
      mensagem: 'OAuth do Mercado Livre concluído.',
      token_recebido: Boolean(dados.access_token),
      tipo_token: dados.token_type || null,
      expiracao_segundos: dados.expires_in || null,
      usuario_id: dados.user_id || null,
    });
  } catch (erro) {
    console.error('Erro ao comunicar com Mercado Livre:', erro);

    return res.status(500).json({
      sucesso: false,
      erro: 'Falha de comunicação com o Mercado Livre.',
    });
  }
});

app.get('/api/mercadolivre/usuario', async (_req, res) => {
  if (!ML_ACCESS_TOKEN) {
    return res.status(401).json({
      sucesso: false,
      erro: 'Mercado Livre ainda não foi autorizado.',
    });
  }

  try {
    const resposta = await fetch(
      'https://api.mercadolibre.com/users/me',
      {
        headers: {
          Authorization: `Bearer ${ML_ACCESS_TOKEN}`,
        },
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error('Erro ao consultar usuário:', dados);

      return res.status(resposta.status).json({
        sucesso: false,
        erro: 'Não foi possível consultar o usuário no Mercado Livre.',
        detalhes: dados,
      });
    }

    return res.json({
      sucesso: true,
      usuario: dados,
    });
  } catch (erro) {
    console.error('Erro ao comunicar com Mercado Livre:', erro);

    return res.status(500).json({
      sucesso: false,
      erro: 'Falha de comunicação com o Mercado Livre.',
    });
  }
});

app.get('/api/mercadolivre/aplicacao', async (_req, res) => {
  const accessToken = await garantirAccessToken();

  if (!accessToken) {
    return res.status(401).json({
      sucesso: false,
      erro: 'Mercado Livre não autorizado ou token expirado.',
    });
  }

  try {
    const resposta = await fetch(
      'https://api.mercadolibre.com/applications/7816206091755726',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error('Erro ao consultar aplicação:', dados);

      return res.status(resposta.status).json({
        sucesso: false,
        erro: 'Não foi possível consultar a aplicação no Mercado Livre.',
        detalhes: dados,
      });
    }

    return res.json({
      sucesso: true,
      aplicacao: dados,
    });
  } catch (erro) {
    console.error('Erro ao consultar aplicação:', erro);

    return res.status(500).json({
      sucesso: false,
      erro: 'Falha de comunicação com o Mercado Livre.',
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ofertas API rodando na porta ${PORT}`);
});
