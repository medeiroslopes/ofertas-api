import { enviarOfertasAutomaticamente } from "./services/agendamento/enviarOfertasAutomatico.js";
import express from 'express';

import { buscarProdutosMercadoLivre } from './services/mercadoLivre/catalogo.service.js';
import { garantirAccessToken } from './services/mercadoLivre/auth.service.js';
import {
  enviarWhatsApp,
  enviarImagemWhatsApp,
} from "./services/evolution.js";
import { GerenciadorPlataformas } from './services/plataformas/gerenciador.js';
import { MercadoLivre } from './platforms/mercadolivre/mercadolivre.js';
import { Shopee } from './platforms/shopee/shopee.js';

import {
  gerarUrlAutorizacaoMercadoLivre,
  processarCallbackOAuthMercadoLivre,
} from './services/mercadoLivre/oauth.service.js';

import { obterDadosToken } from './services/mercadoLivre/auth.service.js';
import { buscarMeusProdutosMercadoLivre } from './services/mercadoLivre/produtos.service.js';
import { formatarOferta } from "./services/ofertas/formatarOferta.js";
import { obterLinkAfiliado } from "./services/mercadoLivre/afiliados.service.js";

export const app = express();

app.use(express.json());

/*
|--------------------------------------------------------------------------
| ROTA PRINCIPAL
|--------------------------------------------------------------------------
*/

app.get('/', (_req, res) => {
  res.json({
    nome: 'Ofertas API',
    status: 'online',
    mensagem: 'API do Ofertas App funcionando.',
    versao: 'busca-catalogo-3.0',
  });
});

/*
|--------------------------------------------------------------------------
| OAUTH MERCADO LIVRE
|--------------------------------------------------------------------------
*/

app.get('/auth/mercadolivre', async (_req, res) => {
  try {
    const url = await gerarUrlAutorizacaoMercadoLivre();

    return res.redirect(url);
  } catch (error: any) {
    console.error(
      'Erro iniciando OAuth Mercado Livre:',
      error.message
    );

    return res.status(500).json({
      sucesso: false,
      erro:
        'Não foi possível iniciar a autorização do Mercado Livre.',
    });
  }
});

app.get('/auth/mercadolivre/callback', async (req, res) => {
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
        descricao: error_description
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
        erro: 'code ou state não recebido.',
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
  } catch (error: any) {
    console.error(
      'Erro no callback OAuth Mercado Livre:',
      error.message
    );

    return res.status(400).json({
      sucesso: false,
      erro: error.message,
    });
  }
});

/*
|--------------------------------------------------------------------------
| STATUS DO TOKEN
|--------------------------------------------------------------------------
*/

app.get('/api/mercadolivre/status', (_req, res) => {
  res.json({
    sucesso: true,
    ...obterDadosToken(),
  });
});

/*
|--------------------------------------------------------------------------
| BUSCA DE PRODUTOS MERCADO LIVRE
|--------------------------------------------------------------------------
*/

app.get('/api/mercadolivre/produtos', async (req, res) => {
  try {
    const consulta =
      String(req.query.q || '').trim();

    if (!consulta) {
      return res.status(400).json({
        sucesso: false,
        erro:
          'Informe o parametro q. Exemplo: ?q=celular',
      });
    }

    const dados =
      await buscarProdutosMercadoLivre(consulta);

    return res.json({
      sucesso: true,
      total: dados.results?.length || 0,
      produtos: dados.results || [],
    });
  } catch (error: any) {
    console.error(
      'Erro ao buscar produtos no Mercado Livre:',
      error.message
    );

    return res.status(500).json({
      sucesso: false,
      erro: error.message,
    });
  }
});

/*
|--------------------------------------------------------------------------
| TESTE DO TOKEN MERCADO LIVRE
|--------------------------------------------------------------------------
*/

