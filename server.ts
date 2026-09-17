import 'dotenv/config';

import express, {
  Request,
  Response as ExpressResponse,
} from 'express';

import cors from 'cors';
import crypto from 'crypto';

import {
  createClient,
  SupabaseClient,
} from '@supabase/supabase-js';

/*
|--------------------------------------------------------------------------
| APP
|--------------------------------------------------------------------------
*/

const app = express();

app.use(cors());
app.use(express.json());

const PORT =
  Number(process.env.PORT) || 3000;

/*
|--------------------------------------------------------------------------
| MERCADO LIVRE
|--------------------------------------------------------------------------
*/

const ML_CLIENT_ID =
  process.env.ML_CLIENT_ID?.trim() || '';

const ML_CLIENT_SECRET =
  process.env.ML_CLIENT_SECRET?.trim() || '';

const ML_REDIRECT_URI =
  process.env.ML_REDIRECT_URI?.trim() ||
  'https://ofertas-api-hzi5.onrender.com/auth/mercadolivre/callback';

const ML_API_BASE =
  'https://api.mercadolibre.com';

const ML_AUTH_BASE =
  'https://auth.mercadolivre.com.br';

const ML_SITE_ID =
  'MLB';

/*
|--------------------------------------------------------------------------
| SCOPES OAUTH
|--------------------------------------------------------------------------
|
| O Mercado Livre documenta os scopes:
|
| offline_access
| read
| write
|
*/

const ML_OAUTH_SCOPE =
  'offline_access read write';

/*
|--------------------------------------------------------------------------
| SUPABASE
|--------------------------------------------------------------------------
*/

const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim() || '';

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

let supabase:
  | SupabaseClient
  | null = null;

if (
  SUPABASE_URL &&
  SUPABASE_SERVICE_ROLE_KEY
) {
  supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  );
}

console.log(
  `Supabase configurado: ${Boolean(supabase)}`
);

/*
|--------------------------------------------------------------------------
| TOKENS
|--------------------------------------------------------------------------
*/

let ML_ACCESS_TOKEN:
  | string
  | null = null;

let ML_REFRESH_TOKEN:
  | string
  | null =
  process.env.ML_REFRESH_TOKEN?.trim() ||
  null;

let ML_TOKEN_EXPIRES_AT:
  | number
  | null = null;

let ML_USER_ID:
  | number
  | null = null;

let ML_TOKEN_SCOPE:
  | string
  | null = null;

/*
|--------------------------------------------------------------------------
| OAUTH STATE
|--------------------------------------------------------------------------
*/

interface OAuthState {
  codeVerifier: string;
  createdAt: number;
}

const oauthStates =
  new Map<string, OAuthState>();

/*
|--------------------------------------------------------------------------
| TIPOS
|--------------------------------------------------------------------------
*/

interface MercadoLivreTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  user_id?: number;
  refresh_token?: string;
  scope?: string;
}

interface ProdutoOfertasApp {
  id: string | null;
  produtoId: string | null;
  nome: string;
  plataforma: string;
  preco: number | null;
  precoOriginal: number | null;
  desconto: number;
  moeda: string;
  vendedorId: number | null;
  vendedor: string | null;
  condicao: string | null;
  link: string | null;
  imagem: string | null;
  quantidadeVendida: number;
  freteGratis: boolean;
  categoriaId: string | null;
  catalogo: boolean;
  cidade: string | null;
  estado: string | null;
}

/*
|--------------------------------------------------------------------------
| UTILITÁRIOS
|--------------------------------------------------------------------------
*/

function limparStatesAntigos() {
  const agora =
    Date.now();

  for (
    const [state, dados]
    of oauthStates.entries()
  ) {
    if (
      agora - dados.createdAt >
      10 * 60 * 1000
    ) {
      oauthStates.delete(state);
    }
  }
}

function invalidarAccessToken() {
  ML_ACCESS_TOKEN = null;
  ML_TOKEN_EXPIRES_AT = null;
}

function tokenAindaValido() {
  return Boolean(
    ML_ACCESS_TOKEN &&
    ML_TOKEN_EXPIRES_AT &&
    Date.now() <
      ML_TOKEN_EXPIRES_AT - 60_000
  );
}

