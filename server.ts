import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

/*
|--------------------------------------------------------------------------
| MERCADO LIVRE
|--------------------------------------------------------------------------
*/

const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;

const ML_REDIRECT_URI =
  process.env.ML_REDIRECT_URI ||
  'https://ofertas-api-hzi5.onrender.com/auth/mercadolivre/callback';

/*
|--------------------------------------------------------------------------
| SUPABASE
|--------------------------------------------------------------------------
*/

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      )
    : null;

console.log(
  'Supabase configurado:',
  Boolean(supabase)
);

console.log(
  'Projeto Supabase:',
  SUPABASE_URL
    ? SUPABASE_URL.substring(0, 35) + '...'
    : 'NÃO CONFIGURADO'
);


/*
|--------------------------------------------------------------------------
| TOKENS EM MEMÓRIA
|--------------------------------------------------------------------------
*/

let ML_ACCESS_TOKEN: string | null = null;

let ML_REFRESH_TOKEN: string | null =
  process.env.ML_REFRESH_TOKEN || null;

let ML_TOKEN_EXPIRES_AT: number | null = null;

let ML_USER_ID: number | null = null;

/*
|--------------------------------------------------------------------------
| ESTADOS DO OAUTH
|--------------------------------------------------------------------------
*/

const oauthStates = new Map<
  string,
  {
    codeVerifier: string;
    createdAt: number;
  }
>();

/*
|--------------------------------------------------------------------------
| FUNÇÃO: SALVAR TOKEN NO SUPABASE
|--------------------------------------------------------------------------
*/