app.get(
  '/api/mercadolivre/teste-token',
  async (_req, res) => {
    try {
      const token =
        await garantirAccessToken();

      if (!token) {
        return res.status(500).json({
          sucesso: false,
          erro:
            'Nao foi possivel obter um access token.',
        });
      }

      const resposta = await fetch(
        'https://api.mercadolibre.com/users/me',
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
            Accept:
              'application/json',
          },
        }
      );

      const dados =
        await resposta.json();

      return res.status(
        resposta.status
      ).json({
        sucesso:
          resposta.ok,
        statusMercadoLivre:
          resposta.status,
        usuarioId:
          dados.id || null,
        nickname:
          dados.nickname || null,
        erro:
          dados.error || null,
        mensagem:
          dados.message || null,
      });
    } catch (error: any) {
      return res.status(500).json({
        sucesso: false,
        erro: error.message,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| PLATAFORMAS
|--------------------------------------------------------------------------
*/

export const gerenciador =
  new GerenciadorPlataformas();

gerenciador.adicionarPlataforma(
  new MercadoLivre()
);

gerenciador.adicionarPlataforma(
  new Shopee()
);

app.get('/plataformas', (_req, res) => {
  res.json({
    plataformas: [
      'Mercado Livre',
      'Shopee',
    ],
  });
});

/*
|--------------------------------------------------------------------------
| OFERTAS
|--------------------------------------------------------------------------
*/

app.get('/ofertas', async (_req, res) => {
  try {
    const ofertas =
      await gerenciador.buscarTodasAsOfertas();

    return res.json({
      sucesso: true,
      total: ofertas.length,
      ofertas,
    });
  } catch (error: any) {
    console.error(
      'Erro ao buscar ofertas:',
      error.message
    );

    return res.status(500).json({
      sucesso: false,
      erro: error.message,
    });
  }
});


app.get("/teste-formatar-oferta", async (_req, res) => {
  try {
    const produtos = await buscarMeusProdutosMercadoLivre();

    const produto = produtos.find(
      (item) => item.status === "active"
    );

    if (!produto) {
      return res.status(404).json({
        sucesso: false,
        erro: "Nenhum produto ativo encontrado.",
      });
    }

    const oferta = {
      plataforma: "Mercado Livre",
      titulo: produto.title,
      preco: produto.price,
      imagem: produto.thumbnail,
      linkProduto: produto.permalink,
      linkAfiliado: obterLinkAfiliado(produto.id),
      disponivel:
        produto.status === "active" &&
        (produto.available_quantity ?? 0) > 0,
    };

    return res.json({
      sucesso: true,
      mensagem: formatarOferta(oferta),
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error?.message || "Erro ao formatar oferta.",
    });
  }
});


app.get("/teste-enviar-oferta", async (_req, res) => {
  try {
    const produtos = await buscarMeusProdutosMercadoLivre();

    const produto = produtos.find(
      (item) => item.status === "active"
    );

    if (!produto) {
      return res.status(404).json({
        sucesso: false,
        erro: "Nenhum produto ativo encontrado.",
      });
    }

    const oferta = {
      plataforma: "Mercado Livre",
      titulo: produto.title,
      preco: produto.price,
      imagem: produto.thumbnail,
      linkProduto: produto.permalink,
      linkAfiliado: obterLinkAfiliado(produto.id),
      disponivel:
        produto.status === "active" &&
        (produto.available_quantity ?? 0) > 0,
    };

    const mensagem = formatarOferta(oferta);

    const resultado = await enviarImagemWhatsApp(
       "120363429898028985@g.us",
       produto.pictures?.[0]?.secure_url || produto.thumbnail || "",
       mensagem
    );

    return res.json({
      sucesso: true,
      mensagem,
      whatsapp: resultado,
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error?.message || "Erro ao enviar oferta.",
    });
  }
});


app.get("/teste-imagem-alta", async (_req, res) => {
  try {
    const produtos = await buscarMeusProdutosMercadoLivre();

    const produto = produtos.find(
      (item) => item.id === "MLB7552204902"
    );

    if (!produto) {
      return res.status(404).json({
        sucesso: false,
        erro: "Produto não encontrado.",
      });
    }

    return res.json({
      sucesso: true,
      produto: produto.title,
      imagens: produto.pictures,
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error?.message || "Erro ao buscar imagem.",
    });
  }
});


/*
|--------------------------------------------------------------------------
| TESTE WHATSAPP
|--------------------------------------------------------------------------
*/


app.get('/api/mercadolivre/teste-item', async (req, res) => {
  try {
    const token = await garantirAccessToken();

    if (!token) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Nao foi possivel obter um access token.',
      });
    }

    const resposta = await fetch(
      'https://api.mercadolibre.com/items/MLB7552204902',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
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
      erro: error?.message || 'Erro ao consultar item.',
    });
  }
});


