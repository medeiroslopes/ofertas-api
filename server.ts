import 'dotenv/config';
import express, {
  Request,
  Response,
} from 'express';
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

const ML_CLIENT_ID =
  process.env.ML_CLIENT_ID || '';

const ML_CLIENT_SECRET =
  process.env.ML_CLIENT_SECRET || '';

const ML_REDIRECT_URI =
  process.env.ML_REDIRECT_URI ||
  'https://ofertas-api-hzi5.onrender.com/auth/mercadolivre/callback';

const ML_API_BASE =
  'https://api.mercadolibre.com';

const ML_AUTH_BASE =
  'https://auth.mercadolivre.com.br';

/*
|--------------------------------------------------------------------------
| SUPABASE
|--------------------------------------------------------------------------
*/

const SUPABASE_URL =
  process.env.SUPABASE_URL || '';

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase =
  SUPABASE_URL &&
  SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      )
    : null;

console.log(
  `Supabase configurado: ${Boolean(supabase)}`
);

if (SUPABASE_URL) {
  console.log(
    `Projeto Supabase: ${SUPABASE_URL.substring(
      0,
      35
    )}...`
  );
}

/*
|--------------------------------------------------------------------------
| TOKENS EM MEMÓRIA
|--------------------------------------------------------------------------
*/

let ML_ACCESS_TOKEN:
  | string
  | null = null;

let ML_REFRESH_TOKEN:
  | string
  | null =
  process.env.ML_REFRESH_TOKEN || null;

let ML_TOKEN_EXPIRES_AT:
  | number
  | null = null;

let ML_USER_ID:
  | number
  | null = null;

/*
|--------------------------------------------------------------------------
| OAUTH STATES
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
| TIPOS AUXILIARES
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
| LIMPAR STATES ANTIGOS
|--------------------------------------------------------------------------
*/

function limparStatesAntigos() {
  const agora = Date.now();

  for (const [
    state,
    dados,
  ] of oauthStates.entries()) {
    if (
      agora - dados.createdAt >
      10 * 60 * 1000
    ) {
      oauthStates.delete(state);
    }
  }
}

/*
|--------------------------------------------------------------------------
| SALVAR TOKEN NO SUPABASE
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
      'Supabase não configurado.'
    );

    return false;
  }

  if (!accessToken) {
    console.error(
      'Access token não recebido.'
    );

    return false;
  }

  if (!refreshToken) {
    console.error(
      'Refresh token não recebido.'
    );

    return false;
  }

  try {
    const {
      data: registroExistente,
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
        'Erro ao verificar token existente:',
        erroBusca
      );

      return false;
    }

    const usuarioFinal =
      usuarioId ??
      ML_USER_ID ??
      null;

    const dados = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      usuario_id: usuarioFinal,
      atualizado_em:
        new Date().toISOString(),
    };

    if (registroExistente?.id) {
      const {
        error: erroAtualizacao,
      } = await supabase
        .from('mercado_livre_tokens')
        .update(dados)
        .eq(
          'id',
          registroExistente.id
        );

      if (erroAtualizacao) {
        console.error(
          'Erro ao atualizar token:',
          erroAtualizacao
        );

        return false;
      }

      console.log(
        'Token do Mercado Livre atualizado no Supabase.'
      );

      return true;
    }

    const {
      error: erroInsercao,
    } = await supabase
      .from('mercado_livre_tokens')
      .insert(dados);

    if (erroInsercao) {
      console.error(
        'Erro ao inserir token:',
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
      'Erro ao salvar token:',
      erro
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| CARREGAR TOKEN DO SUPABASE
|--------------------------------------------------------------------------
*/