async function salvarTokenNoBanco(
  accessToken: string | null,
  refreshToken: string | null,
  expiresAt: number | null,
  usuarioId: number | null
): Promise<boolean> {
  if (!supabase) {
    console.error(
      'Supabase não configurado. Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'
    );

    return false;
  }

  if (!refreshToken) {
    console.error(
      'Não foi possível salvar o token: refresh_token não recebido.'
    );

    return false;
  }

  try {
    /*
     * Procura o último registro existente.
     */
    const {
      data: registroExistente,
      error: erroBusca,
    } = await supabase
      .from('mercado_livre_tokens')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroBusca) {
      console.error(
        'Erro ao verificar token existente no Supabase:',
        erroBusca
      );

      return false;
    }

    /*
     * Se já temos um usuário em memória e
     * não recebemos outro ID, preservamos o anterior.
     */
    const usuarioFinal =
      usuarioId ?? ML_USER_ID ?? null;

    const dados = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      usuario_id: usuarioFinal,
      atualizado_em: new Date().toISOString(),
    };

    /*
     * Atualiza o registro existente.
     */
    if (registroExistente?.id) {
      const {
        error: erroAtualizacao,
      } = await supabase
        .from('mercado_livre_tokens')
        .update(dados)
        .eq('id', registroExistente.id);

      if (erroAtualizacao) {
        console.error(
          'Erro ao atualizar token no Supabase:',
          erroAtualizacao
        );

        return false;
      }

      console.log(
        'Token do Mercado Livre atualizado no Supabase.'
      );

      return true;
    }

    /*
     * Caso ainda não exista registro,
     * cria um novo.
     */
    const {
      error: erroInsercao,
    } = await supabase
      .from('mercado_livre_tokens')
      .insert(dados);

    if (erroInsercao) {
      console.error(
        'Erro ao inserir token no Supabase:',
        erroInsercao
      );

      return false;
    }

    console.log(
      'Token do Mercado Livre salvo no Supabase.'
    );

    return true;
  } catch (erro) {
    console.error(
      'Erro ao salvar token no Supabase:',
      erro
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| FUNÇÃO: CARREGAR TOKEN DO SUPABASE
|--------------------------------------------------------------------------
*/

async function carregarTokenDoBanco(): Promise<boolean> {
  if (!supabase) {
    console.error(
      'Supabase não configurado. Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'
    );

    return false;
  }

  try {
    const {
      data,
      error,
    } = await supabase
      .from('mercado_livre_tokens')
      .select(
        'id, access_token, refresh_token, expires_at, usuario_id'
      )
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        'Erro ao carregar token do Supabase:',
        error
      );

      return false;
    }

    if (!data) {
      console.log(
        'Nenhum token do Mercado Livre encontrado no Supabase.'
      );

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

    console.log(
      'Token do Mercado Livre carregado do Supabase.'
    );

    if (ML_USER_ID) {
      console.log(
        `Usuário Mercado Livre carregado: ${ML_USER_ID}`
      );
    }

    return Boolean(
      ML_ACCESS_TOKEN ||
      ML_REFRESH_TOKEN
    );
  } catch (erro) {
    console.error(
      'Erro ao acessar o Supabase:',
      erro
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| FUNÇÃO: GARANTIR ACCESS TOKEN
|--------------------------------------------------------------------------
*/

async function garantirAccessToken(): Promise<string | null> {
  /*
   * 1. Se o access token atual ainda é válido,
   * não precisamos fazer nenhuma chamada.
   */
  if (
    ML_ACCESS_TOKEN &&
    ML_TOKEN_EXPIRES_AT &&
    Date.now() <
      ML_TOKEN_EXPIRES_AT - 60_000
  ) {
    return ML_ACCESS_TOKEN;
  }

  /*
   * 2. Caso não exista token em memória,
   * tenta carregar do Supabase.
   */
  if (
    !ML_ACCESS_TOKEN &&
    !ML_REFRESH_TOKEN
  ) {
    await carregarTokenDoBanco();
  }

  /*
   * 3. Depois de carregar do banco,
   * verifica novamente se o access token ainda é válido.
   */
  if (
    ML_ACCESS_TOKEN &&
    ML_TOKEN_EXPIRES_AT &&
    Date.now() <
      ML_TOKEN_EXPIRES_AT - 60_000
  ) {
    return ML_ACCESS_TOKEN;
  }

  /*
   * 4. Para renovar precisamos do refresh token
   * e das credenciais da aplicação.
   */
  if (
    !ML_REFRESH_TOKEN ||
    !ML_CLIENT_ID ||
    !ML_CLIENT_SECRET
  ) {
    console.error(
      'Não é possível renovar o token: credenciais ou refresh_token ausentes.'
    );

    return null;
  }

  try {
    console.log(
      'Renovando token do Mercado Livre...'
    );

    const resposta =
      await fetch(
        'https://api.mercadolibre.com/oauth/token',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded',
          },

          body:
            new URLSearchParams({
              grant_type:
                'refresh_token',

              client_id:
                ML_CLIENT_ID,

              client_secret:
                ML_CLIENT_SECRET,

              refresh_token:
                ML_REFRESH_TOKEN,
            }),
        }
      );

    const dados =
      await resposta.json();

    /*
     * Mercado Livre recusou a renovação.
     */
    if (!resposta.ok) {
      console.error(
        'Erro ao renovar token do Mercado Livre:',
        dados
      );

      return null;
    }

    /*
     * Atualiza access token.
     */
    ML_ACCESS_TOKEN =
      dados.access_token || null;

    /*
     * O Mercado Livre pode fornecer
     * um novo refresh token.
     *
     * Se não fornecer, mantemos o anterior.
     */
    if (dados.refresh_token) {
      ML_REFRESH_TOKEN =
        dados.refresh_token;
    }

    /*
     * Calcula nova expiração.
     */
    if (dados.expires_in) {
      ML_TOKEN_EXPIRES_AT =
        Date.now() +
        Number(dados.expires_in) *
          1000;
    } else {
      ML_TOKEN_EXPIRES_AT = null;
    }

    /*
     * Salva a renovação no Supabase.
     */
    const tokenSalvo =
      await salvarTokenNoBanco(
        ML_ACCESS_TOKEN,
        ML_REFRESH_TOKEN,
        ML_TOKEN_EXPIRES_AT,
        ML_USER_ID
      );

    if (tokenSalvo) {
      console.log(
        'Token renovado e salvo no Supabase.'
      );
    } else {
      console.error(
        'Token renovado, mas não foi possível salvar no Supabase.'
      );
    }

    return ML_ACCESS_TOKEN;
  } catch (erro) {
    console.error(
      'Erro ao renovar token:',
      erro
    );

    return null;
  }
}

/*
|--------------------------------------------------------------------------
| ROTA PRINCIPAL
|--------------------------------------------------------------------------
*/

app.get('/', (_req, res) => {
  res.json({
    nome: 'Ofertas API',
    status: 'online',
    mensagem:
      'API do Ofertas App funcionando.',
  });
});

/*
|--------------------------------------------------------------------------
| TESTE
|--------------------------------------------------------------------------
*/

app.get('/api/teste', (_req, res) => {
  res.json({
    sucesso: true,
    mensagem:
      'Backend funcionando corretamente.',
  });
});

/*
|--------------------------------------------------------------------------
| BUSCA DE PRODUTOS
|--------------------------------------------------------------------------
*/

app.get(
  '/api/produtos',
  async (req, res) => {
    const busca =
      String(
        req.query.busca || ''
      ).trim();

    if (!busca) {
      return res.json({
        sucesso: true,
        busca: '',
        quantidade: 0,
        produtos: [],
      });
    }

    const accessToken =
      await garantirAccessToken();

    if (!accessToken) {
      return res.status(401).json({
        sucesso: false,
        erro:
          'Mercado Livre não autorizado ou token expirado.',
      });
    }

    try {
      /*
       * 1. Busca produtos de catálogo.
       */

      const buscaUrl =
        new URL(
          'https://api.mercadolibre.com/products/search'
        );

      buscaUrl.searchParams.set(
        'status',
        'active'
      );

      buscaUrl.searchParams.set(
        'site_id',
        'MLB'
      );

      buscaUrl.searchParams.set(
        'q',
        busca
      );

      buscaUrl.searchParams.set(
        'limit',
        '10'
      );

      const respostaBusca =
        await fetch(
          buscaUrl.toString(),
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          }
        );

      const dadosBusca =
        await respostaBusca.json();

      if (!respostaBusca.ok) {
        console.error(
          'Erro na busca de produtos do Mercado Livre:',
          dadosBusca
        );

        return res.status(
          respostaBusca.status
        ).json({
          sucesso: false,
          erro:
            'Não foi possível pesquisar produtos no Mercado Livre.',
          detalhes:
            dadosBusca,
        });
      }

      const produtosCatalogo =
        dadosBusca.results || [];

      /*
       * 2. Busca as ofertas de cada produto.
       */

      const produtosComOfertas =
        await Promise.all(
          produtosCatalogo.map(
            async (
              produto: any
            ) => {
              try {
                const ofertasUrl =
                  new URL(
                    `https://api.mercadolibre.com/products/${produto.id}/items`
                  );

                ofertasUrl.searchParams.set(
                  'limit',
                  '20'
                );

                const respostaOfertas =
                  await fetch(
                    ofertasUrl.toString(),
                    {
                      headers: {
                        Authorization:
                          `Bearer ${accessToken}`,
                      },
                    }
                  );

                const dadosOfertas =
                  await respostaOfertas.json();

                if (
                  !respostaOfertas.ok
                ) {
                  console.error(
                    `Erro nas ofertas do produto ${produto.id}:`,
                    dadosOfertas
                  );

                  return [];
                }

                return (
                  dadosOfertas.results ||
                  []
                ).map(
                  (
                    oferta: any
                  ) => ({
                    id:
                      oferta.item_id,

                    produtoId:
                      produto.id,

                    nome:
                      produto.name,

                    plataforma:
                      'Mercado Livre',

                    preco:
                      oferta.price,

                    moeda:
                      oferta.currency_id,

                    vendedorId:
                      oferta.seller_id,

                    condicao:
                      oferta.condition,

                    link:
                      `https://www.mercadolivre.com.br/p/${produto.id}`,

                    imagem:
                      produto
                        .pictures?.[0]
                        ?.url ||
                      null,
                  })
                );
              } catch (
                erro
              ) {
                console.error(
                  `Erro ao consultar ofertas do produto ${produto.id}:`,
                  erro
                );

                return [];
              }
            }
          )
        );

      /*
       * 3. Junta todas as ofertas.
       */

      const ofertas =
        produtosComOfertas.flat();

      /*
       * 4. Remove ofertas sem preço.
       */

      const ofertasValidas =
        ofertas.filter(
          (oferta: any) =>
            typeof oferta.preco ===
              'number' &&
            oferta.preco > 0
        );

      /*
       * 5. Ordena pelo menor preço.
       */

      ofertasValidas.sort(
        (
          a: any,
          b: any
        ) =>
          a.preco -
          b.preco
      );

      return res.json({
        sucesso: true,
        busca,
        quantidade:
          ofertasValidas.length,
        produtos:
          ofertasValidas,
      });
    } catch (
      erro
    ) {
      console.error(
        'Erro geral ao buscar produtos:',
        erro
      );

      return res.status(500).json({
        sucesso: false,
        erro:
          'Falha de comunicação com o Mercado Livre.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| INICIAR OAUTH DO MERCADO LIVRE
|--------------------------------------------------------------------------
*/

app.get(
  '/auth/mercadolivre',
  (_req, res) => {
    if (!ML_CLIENT_ID) {
      return res.status(500).json({
        sucesso: false,
        erro:
          'ML_CLIENT_ID não configurado no servidor.',
      });
    }

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

    oauthStates.set(
      state,
      {
        codeVerifier,
        createdAt:
          Date.now(),
      },
    );

    const authorizationUrl =
      new URL(
        'https://auth.mercadolivre.com.br/authorization'
      );

    authorizationUrl.searchParams.set(
      'response_type',
      'code'
    );

    authorizationUrl.searchParams.set(
      'client_id',
      ML_CLIENT_ID
    );

    authorizationUrl.searchParams.set(
      'redirect_uri',
      ML_REDIRECT_URI
    );

    authorizationUrl.searchParams.set(
      'state',
      state
    );

    authorizationUrl.searchParams.set(
      'code_challenge',
      codeChallenge
    );

    authorizationUrl.searchParams.set(
      'code_challenge_method',
      'S256'
    );

    return res.redirect(
      authorizationUrl.toString()
    );
  }
);

/*
|--------------------------------------------------------------------------
| CALLBACK DO OAUTH
|--------------------------------------------------------------------------
*/

app.get(
  '/auth/mercadolivre/callback',
  async (req, res) => {
    const {
      code,
      state,
      error,
      error_description,
    } = req.query;

    /*
     * Mercado Livre recusou.
     */

    if (error) {
      return res.status(400).json({
        sucesso: false,
        erro: error,
        descricao:
          error_description ||
          'Autorização recusada.',
      });
    }

    /*
     * Verifica code e state.
     */

    if (
      !code ||
      !state
    ) {
      return res.status(400).json({
        sucesso: false,
        erro:
          'code ou state não recebido.',
      });
    }

    const oauthState =
      oauthStates.get(
        String(state)
      );

    if (!oauthState) {
      return res.status(400).json({
        sucesso: false,
        erro:
          'state inválido ou expirado.',
      });
    }

    /*
     * State de uso único.
     */

    oauthStates.delete(
      String(state)
    );

    /*
     * State expira em 10 minutos.
     */

    if (
      Date.now() -
        oauthState.createdAt >
      10 * 60 * 1000
    ) {
      return res.status(400).json({
        sucesso: false,
        erro:
          'A autorização expirou. Tente novamente.',
      });
    }

    if (
      !ML_CLIENT_ID ||
      !ML_CLIENT_SECRET
    ) {
      return res.status(500).json({
        sucesso: false,
        erro:
          'Credenciais do Mercado Livre não configuradas no servidor.',
      });
    }

    try {
      /*
       * Troca authorization code
       * por access token.
       */

      const resposta =
        await fetch(
          'https://api.mercadolibre.com/oauth/token',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/x-www-form-urlencoded',
            },

            body:
              new URLSearchParams({
                grant_type:
                  'authorization_code',

                client_id:
                  ML_CLIENT_ID,

                client_secret:
                  ML_CLIENT_SECRET,

                code:
                  String(code),

                redirect_uri:
                  ML_REDIRECT_URI,

                code_verifier:
                  oauthState.codeVerifier,
              }),
          }
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        console.error(
          'Erro OAuth Mercado Livre:',
          dados
        );

        return res.status(
          resposta.status
        ).json({
          sucesso: false,
          erro:
            'Mercado Livre recusou a troca do código por token.',
          detalhes:
            dados,
        });
      }

      /*
       * Guarda tokens em memória.
       */

      ML_ACCESS_TOKEN =
        dados.access_token ||
        null;

      ML_REFRESH_TOKEN =
        dados.refresh_token ||
        null;

      /*
       * Guarda usuário.
       */

      ML_USER_ID =
        dados.user_id
          ? Number(
              dados.user_id
            )
          : null;

      /*
       * Calcula expiração.
       */

      if (
        dados.expires_in
      ) {
        ML_TOKEN_EXPIRES_AT =
          Date.now() +
          Number(
            dados.expires_in
          ) *
            1000;
      } else {
        ML_TOKEN_EXPIRES_AT =
          null;
      }

      /*
       * Salva permanentemente
       * no Supabase.
       */

      const tokenSalvo =
        await salvarTokenNoBanco(
          ML_ACCESS_TOKEN,
          ML_REFRESH_TOKEN,
          ML_TOKEN_EXPIRES_AT,
          ML_USER_ID
        );

      /*
       * Não retorna tokens.
       */

      return res.json({
        sucesso: true,

        mensagem:
          tokenSalvo
            ? 'OAuth do Mercado Livre concluído e token salvo no Supabase.'
            : 'OAuth do Mercado Livre concluído, mas não foi possível salvar o token no Supabase.',

        token_recebido:
          Boolean(
            dados.access_token
          ),

        token_salvo:
          tokenSalvo,

        tipo_token:
          dados.token_type ||
          null,

        expiracao_segundos:
          dados.expires_in ||
          null,

        usuario_id:
          dados.user_id ||
          null,
      });
    } catch (
      erro
    ) {
      console.error(
        'Erro ao comunicar com Mercado Livre:',
        erro
      );

      return res.status(500).json({
        sucesso: false,
        erro:
          'Falha de comunicação com o Mercado Livre.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CONSULTAR USUÁRIO
|--------------------------------------------------------------------------
*/

app.get(
  '/api/mercadolivre/usuario',
  async (_req, res) => {
    const accessToken =
      await garantirAccessToken();

    if (!accessToken) {
      return res.status(401).json({
        sucesso: false,
        erro:
          'Mercado Livre ainda não foi autorizado.',
      });
    }

    try {
      const resposta =
        await fetch(
          'https://api.mercadolibre.com/users/me',
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          }
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        console.error(
          'Erro ao consultar usuário:',
          dados
        );

        return res.status(
          resposta.status
        ).json({
          sucesso: false,
          erro:
            'Não foi possível consultar o usuário no Mercado Livre.',
          detalhes:
            dados,
        });
      }

      return res.json({
        sucesso: true,
        usuario:
          dados,
      });
    } catch (
      erro
    ) {
      console.error(
        'Erro ao comunicar com Mercado Livre:',
        erro
      );

      return res.status(500).json({
        sucesso: false,
        erro:
          'Falha de comunicação com o Mercado Livre.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CONSULTAR APLICAÇÃO
|--------------------------------------------------------------------------
*/

app.get(
  '/api/mercadolivre/aplicacao',
  async (_req, res) => {
    const accessToken =
      await garantirAccessToken();

    if (!accessToken) {
      return res.status(401).json({
        sucesso: false,
        erro:
          'Mercado Livre não autorizado ou token expirado.',
      });
    }

    try {
      const resposta =
        await fetch(
          'https://api.mercadolibre.com/applications/7816206091755726',
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          }
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        console.error(
          'Erro ao consultar aplicação:',
          dados
        );

        return res.status(
          resposta.status
        ).json({
          sucesso: false,
          erro:
            'Não foi possível consultar a aplicação no Mercado Livre.',
          detalhes:
            dados,
        });
      }

      return res.json({
        sucesso: true,
        aplicacao:
          dados,
      });
    } catch (
      erro
    ) {
      console.error(
        'Erro ao consultar aplicação:',
        erro
      );

      return res.status(500).json({
        sucesso: false,
        erro:
          'Falha de comunicação com o Mercado Livre.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| INICIALIZAÇÃO
|--------------------------------------------------------------------------
*/

async function iniciarServidor() {
  /*
   * Carrega o token persistido
   * antes de iniciar o servidor.
   */
  await carregarTokenDoBanco();

  app.listen(
    PORT,
    '0.0.0.0',
    () => {
      console.log(
        `Ofertas API rodando na porta ${PORT}`
      );
    }
  );
}


app.get('/api/teste-supabase', async (_req, res) => {
  if (!supabase) {
    return res.status(500).json({
      sucesso: false,
      erro: 'Supabase não configurado.',
    });
  }

  try {
    const { data, error } = await supabase
      .from('mercado_livre_tokens')
      .select('id, usuario_id, expires_at, atualizado_em')
      .order('id', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Erro no teste do Supabase:', error);

      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao consultar Supabase.',
        detalhes: error.message,
      });
    }

    return res.json({
      sucesso: true,
      quantidade: data?.length || 0,
      registros: data || [],
    });
  } catch (erro) {
    console.error('Erro no teste:', erro);

    return res.status(500).json({
      sucesso: false,
      erro: 'Falha ao testar Supabase.',
    });
  }
});



iniciarServidor();