/*
|--------------------------------------------------------------------------
| SUPABASE — SALVAR TOKEN
|--------------------------------------------------------------------------
*/

async function salvarTokenNoBanco(
  accessToken: string | null,
  refreshToken: string | null,
  expiresAt: number | null,
  usuarioId: number | null,
  scope: string | null
): Promise<boolean> {

  if (!supabase) {
    console.error(
      'Supabase não configurado.'
    );

    return false;
  }

  if (!accessToken) {
    console.error(
      'Access token ausente.'
    );

    return false;
  }

  if (!refreshToken) {
    console.error(
      'Refresh token ausente.'
    );

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
      console.error(
        'Erro buscando token:',
        erroBusca
      );

      return false;
    }

    /*
     * IMPORTANTE:
     *
     * Não adicionamos "scope" ao banco nesta versão
     * porque sua tabela atual pode não possuir essa coluna.
     *
     * O scope continua disponível em memória e nos
     * endpoints de diagnóstico.
     */

    const dados = {
      access_token:
        accessToken,

      refresh_token:
        refreshToken,

      expires_at:
        expiresAt,

      usuario_id:
        usuarioId ??
        ML_USER_ID ??
        null,

      atualizado_em:
        new Date().toISOString(),
    };

    if (existente?.id) {

      const {
        error,
      } = await supabase
        .from('mercado_livre_tokens')
        .update(dados)
        .eq(
          'id',
          existente.id
        );

      if (error) {
        console.error(
          'Erro atualizando token:',
          error
        );

        return false;
      }

      return true;
    }

    const {
      error,
    } = await supabase
      .from('mercado_livre_tokens')
      .insert(dados);

    if (error) {
      console.error(
        'Erro inserindo token:',
        error
      );

      return false;
    }

    return true;

  } catch (erro) {

    console.error(
      'Erro Supabase:',
      erro
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| SUPABASE — CARREGAR TOKEN
|--------------------------------------------------------------------------
*/

async function carregarTokenDoBanco(): Promise<boolean> {

  if (!supabase) {
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
      .order('id', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        'Erro carregando token:',
        error
      );

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

    return Boolean(
      ML_ACCESS_TOKEN ||
      ML_REFRESH_TOKEN
    );

  } catch (erro) {

    console.error(
      'Erro lendo Supabase:',
      erro
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| RENOVAR TOKEN
|--------------------------------------------------------------------------
*/

async function renovarAccessToken(): Promise<string | null> {

  if (
    !ML_REFRESH_TOKEN ||
    !ML_CLIENT_ID ||
    !ML_CLIENT_SECRET
  ) {

    console.error(
      'Credenciais ou refresh token ausentes.'
    );

    return null;
  }

  try {

    const resposta =
      await fetch(
        `${ML_API_BASE}/oauth/token`,
        {
          method: 'POST',

          headers: {
            Accept:
              'application/json',

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
      await resposta.json() as MercadoLivreTokenResponse;

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

    /*
     * O Mercado Livre pode devolver um NOVO
     * refresh_token.
     *
     * Sempre devemos substituir o antigo.
     */

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

    if (dados.scope) {
      ML_TOKEN_SCOPE =
        dados.scope;
    }

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

/*
|--------------------------------------------------------------------------
| GARANTIR TOKEN
|--------------------------------------------------------------------------
*/

async function garantirAccessToken(): Promise<string | null> {

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

/*
|--------------------------------------------------------------------------
| REQUEST MERCADO LIVRE
|--------------------------------------------------------------------------
*/

async function mercadoLivreGet(
  url: string,
  accessToken?: string
): Promise<globalThis.Response> {

  const headers: Record<string, string> = {
    Accept:
      'application/json',
  };

  if (accessToken) {

    headers.Authorization =
      `Bearer ${accessToken}`;
  }

  return fetch(
    url,
    {
      method: 'GET',
      headers,
    }
  );
}

/*
|--------------------------------------------------------------------------
| LER JSON
|--------------------------------------------------------------------------
*/

async function lerJson(
  resposta: globalThis.Response
): Promise<any> {

  const texto =
    await resposta.text();

  if (!texto) {
    return null;
  }

  try {

    return JSON.parse(texto);

  } catch {

    return {
      resposta_texto:
        texto,
    };
  }
}

/*
|--------------------------------------------------------------------------
| DIAGNÓSTICO 403
|--------------------------------------------------------------------------
*/

function diagnosticar403(
  dados: any
) {

  const codigo =
    dados?.code ||
    dados?.error ||
    null;

  const mensagem =
    String(
      dados?.message ||
      dados?.error_description ||
      ''
    );

  const mensagemLower =
    mensagem.toLowerCase();

  if (
    codigo ===
      'PA_UNAUTHORIZED_RESULT_FROM_POLICIES' ||
    mensagemLower.includes(
      'policy'
    ) ||
    mensagemLower.includes(
      'permission'
    ) ||
    mensagemLower.includes(
      'scope'
    )
  ) {

    return {

      causa:
        'PERMISSAO_OU_SCOPE',

      mensagem:
        'O Mercado Livre informou que pelo menos uma política de autorização não permitiu o acesso.',

      verificar: [

        'A aplicação possui as permissões funcionais necessárias.',

        'O usuário autorizou novamente a aplicação depois da alteração das permissões.',

        'O token possui os scopes read/write/offline_access.',

        'O access token pertence ao mesmo usuário que autorizou a aplicação.',
      ],

      acao:
        'Revogue a autorização antiga e faça o OAuth novamente.',
    };
  }

  if (
    codigo === 'forbidden'
  ) {

    return {

      causa:
        'FORBIDDEN',

      mensagem:
        'O Mercado Livre recusou a chamada com HTTP 403.',

      verificar: [

        'Permissões da aplicação.',

        'Grant do usuário.',

        'Access token.',

        'IP configurado na aplicação.',

        'Conta Mercado Livre utilizada na autorização.',

        'Possíveis restrições da aplicação.',
      ],

      acao:
        'Verifique /api/mercadolivre/grants e /api/mercadolivre/aplicacao e depois faça nova autorização OAuth.',
    };
  }

  return {

    causa:
      'FORBIDDEN_NAO_CLASSIFICADO',

    mensagem:
      'O Mercado Livre retornou HTTP 403.',

    verificar: [

      'Resposta original da API.',

      'Scopes do token.',

      'Grant do usuário.',

      'IP permitido na aplicação.',
    ],

    acao:
      'Execute novamente /api/mercadolivre/testes.',
  };
}

/*
|--------------------------------------------------------------------------
| ROTA PRINCIPAL
|--------------------------------------------------------------------------
*/

app.get(
  '/',
  (
    _req: Request,
    res: ExpressResponse
  ) => {

    return res.json({

      nome:
        'Ofertas API',

      status:
        'online',

      mensagem:
        'API do Ofertas App funcionando.',
    });
  }
);

/*
|--------------------------------------------------------------------------
| TESTE LOCAL
|--------------------------------------------------------------------------
*/

app.get(
  '/api/teste',
  (
    _req: Request,
    res: ExpressResponse
  ) => {

    return res.json({

      sucesso:
        true,

      mensagem:
        'Backend funcionando corretamente.',
    });
  }
);

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

app.get(
  '/api/mercadolivre/status',
  async (
    _req: Request,
    res: ExpressResponse
  ) => {

    const token =
      await garantirAccessToken();

    return res.json({

      sucesso:
        true,

      autorizado:
        Boolean(token),

      usuario_id:
        ML_USER_ID,

      token_configurado:
        Boolean(
          ML_ACCESS_TOKEN ||
          ML_REFRESH_TOKEN
        ),

      token_valido:
        tokenAindaValido(),

      token_scope:
        ML_TOKEN_SCOPE,

      scopes_esperados:
        ML_OAUTH_SCOPE,

      supabase_configurado:
        Boolean(supabase),

      client_id_configurado:
        Boolean(ML_CLIENT_ID),

      redirect_uri:
        ML_REDIRECT_URI,
    });
  }
);

/*
|--------------------------------------------------------------------------
| USUÁRIO
|--------------------------------------------------------------------------
*/

app.get(
  '/api/mercadolivre/usuario',
  async (
    _req: Request,
    res: ExpressResponse
  ) => {

    let token =
      await garantirAccessToken();

    if (!token) {

      return res.status(401).json({

        sucesso:
          false,

        erro:
          'Mercado Livre não autorizado.',
      });
    }

    try {

      let resposta =
        await mercadoLivreGet(
          `${ML_API_BASE}/users/me`,
          token
        );

      if (
        resposta.status === 401
      ) {

        invalidarAccessToken();

        token =
          await renovarAccessToken();

        if (!token) {

          return res.status(401).json({

            sucesso:
              false,

            erro:
              'Token expirado e não foi possível renová-lo.',
          });
        }

        resposta =
          await mercadoLivreGet(
            `${ML_API_BASE}/users/me`,
            token
          );
      }

      const dados =
        await lerJson(resposta);

      if (!resposta.ok) {

        return res.status(
          resposta.status
        ).json({

          sucesso:
            false,

          erro:
            'Não foi possível consultar o usuário.',

          detalhes:
            dados,
        });
      }

      if (dados?.id) {

        ML_USER_ID =
          Number(dados.id);
      }

      return res.json({

        sucesso:
          true,

        usuario:
          dados,
      });

    } catch (erro) {

      console.error(
        'Erro /users/me:',
        erro
      );

      return res.status(500).json({

        sucesso:
          false,

        erro:
          'Falha de comunicação com Mercado Livre.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| APLICAÇÃO
|--------------------------------------------------------------------------
*/

app.get(
  '/api/mercadolivre/aplicacao',
  async (
    _req: Request,
    res: ExpressResponse
  ) => {

    const token =
      await garantirAccessToken();

    if (!token) {

      return res.status(401).json({

        sucesso:
          false,

        erro:
          'Mercado Livre não autorizado.',
      });
    }

    if (!ML_CLIENT_ID) {

      return res.status(500).json({

        sucesso:
          false,

        erro:
          'ML_CLIENT_ID não configurado.',
      });
    }

    try {

      const resposta =
        await mercadoLivreGet(
          `${ML_API_BASE}/applications/${ML_CLIENT_ID}`,
          token
        );

      const dados =
        await lerJson(resposta);

      return res.status(
        resposta.ok
          ? 200
          : resposta.status
      ).json({

        sucesso:
          resposta.ok,

        aplicacao:
          resposta.ok
            ? dados
            : undefined,

        detalhes:
          resposta.ok
            ? undefined
            : dados,
      });

    } catch (erro) {

      console.error(
        'Erro aplicação:',
        erro
      );

      return res.status(500).json({

        sucesso:
          false,

        erro:
          'Falha de comunicação com Mercado Livre.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GRANTS DA APLICAÇÃO
|--------------------------------------------------------------------------
|
| Essa rota é importante para descobrir exatamente
| quais permissões o Mercado Livre concedeu ao usuário.
|
*/

app.get(
  '/api/mercadolivre/grants',
  async (
    _req: Request,
    res: ExpressResponse
  ) => {

    const token =
      await garantirAccessToken();

    if (!token) {

      return res.status(401).json({

        sucesso:
          false,

        erro:
          'Mercado Livre não autorizado.',
      });
    }

    if (!ML_CLIENT_ID) {

      return res.status(500).json({

        sucesso:
          false,

        erro:
          'ML_CLIENT_ID não configurado.',
      });
    }

    try {

      const resposta =
        await mercadoLivreGet(
          `${ML_API_BASE}/applications/${ML_CLIENT_ID}/grants`,
          token
        );

      const dados =
        await lerJson(resposta);

      return res.status(
        resposta.ok
          ? 200
          : resposta.status
      ).json({

        sucesso:
          resposta.ok,

        app_id:
          ML_CLIENT_ID,

        usuario_id:
          ML_USER_ID,

        grants:
          resposta.ok
            ? dados
            : null,

        detalhes:
          resposta.ok
            ? null
            : dados,
      });

    } catch (erro) {

      console.error(
        'Erro grants:',
        erro
      );

      return res.status(500).json({

        sucesso:
          false,

        erro:
          'Falha consultando grants do Mercado Livre.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| OAUTH
|--------------------------------------------------------------------------
*/

app.get(
  '/auth/mercadolivre',
  (
    _req: Request,
    res: ExpressResponse
  ) => {

    if (
      !ML_CLIENT_ID ||
      !ML_CLIENT_SECRET
    ) {

      return res.status(500).json({

        sucesso:
          false,

        erro:
          'Credenciais do Mercado Livre não configuradas.',
      });
    }

    limparStatesAntigos();

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
      }
    );

    const url =
      new URL(
        `${ML_AUTH_BASE}/authorization`
      );

    url.searchParams.set(
      'response_type',
      'code'
    );

    url.searchParams.set(
      'client_id',
      ML_CLIENT_ID
    );

    url.searchParams.set(
      'redirect_uri',
      ML_REDIRECT_URI
    );

    url.searchParams.set(
      'state',
      state
    );

    /*
     * NOVO:
     *
     * Solicita explicitamente os scopes.
     */

    url.searchParams.set(
      'scope',
      ML_OAUTH_SCOPE
    );

    url.searchParams.set(
      'code_challenge',
      codeChallenge
    );

    url.searchParams.set(
      'code_challenge_method',
      'S256'
    );

    console.log(
      'Iniciando OAuth Mercado Livre.'
    );

    console.log(
      'Scopes solicitados:',
      ML_OAUTH_SCOPE
    );

    return res.redirect(
      url.toString()
    );
  }
);

/*
|--------------------------------------------------------------------------
| OAUTH CALLBACK
|--------------------------------------------------------------------------
*/

app.get(
  '/auth/mercadolivre/callback',
  async (
    req: Request,
    res: ExpressResponse
  ) => {

    const {
      code,
      state,
      error,
      error_description,
    } = req.query;

    if (error) {

      return res.status(400).json({

        sucesso:
          false,

        erro:
          String(error),

        descricao:
          error_description
            ? String(
                error_description
              )
            : 'Autorização recusada.',
      });
    }

    if (!code || !state) {

      return res.status(400).json({

        sucesso:
          false,

        erro:
          'code ou state não recebido.',
      });
    }

    const stateString =
      String(state);

    const oauthState =
      oauthStates.get(
        stateString
      );

    if (!oauthState) {

      return res.status(400).json({

        sucesso:
          false,

        erro:
          'state inválido ou expirado.',
      });
    }

    oauthStates.delete(
      stateString
    );

    if (
      Date.now() -
        oauthState.createdAt >
      10 * 60 * 1000
    ) {

      return res.status(400).json({

        sucesso:
          false,

        erro:
          'Autorização expirada.',
      });
    }

    try {

      const resposta =
        await fetch(
          `${ML_API_BASE}/oauth/token`,
          {
            method: 'POST',

            headers: {

              Accept:
                'application/json',

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
        await lerJson(
          resposta
        ) as MercadoLivreTokenResponse;

      if (!resposta.ok) {

        return res.status(
          resposta.status
        ).json({

          sucesso:
            false,

          erro:
            'Mercado Livre recusou a autorização.',

          detalhes:
            dados,
        });
      }

      ML_ACCESS_TOKEN =
        dados.access_token ||
        null;

      ML_REFRESH_TOKEN =
        dados.refresh_token ||
        null;

      ML_USER_ID =
        dados.user_id
          ? Number(dados.user_id)
          : null;

      ML_TOKEN_EXPIRES_AT =
        dados.expires_in
          ? Date.now() +
            Number(
              dados.expires_in
            ) *
              1000
          : null;

      ML_TOKEN_SCOPE =
        dados.scope ||
        null;

      console.log(
        'OAuth concluído.'
      );

      console.log(
        'Usuário:',
        ML_USER_ID
      );

      console.log(
        'Scopes recebidos:',
        ML_TOKEN_SCOPE
      );

      const salvo =
        await salvarTokenNoBanco(
          ML_ACCESS_TOKEN,
          ML_REFRESH_TOKEN,
          ML_TOKEN_EXPIRES_AT,
          ML_USER_ID,
          ML_TOKEN_SCOPE
        );

      return res.json({

        sucesso:
          true,

        mensagem:
          salvo
            ? 'OAuth concluído e token salvo.'
            : 'OAuth concluído, mas token não foi salvo no Supabase.',

        token_recebido:
          Boolean(
            dados.access_token
          ),

        token_salvo:
          salvo,

        usuario_id:
          dados.user_id ||
          null,

        scope:
          dados.scope ||
          null,

        scopes_esperados:
          ML_OAUTH_SCOPE,

        expiracao_segundos:
          dados.expires_in ||
          null,
      });

    } catch (erro) {

      console.error(
        'Erro OAuth:',
        erro
      );

      return res.status(500).json({

        sucesso:
          false,

        erro:
          'Falha de comunicação com Mercado Livre.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CONVERTER ITEM
|--------------------------------------------------------------------------
*/

function converterItem(
  item: any
): ProdutoOfertasApp {

  const preco =
    Number(
      item?.price
    );

  const precoOriginal =
    item?.original_price != null
      ? Number(
          item.original_price
        )
      : null;

  let desconto =
    0;

  if (
    Number.isFinite(preco) &&
    Number.isFinite(precoOriginal) &&
    precoOriginal! > preco
  ) {

    desconto =
      Number(
        (
          (
            1 -
            preco /
              precoOriginal!
          ) *
          100
        ).toFixed(2)
      );
  }

  return {

    id:
      item?.id ||
      null,

    produtoId:
      item?.catalog_product_id ||
      null,

    nome:
      item?.title ||
      'Produto sem nome',

    plataforma:
      'Mercado Livre',

    preco:
      Number.isFinite(preco)
        ? preco
        : null,

    precoOriginal:
      Number.isFinite(
        precoOriginal
      )
        ? precoOriginal
        : null,

    desconto,

    moeda:
      item?.currency_id ||
      'BRL',

    vendedorId:
      item?.seller?.id ||
      item?.seller_id ||
      null,

    vendedor:
      item?.seller?.nickname ||
      null,

    condicao:
      item?.condition ||
      null,

    link:
      item?.permalink ||
      (
        item?.id
          ? `https://www.mercadolivre.com.br/p/${item.id}`
          : null
      ),

    imagem:
      item?.thumbnail ||
      item?.pictures?.[0]?.url ||
      null,

    quantidadeVendida:
      Number.isFinite(
        Number(
          item?.sold_quantity
        )
      )
        ? Number(
            item.sold_quantity
          )
        : 0,

    freteGratis:
      Boolean(
        item?.shipping
          ?.free_shipping
      ),

    categoriaId:
      item?.category_id ||
      null,

    catalogo:
      Boolean(
        item?.catalog_listing
      ),

    cidade:
      item?.address
        ?.city_name ||
      null,

    estado:
      item?.address
        ?.state_name ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| BUSCA /sites/MLB/search
|--------------------------------------------------------------------------
*/

async function pesquisarNoMercadoLivre(
  busca: string,
  token: string,
  limite: number,
  offset: number
) {

  const url =
    new URL(
      `${ML_API_BASE}/sites/${ML_SITE_ID}/search`
    );

  url.searchParams.set(
    'q',
    busca
  );

  url.searchParams.set(
    'limit',
    String(limite)
  );

  url.searchParams.set(
    'offset',
    String(offset)
  );

  url.searchParams.set(
    'sort',
    'price_asc'
  );

  return mercadoLivreGet(
    url.toString(),
    token
  );
}

/*
|--------------------------------------------------------------------------
| PRODUTOS
|--------------------------------------------------------------------------
*/

app.get(
  '/api/produtos',
  async (
    req: Request,
    res: ExpressResponse
  ) => {

    const busca =
      String(
        req.query.busca || ''
      ).trim();

    if (!busca) {

      return res.json({

        sucesso:
          true,

        busca:
          '',

        quantidade:
          0,

        total:
          0,

        offset:
          0,

        limite:
          20,

        temMais:
          false,

        proximoOffset:
          null,

        menorPreco:
          null,

        maiorPreco:
          null,

        produtos:
          [],
      });
    }

    let limite =
      Number(
        req.query.limite || 20
      );

    if (
      !Number.isFinite(limite)
    ) {
      limite = 20;
    }

    limite =
      Math.max(
        1,
        Math.min(
          Math.floor(limite),
          50
        )
      );

    let offset =
      Number(
        req.query.offset || 0
      );

    if (
      !Number.isFinite(offset) ||
      offset < 0
    ) {
      offset = 0;
    }

    offset =
      Math.floor(offset);

    let token =
      await garantirAccessToken();

    if (!token) {

      return res.status(401).json({

        sucesso:
          false,

        erro:
          'Mercado Livre não autorizado.',
      });
    }

    try {

      let resposta =
        await pesquisarNoMercadoLivre(
          busca,
          token,
          limite,
          offset
        );

      /*
       * TOKEN EXPIRADO
       */

      if (
        resposta.status === 401
      ) {

        invalidarAccessToken();

        token =
          await renovarAccessToken();

        if (!token) {

          return res.status(401).json({

            sucesso:
              false,

            erro:
              'Token inválido ou expirado.',
          });
        }

        resposta =
          await pesquisarNoMercadoLivre(
            busca,
            token,
            limite,
            offset
          );
      }

      const dados =
        await lerJson(
          resposta
        );

      /*
       * RATE LIMIT
       */

      if (
        resposta.status === 429
      ) {

        return res.status(429).json({

          sucesso:
            false,

          erro:
            'Limite de requisições do Mercado Livre atingido.',

          detalhes:
            dados,

          retry_after:
            resposta.headers.get(
              'retry-after'
            ),
        });
      }

      /*
       * FORBIDDEN
       */

      if (
        resposta.status === 403
      ) {

        return res.status(403).json({

          sucesso:
            false,

          erro:
            'Mercado Livre recusou o acesso à busca.',

          diagnostico:
            diagnosticar403(
              dados
            ),

          token_scope:
            ML_TOKEN_SCOPE,

          usuario_id:
            ML_USER_ID,

          detalhes:
            dados,
        });
      }

      /*
       * OUTROS ERROS
       */

      if (!resposta.ok) {

        return res.status(
          resposta.status
        ).json({

          sucesso:
            false,

          erro:
            'Não foi possível pesquisar produtos no Mercado Livre.',

          detalhes:
            dados,
        });
      }

      const resultados =
        Array.isArray(
          dados?.results
        )
          ? dados.results
          : [];

      const produtos =
        resultados
          .map(
            (
              item: any
            ) =>
              converterItem(
                item
              )
          )
          .filter(
            (
              produto: ProdutoOfertasApp
            ) =>
              typeof produto.preco ===
                'number' &&
              Number.isFinite(
                produto.preco
              ) &&
              produto.preco > 0
          );

      produtos.sort(
        (
          a,
          b
        ) =>
          (a.preco ?? 0) -
          (b.preco ?? 0)
      );

      const total =
        Number(
          dados?.paging?.total ||
            0
        );

      const quantidade =
        produtos.length;

      const proximoOffset =
        offset +
        quantidade;

      const temMais =
        proximoOffset <
        total;

      return res.json({

        sucesso:
          true,

        busca,

        quantidade,

        total,

        offset,

        limite,

        temMais,

        proximoOffset:
          temMais
            ? proximoOffset
            : null,

        menorPreco:
          produtos.length
            ? produtos[0].preco
            : null,

        maiorPreco:
          produtos.length
            ? produtos[
                produtos.length - 1
              ].preco
            : null,

        produtos,
      });

    } catch (erro) {

      console.error(
        'Erro /api/produtos:',
        erro
      );

      return res.status(500).json({

        sucesso:
          false,

        erro:
          'Falha de comunicação com Mercado Livre.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| TESTES DO MERCADO LIVRE
|--------------------------------------------------------------------------
*/

app.get(
  '/api/mercadolivre/testes',
  async (
    _req: Request,
    res: ExpressResponse
  ) => {

    const token =
      await garantirAccessToken();

    if (!token) {

      return res.status(401).json({

        sucesso:
          false,

        erro:
          'Mercado Livre não autorizado.',
      });
    }

    const resultados:
      any[] = [];

    /*
     * TESTE 1
     * /users/me
     */

    try {

      const resposta =
        await mercadoLivreGet(
          `${ML_API_BASE}/users/me`,
          token
        );

      const dados =
        await lerJson(
          resposta
        );

      resultados.push({

        endpoint:
          '/users/me',

        status:
          resposta.status,

        autorizado:
          resposta.ok,

        resposta:
          resposta.ok
            ? 'OK'
            : 'ERRO',

        detalhes:
          resposta.ok
            ? undefined
            : dados,
      });

    } catch {

      resultados.push({

        endpoint:
          '/users/me',

        status:
          0,

        autorizado:
          false,

        resposta:
          'ERRO DE COMUNICAÇÃO',
      });
    }

    /*
     * TESTE 2
     * /sites/MLB/search
     */

    try {

      const url =
        new URL(
          `${ML_API_BASE}/sites/${ML_SITE_ID}/search`
        );

      url.searchParams.set(
        'q',
        'iphone'
      );

      url.searchParams.set(
        'limit',
        '1'
      );

      url.searchParams.set(
        'sort',
        'price_asc'
      );

      const resposta =
        await mercadoLivreGet(
          url.toString(),
          token
        );

      const dados =
        await lerJson(
          resposta
        );

      const resultado:
        any = {

        endpoint:
          '/sites/MLB/search',

        status:
          resposta.status,

        autorizado:
          resposta.ok,

        resposta:
          resposta.ok
            ? 'OK'
            : 'ERRO',
      };

      if (
        resposta.status === 403
      ) {

        resultado.diagnostico =
          diagnosticar403(
            dados
          );
      }

      if (!resposta.ok) {

        resultado.detalhes =
          dados;
      }

      resultados.push(
        resultado
      );

    } catch {

      resultados.push({

        endpoint:
          '/sites/MLB/search',

        status:
          0,

        autorizado:
          false,

        resposta:
          'ERRO DE COMUNICAÇÃO',
      });
    }

    /*
     * TESTE 3
     * Aplicação
     */

    if (ML_CLIENT_ID) {

      try {

        const resposta =
          await mercadoLivreGet(
            `${ML_API_BASE}/applications/${ML_CLIENT_ID}`,
            token
          );

        const dados =
          await lerJson(
            resposta
          );

        resultados.push({

          endpoint:
            `/applications/${ML_CLIENT_ID}`,

          status:
            resposta.status,

          autorizado:
            resposta.ok,

          resposta:
            resposta.ok
              ? 'OK'
              : 'ERRO',

          detalhes:
            dados,
        });

      } catch {

        resultados.push({

          endpoint:
            '/applications/{APP_ID}',

          status:
            0,

          autorizado:
            false,

          resposta:
            'ERRO DE COMUNICAÇÃO',
        });
      }
    }

    /*
     * TESTE 4
     * GRANTS
     */

    if (ML_CLIENT_ID) {

      try {

        const resposta =
          await mercadoLivreGet(
            `${ML_API_BASE}/applications/${ML_CLIENT_ID}/grants`,
            token
          );

        const dados =
          await lerJson(
            resposta
          );

        resultados.push({

          endpoint:
            `/applications/${ML_CLIENT_ID}/grants`,

          status:
            resposta.status,

          autorizado:
            resposta.ok,

          resposta:
            resposta.ok
              ? 'OK'
              : 'ERRO',

          detalhes:
            dados,
        });

      } catch {

        resultados.push({

          endpoint:
            `/applications/${ML_CLIENT_ID}/grants`,

          status:
            0,

          autorizado:
            false,

          resposta:
            'ERRO DE COMUNICAÇÃO',
        });
      }
    }

    return res.json({

      sucesso:
        true,

      usuario_id:
        ML_USER_ID,

      token_scope:
        ML_TOKEN_SCOPE,

      scopes_esperados:
        ML_OAUTH_SCOPE,

      testes:
        resultados,
    });
  }
);

/*
|--------------------------------------------------------------------------
| INICIALIZAÇÃO
|--------------------------------------------------------------------------
*/

async function iniciarServidor() {

  await carregarTokenDoBanco();

  app.listen(
    PORT,
    '0.0.0.0',
    () => {

      console.log(
        `Ofertas API rodando na porta ${PORT}`
      );

      console.log(
        `Mercado Livre: ${ML_SITE_ID}`
      );

      console.log(
        `OAuth configurado: ${Boolean(
          ML_CLIENT_ID
        )}`
      );

      console.log(
        `Scopes OAuth: ${ML_OAUTH_SCOPE}`
      );

      console.log(
        `Supabase configurado: ${Boolean(
          supabase
        )}`
      );
    }
  );
}

iniciarServidor().catch(
  (erro) => {

    console.error(
      'Erro fatal ao iniciar API:',
      erro
    );

    process.exit(1);
  }
);