app.get('/api/mercadolivre/teste-produtos-service', async (_req, res) => {
  try {
    const produtos = await buscarMeusProdutosMercadoLivre();

    return res.json({
      sucesso: true,
      quantidade: produtos.length,
      produtos,
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error?.message || 'Erro ao buscar produtos do Mercado Livre.',
    });
  }
});


app.get('/api/mercadolivre/teste-meus-itens', async (_req, res) => {
  try {
    const token = await garantirAccessToken();

    if (!token) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Nao foi possivel obter um access token.',
      });
    }

    const resposta = await fetch(
      'https://api.mercadolibre.com/users/1227677375/items/search',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
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
      erro: error?.message || 'Erro ao consultar anúncios.',
    });
  }
});


app.get('/api/mercadolivre/teste-aplicativo', async (_req, res) => {
  try {
    const token = await garantirAccessToken();

    if (!token) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Nao foi possivel obter um access token.',
      });
    }

    const resposta = await fetch(
      'https://api.mercadolibre.com/applications/7816206091755726',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
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
      erro: error?.message || 'Erro ao consultar aplicação.',
    });
  }
});



app.get('/api/mercadolivre/teste-rede', async (_req, res) => {
  try {
    const resposta = await fetch(
      'https://api.mercadolibre.com/sites/MLB'
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
      erro: error?.message || 'Erro ao acessar Mercado Livre.',
    });
  }
});


app.post('/teste-whatsapp', async (req, res) => {
  try {
    const {
      numero,
      texto,
    } = req.body;

    if (!numero || !texto) {
      return res.status(400).json({
        erro:
          'Informe numero e texto',
      });
    }

    const resultado =
      await enviarWhatsApp(
        numero,
        texto
      );

    return res.json({
      sucesso: true,
      resultado,
    });
  } catch (error: any) {
    console.error(
      'Erro ao enviar WhatsApp:',
      error.message
    );

    return res.status(
      error.response?.status || 500
    ).json({
      sucesso: false,
      erro: error.message,
      detalhes:
        error.response?.data || null,
    });
  }
});


app.get("/enviar-ofertas", async (_req, res) => {
  try {
    await enviarOfertasAutomaticamente(
      () => gerenciador.buscarTodasAsOfertas()
    );

    return res.json({
      sucesso: true,
      mensagem: "Envio de ofertas iniciado com sucesso.",
    });
  } catch (error: any) {
    console.error(
      "Erro ao enviar ofertas:",
      error?.message || error
    );

    return res.status(500).json({
      sucesso: false,
      erro:
        error?.message ||
        "Erro ao enviar ofertas.",
    });
  }
});


app.get('/teste-imagem-direta', async (_req, res) => {
  try {
    const resultado = await enviarImagemWhatsApp(
      '120363429898028985@g.us',
      'https://http2.mlstatic.com/D_NQ_NP_951368-MLA99448150650_112025-F.jpg',
      'Teste de imagem direta'
    );

    return res.json({
      sucesso: true,
      resultado,
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error?.message || 'Erro ao enviar imagem direta.',
    });
  }
});