async function carregarTokenDoBanco(): Promise<boolean> {
  if (!supabase) {
    console.error(
      'Supabase não configurado.'
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
      .order('id', {
        ascending: false,
      })
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
      'Erro ao acessar Supabase:',
      erro
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| RENOVAR ACCESS TOKEN
|--------------------------------------------------------------------------
*/

async function renovarAccessToken(): Promise<string | null> {
  if (
    !ML_REFRESH_TOKEN ||
    !ML_CLIENT_ID ||
    !ML_CLIENT_SECRET
  ) {
    console.error(
      'Não é possível renovar: credenciais ou refresh token ausentes.'
    );

    return null;
  }

  try {
    console.log(
      'Renovando token do Mercado Livre...'
    );

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
      (await resposta.json()) as MercadoLivreTokenResponse;

    if (!resposta.ok) {
      console.error(
        'Erro ao renovar token. HTTP:',
        resposta.status
      );

      return null;
    }

    if (!dados.access_token) {
      console.error(
        'Mercado Livre não retornou access token na renovação.'
      );

      return null;
    }

    /*
     * O Mercado Livre gera um NOVO refresh token.
     * É obrigatório substituir o antigo.
     */

    ML_ACCESS_TOKEN =
      dados.access_token;

    if (dados.refresh_token) {
      ML_REFRESH_TOKEN =
        dados.refresh_token;
    }

    if (dados.expires_in) {
      ML_TOKEN_EXPIRES_AT =
        Date.now() +
        Number(dados.expires_in) *
          1000;
    } else {
      ML_TOKEN_EXPIRES_AT =
        null;
    }

    if (dados.user_id) {
      ML_USER_ID =
        Number(dados.user_id);
    }

    const salvo =
      await salvarTokenNoBanco(
        ML_ACCESS_TOKEN,
        ML_REFRESH_TOKEN,
        ML_TOKEN_EXPIRES_AT,
        ML_USER_ID
      );

    if (!salvo) {
      console.error(
        'Token renovado, mas não foi possível salvá-lo no Supabase.'
      );

      return null;
    }

    console.log(
      'Token renovado e salvo no Supabase.'
    );

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
| GARANTIR ACCESS TOKEN
|--------------------------------------------------------------------------
*/

async function garantirAccessToken(): Promise<string | null> {
  /*
   * Se ainda está válido, usa o token atual.
   */

  if (
    ML_ACCESS_TOKEN &&
    ML_TOKEN_EXPIRES_AT &&
    Date.now() <
      ML_TOKEN_EXPIRES_AT -
        60_000
  ) {
    return ML_ACCESS_TOKEN;
  }

  /*
   * Se não existe nada em memória,
   * tenta carregar do Supabase.
   */

  if (
    !ML_ACCESS_TOKEN &&
    !ML_REFRESH_TOKEN
  ) {
    await carregarTokenDoBanco();
  }

  /*
   * Verifica novamente.
   */

  if (
    ML_ACCESS_TOKEN &&
    ML_TOKEN_EXPIRES_AT &&
    Date.now() <
      ML_TOKEN_EXPIRES_AT -
        60_000
  ) {
    return ML_ACCESS_TOKEN;
  }

  /*
   * Se temos refresh token, renova.
   */

  if (ML_REFRESH_TOKEN) {
    return renovarAccessToken();
  }

  /*
   * Última tentativa de carregar
   * diretamente do Supabase.
   */

  const carregou =
    await carregarTokenDoBanco();

  if (
    carregou &&
    ML_ACCESS_TOKEN
  ) {
    return ML_ACCESS_TOKEN;
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| LIMPAR TOKEN QUANDO MERCADO LIVRE REJEITAR
|--------------------------------------------------------------------------
*/

function invalidarAccessToken() {
  ML_ACCESS_TOKEN = null;
  ML_TOKEN_EXPIRES_AT = null;
}

/*
|--------------------------------------------------------------------------
| GET COM MERCADO LIVRE
|--------------------------------------------------------------------------
*/

async function mercadoLivreGet(
  url: string,
  accessToken: string
) {
  return fetch(url, {
    method: 'GET',

    headers: {
      Authorization:
        `Bearer ${accessToken}`,

      Accept:
        'application/json',
    },
  });
}

/*
|--------------------------------------------------------------------------
| ROTA PRINCIPAL
|--------------------------------------------------------------------------
*/

app.get(
  '/',
  (_req: Request, res: Response) => {
    return res.json({
      nome: 'Ofertas API',
      status: 'online',
      mensagem:
        'API do Ofertas App funcionando.',
    });
  }
);

/*
|--------------------------------------------------------------------------
| TESTE
|--------------------------------------------------------------------------
*/

app.get(
  '/api/teste',
  (_req: Request, res: Response) => {
    return res.json({
      sucesso: true,
      mensagem:
        'Backend funcionando corretamente.',
    });
  }
);

/*
|--------------------------------------------------------------------------
| STATUS DO MERCADO LIVRE
|--------------------------------------------------------------------------
*/

app.get(
  '/api/mercadolivre/status',
  async (_req: Request, res: Response) => {
    const accessToken =
      await garantirAccessToken();

    return res.json({
      sucesso: true,

      autorizado:
        Boolean(accessToken),

      usuario_id:
        ML_USER_ID,

      token_configurado:
        Boolean(
          ML_ACCESS_TOKEN ||
          ML_REFRESH_TOKEN
        ),

      supabase_configurado:
        Boolean(supabase),
    });
  }
);

/*
|--------------------------------------------------------------------------
| CONSULTAR USUÁRIO
|--------------------------------------------------------------------------
*/

app.get(
  '/api/mercadolivre/usuario',
  async (_req: Request, res: Response) => {
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
        await mercadoLivreGet(
          `${ML_API_BASE}/users/me`,
          accessToken
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        console.error(
          'Erro ao consultar usuário. HTTP:',
          resposta.status
        );

        if (
          resposta.status === 401
        ) {
          invalidarAccessToken();

          const novoToken =
            await renovarAccessToken();

          if (novoToken) {
            const novaResposta =
              await mercadoLivreGet(
                `${ML_API_BASE}/users/me`,
                novoToken
              );

            const novosDados =
              await novaResposta.json();

            if (novaResposta.ok) {
              return res.json({
                sucesso: true,
                usuario:
                  novosDados,
              });
            }
          }
        }

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

      if (dados.id) {
        ML_USER_ID =
          Number(dados.id);
      }

      return res.json({
        sucesso: true,
        usuario: dados,
      });
    } catch (erro) {
      console.error(
        'Erro ao consultar usuário:',
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
  async (_req: Request, res: Response) => {
    const accessToken =
      await garantirAccessToken();

    if (!accessToken) {
      return res.status(401).json({
        sucesso: false,
        erro:
          'Mercado Livre não autorizado.',
      });
    }

    if (!ML_CLIENT_ID) {
      return res.status(500).json({
        sucesso: false,
        erro:
          'ML_CLIENT_ID não configurado.',
      });
    }

    try {
      const resposta =
        await mercadoLivreGet(
          `${ML_API_BASE}/applications/${ML_CLIENT_ID}`,
          accessToken
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
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
        aplicacao: dados,
      });
    } catch (erro) {
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
| INICIAR OAUTH
|--------------------------------------------------------------------------
*/

app.get(
  '/auth/mercadolivre',
  (_req: Request, res: Response) => {
    if (!ML_CLIENT_ID) {
      return res.status(500).json({
        sucesso: false,
        erro:
          'ML_CLIENT_ID não configurado.',
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

    const authorizationUrl =
      new URL(
        `${ML_AUTH_BASE}/authorization`
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

    /*
     * PKCE
     */

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
| CALLBACK OAUTH
|--------------------------------------------------------------------------
*/

app.get(
  '/auth/mercadolivre/callback',
  async (
    req: Request,
    res: Response
  ) => {
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

    /*
     * Verifica parâmetros.
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

    const stateString =
      String(state);

    const oauthState =
      oauthStates.get(
        stateString
      );

    if (!oauthState) {
      return res.status(400).json({
        sucesso: false,
        erro:
          'state inválido ou expirado.',
      });
    }

    /*
     * State só pode ser utilizado uma vez.
     */

    oauthStates.delete(
      stateString
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
          'Credenciais do Mercado Livre não configuradas.',
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
        (await resposta.json()) as MercadoLivreTokenResponse;

      if (!resposta.ok) {
        console.error(
          'Erro OAuth Mercado Livre. HTTP:',
          resposta.status
        );

        return res.status(
          resposta.status
        ).json({
          sucesso: false,
          erro:
            'Mercado Livre recusou a autorização.',
          detalhes:
            dados,
        });
      }

      /*
       * Salva token em memória.
       */

      ML_ACCESS_TOKEN =
        dados.access_token || null;

      ML_REFRESH_TOKEN =
        dados.refresh_token || null;

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

      /*
       * Salva no Supabase.
       */

      const tokenSalvo =
        await salvarTokenNoBanco(
          ML_ACCESS_TOKEN,
          ML_REFRESH_TOKEN,
          ML_TOKEN_EXPIRES_AT,
          ML_USER_ID
        );

      /*
       * Não retorna nenhum token.
       */

      return res.json({
        sucesso: true,

        mensagem:
          tokenSalvo
            ? 'OAuth do Mercado Livre concluído e token salvo no Supabase.'
            : 'OAuth concluído, mas não foi possível salvar o token no Supabase.',

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
    } catch (erro) {
      console.error(
        'Erro no callback OAuth:',
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
| CONVERTER ITEM DO MERCADO LIVRE
|--------------------------------------------------------------------------
*/

function converterItem(
  item: any
): ProdutoOfertasApp {
  const preco =
    Number(item.price);

  const precoOriginal =
    item.original_price != null
      ? Number(
          item.original_price
        )
      : null;

  let desconto = 0;

  if (
    precoOriginal &&
    precoOriginal > preco
  ) {
    desconto =
      Number(
        (
          (1 -
            preco /
              precoOriginal) *
          100
        ).toFixed(2)
      );
  }

  return {
    id:
      item.id || null,

    produtoId:
      item.catalog_product_id ||
      null,

    nome:
      item.title ||
      'Produto sem nome',

    plataforma:
      'Mercado Livre',

    preco:
      Number.isFinite(preco)
        ? preco
        : null,

    precoOriginal:
      Number.isFinite(
        precoOriginal as number
      )
        ? precoOriginal
        : null,

    desconto,

    moeda:
      item.currency_id ||
      'BRL',

    vendedorId:
      item.seller?.id ||
      item.seller_id ||
      null,

    vendedor:
      item.seller?.nickname ||
      null,

    condicao:
      item.condition ||
      null,

    link:
      item.permalink ||
      (
        item.id
          ? `https://www.mercadolivre.com.br/p/${item.id}`
          : null
      ),

    imagem:
      item.thumbnail ||
      item.pictures?.[0]?.url ||
      null,

    quantidadeVendida:
      Number.isFinite(
        Number(
          item.sold_quantity
        )
      )
        ? Number(
            item.sold_quantity
          )
        : 0,

    freteGratis:
      Boolean(
        item.shipping
          ?.free_shipping
      ),

    categoriaId:
      item.category_id ||
      null,

    catalogo:
      Boolean(
        item.catalog_listing
      ),

    cidade:
      item.address
        ?.city_name ||
      null,

    estado:
      item.address
        ?.state_name ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| BUSCAR ITENS NO MERCADO LIVRE
|--------------------------------------------------------------------------
|
| Este é o mecanismo PRINCIPAL do Ofertas App.
|
| /sites/MLB/search
|
| Diferentemente de /products/search,
| aqui trabalhamos com anúncios reais.
|--------------------------------------------------------------------------
*/

async function pesquisarNoMercadoLivre(
  busca: string,
  accessToken: string,
  limite: number,
  offset: number
) {
  const buscaUrl =
    new URL(
      `${ML_API_BASE}/sites/MLB/search`
    );

  buscaUrl.searchParams.set(
    'q',
    busca
  );

  buscaUrl.searchParams.set(
    'limit',
    String(limite)
  );

  buscaUrl.searchParams.set(
    'offset',
    String(offset)
  );

  /*
   * Ordena do menor preço
   * para o maior.
   */

  buscaUrl.searchParams.set(
    'sort',
    'price_asc'
  );

  return mercadoLivreGet(
    buscaUrl.toString(),
    accessToken
  );
}

/*
|--------------------------------------------------------------------------
| API DE PRODUTOS
|--------------------------------------------------------------------------
*/

app.get(
  '/api/produtos',
  async (
    req: Request,
    res: Response
  ) => {
    const busca =
      String(
        req.query.busca || ''
      ).trim();

    if (!busca) {
      return res.json({
        sucesso: true,
        busca: '',
        quantidade: 0,
        total: 0,
        offset: 0,
        limite: 20,
        temMais: false,
        proximoOffset: null,
        menorPreco: null,
        maiorPreco: null,
        produtos: [],
      });
    }

    /*
     * Limite.
     */

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

    /*
     * Offset.
     */

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

    /*
     * Token.
     */

    let accessToken =
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
       * PRIMEIRA TENTATIVA
       */

      let resposta =
        await pesquisarNoMercadoLivre(
          busca,
          accessToken,
          limite,
          offset
        );

      /*
       * Se token expirou ou foi rejeitado,
       * renovamos e tentamos UMA vez.
       */

      if (
        resposta.status === 401
      ) {
        console.log(
          'Access token rejeitado. Tentando renovar...'
        );

        invalidarAccessToken();

        accessToken =
          await renovarAccessToken();

        if (!accessToken) {
          return res.status(401).json({
            sucesso: false,
            erro:
              'Token do Mercado Livre inválido ou expirado.',
          });
        }

        resposta =
          await pesquisarNoMercadoLivre(
            busca,
            accessToken,
            limite,
            offset
          );
      }

      const dados =
        await resposta.json();

      console.log(
        `Busca Mercado Livre /sites/MLB/search: HTTP ${resposta.status}`
      );

      /*
       * ERRO.
       */

      if (!resposta.ok) {
        console.error(
          'Erro na busca do Mercado Livre:',
          dados
        );

        return res.status(
          resposta.status
        ).json({
          sucesso: false,

          erro:
            'Não foi possível pesquisar produtos no Mercado Livre.',

          detalhes:
            dados,
        });
      }

      /*
       * RESULTADOS.
       */

      const resultados =
        Array.isArray(
          dados.results
        )
          ? dados.results
          : [];

      /*
       * Converte anúncios.
       */

      const produtos =
        resultados
          .map(
            (item: any) =>
              converterItem(item)
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

      /*
       * Ordenação local de segurança.
       */

      produtos.sort(
        (
          a: ProdutoOfertasApp,
          b: ProdutoOfertasApp
        ) =>
          (a.preco || 0) -
          (b.preco || 0)
      );

      /*
       * Total informado pelo Mercado Livre.
       */

      const total =
        Number(
          dados.paging?.total || 0
        );

      /*
       * Quantidade efetivamente
       * retornada.
       */

      const quantidade =
        produtos.length;

      /*
       * Próximo offset.
       */

      const proximoOffset =
        offset + quantidade;

      const temMais =
        proximoOffset <
        total;

      /*
       * Menor preço.
       */

      const menorPreco =
        produtos.length > 0
          ? produtos[0].preco
          : null;

      /*
       * Maior preço.
       */

      const maiorPreco =
        produtos.length > 0
          ? produtos[
              produtos.length - 1
            ].preco
          : null;

      /*
       * RESPOSTA.
       */

      return res.json({
        sucesso: true,

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

        menorPreco,

        maiorPreco,

        produtos,
      });
    } catch (erro) {
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
| TESTE DE ENDPOINTS DO MERCADO LIVRE
|--------------------------------------------------------------------------
|
| Esta rota é útil para diagnóstico.
|
| Não mostra tokens.
|--------------------------------------------------------------------------
*/

app.get(
  '/api/mercadolivre/testes',
  async (
    _req: Request,
    res: Response
  ) => {
    const accessToken =
      await garantirAccessToken();

    if (!accessToken) {
      return res.status(401).json({
        sucesso: false,
        erro:
          'Mercado Livre não autorizado.',
      });
    }

    const testes = [];

    /*
     * Teste /users/me
     */

    try {
      const resposta =
        await mercadoLivreGet(
          `${ML_API_BASE}/users/me`,
          accessToken
        );

      testes.push({
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
      });
    } catch {
      testes.push({
        endpoint:
          '/users/me',

        status: 0,

        autorizado: false,

        resposta:
          'ERRO DE COMUNICAÇÃO',
      });
    }

    /*
     * Teste /sites/MLB/search
     */

    try {
      const url =
        new URL(
          `${ML_API_BASE}/sites/MLB/search`
        );

      url.searchParams.set(
        'q',
        'iphone'
      );

      url.searchParams.set(
        'limit',
        '1'
      );

      const resposta =
        await mercadoLivreGet(
          url.toString(),
          accessToken
        );

      testes.push({
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
      });
    } catch {
      testes.push({
        endpoint:
          '/sites/MLB/search',

        status: 0,

        autorizado: false,

        resposta:
          'ERRO DE COMUNICAÇÃO',
      });
    }

    return res.json({
      sucesso: true,
      testes,
    });
  }
);

/*
|--------------------------------------------------------------------------
| INICIALIZAÇÃO
|--------------------------------------------------------------------------
*/

async function iniciarServidor() {
  /*
   * Carrega token salvo.
   */

  await carregarTokenDoBanco();

  /*
   * Inicia servidor.
   */

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



/*
|--------------------------------------------------------------------------
| TESTES DO MERCADO LIVRE
|--------------------------------------------------------------------------
*/

app.get(
  '/api/mercadolivre/testes',
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

    const resultados = [];

    /*
     * TESTE 1 — Usuário autenticado
     */
    try {
      const respostaUsuario =
        await fetch(
          'https://api.mercadolibre.com/users/me',
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
              Accept:
                'application/json',
            },
          }
        );

      resultados.push({
        endpoint: '/users/me',
        status:
          respostaUsuario.status,
        autorizado:
          respostaUsuario.ok,
        resposta:
          respostaUsuario.ok
            ? 'OK'
            : 'ERRO',
      });
    } catch (erro) {
      resultados.push({
        endpoint: '/users/me',
        status: 0,
        autorizado: false,
        resposta: 'ERRO DE COMUNICAÇÃO',
      });
    }

    /*
     * TESTE 2 — Busca pública de anúncios
     *
     * Este é o endpoint principal usado
     * pelo Ofertas App.
     */
    try {
      const url =
        new URL(
          'https://api.mercadolibre.com/sites/MLB/search'
        );

      url.searchParams.set(
        'q',
        'iphone'
      );

      url.searchParams.set(
        'limit',
        '1'
      );

      const respostaBusca =
        await fetch(
          url.toString(),
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
              Accept:
                'application/json',
            },
          }
        );

      resultados.push({
        endpoint:
          '/sites/MLB/search',
        status:
          respostaBusca.status,
        autorizado:
          respostaBusca.ok,
        resposta:
          respostaBusca.ok
            ? 'OK'
            : 'ERRO',
      });
    } catch (erro) {
      resultados.push({
        endpoint:
          '/sites/MLB/search',
        status: 0,
        autorizado: false,
        resposta: 'ERRO DE COMUNICAÇÃO',
      });
    }

    return res.json({
      sucesso: true,
      testes: resultados,
    });
  }
);



iniciarServidor().catch(
  (erro) => {
    console.error(
      'Erro fatal ao iniciar API:',
      erro
    );

    process.exit(1);
  }
);