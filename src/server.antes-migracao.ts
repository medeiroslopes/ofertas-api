import { buscarProdutosMercadoLivre } from './services/mercadoLivre/catalogo.service.js';
import { garantirAccessToken } from './services/mercadoLivre/auth.service.js';
import express from "express";
import { enviarWhatsApp } from "./services/evolution";
import { GerenciadorPlataformas } from "./services/plataformas/gerenciador";
import { MercadoLivre } from "./platforms/mercadolivre/mercadolivre";
import { Shopee } from "./platforms/shopee/shopee";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "online",
    mensagem: "Ofertas API funcionando",
  });
});

app.post("/teste-whatsapp", async (req, res) => {
  try {
    const { numero, texto } = req.body;

    if (!numero || !texto) {
      return res.status(400).json({
        erro: "Informe numero e texto",
      });
    }

    const resultado = await enviarWhatsApp(numero, texto);

    res.json({
      sucesso: true,
      resultado,
    });
    } catch (error: any) {
    console.error("Erro ao enviar WhatsApp:", error.message);

    console.error(
      "Resposta da Evolution:",
      error.response?.data
    );

    res.status(error.response?.status || 500).json({
      sucesso: false,
      erro: error.message,
      detalhes: error.response?.data || null,
    });
  }
});

const gerenciador = new GerenciadorPlataformas();

gerenciador.adicionarPlataforma(new MercadoLivre());
gerenciador.adicionarPlataforma(new Shopee());

app.get("/api/mercadolivre/produtos", async (req, res) => {
  try {
    const consulta = String(req.query.q || "").trim();

    if (!consulta) {
      return res.status(400).json({
        sucesso: false,
        erro: "Informe o parametro q. Exemplo: ?q=celular",
      });
    }

    const dados = await buscarProdutosMercadoLivre(consulta);

    return res.json({
      sucesso: true,
      total: dados.results?.length || 0,
      produtos: dados.results || [],
    });
  } catch (error: any) {
    console.error(
      "Erro ao buscar produtos no Mercado Livre:",
      error.message
    );

    return res.status(500).json({
      sucesso: false,
      erro: error.message,
    });
  }
});

app.get("/api/mercadolivre/teste-token", async (req, res) => {
  try {
    const token = await garantirAccessToken();

    if (!token) {
      return res.status(500).json({
        sucesso: false,
        erro: "Nao foi possivel obter um access token.",
      });
    }

    const resposta = await fetch(
      "https://api.mercadolibre.com/users/me",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    const dados = await resposta.json();

    return res.status(resposta.status).json({
      sucesso: resposta.ok,
      statusMercadoLivre: resposta.status,
      usuarioId: dados.id || null,
      nickname: dados.nickname || null,
      erro: dados.error || null,
      mensagem: dados.message || null,
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error.message,
    });
  }
});

app.get("/api/mercadolivre/teste-aplicativo", async (req, res) => {
  try {
    const token = await garantirAccessToken();

    if (!token) {
      return res.status(500).json({
        sucesso: false,
        erro: "Nao foi possivel obter um access token.",
      });
    }

    const resposta = await fetch(
      "https://api.mercadolibre.com/applications/7816206091755726",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    const dados = await resposta.json();

    return res.status(resposta.status).json({
      sucesso: resposta.ok,
      statusMercadoLivre: resposta.status,
      id: dados.id || null,
      siteId: dados.site_id || null,
      ativo: dados.active ?? null,
      sandbox: dados.sandbox_mode ?? null,
      certificacao: dados.certification_status || null,
      scopes: dados.scopes || [],
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error.message,
    });
  }
});


app.get("/api/mercadolivre/teste-seller", async (req, res) => {
  try {
    const token = await garantirAccessToken();

    if (!token) {
      return res.status(500).json({
        sucesso: false,
        erro: "Nao foi possivel obter um access token.",
      });
    }

    const resposta = await fetch(
      "https://api.mercadolibre.com/sites/MLB/search?seller_id=1227677375",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    const dados = await resposta.json();

    return res.status(resposta.status).json({
      sucesso: resposta.ok,
      statusMercadoLivre: resposta.status,
      total: dados.results?.length || 0,
      produtos: dados.results || [],
      erro: dados.error || null,
      mensagem: dados.message || null,
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error.message,
    });
  }
});


app.get("/api/mercadolivre/teste-grants", async (req, res) => {
  try {
    const token = await garantirAccessToken();

    if (!token) {
      return res.status(500).json({
        sucesso: false,
        erro: "Nao foi possivel obter um access token.",
      });
    }

    const resposta = await fetch(
      "https://api.mercadolibre.com/applications/7816206091755726/grants",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    const dados = await resposta.json();

    return res.status(resposta.status).json({
      sucesso: resposta.ok,
      statusMercadoLivre: resposta.status,
      grants: dados,
    });
  } catch (error: any) {
    return res.status(500).json({
      sucesso: false,
      erro: error.message,
    });
  }
});


app.get("/api/mercadolivre/teste-item", async (req, res) => {
  try {
    const token = await garantirAccessToken();

    if (!token) {
      return res.status(500).json({
        sucesso: false,
        erro: "Nao foi possivel obter um access token.",
      });
    }

    const resposta = await fetch(
      "https://api.mercadolibre.com/items/MLB4620567101",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
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
      erro: error.message,
    });
  }
});


app.get("/plataformas", (req, res) => {
  res.json({
    plataformas: ["Mercado Livre", "Shopee"],
  });
});

app.get("/ofertas", async (req, res) => {
  try {
    const ofertas = await gerenciador.buscarTodasAsOfertas();

    res.json({
      sucesso: true,
      total: ofertas.length,
      ofertas,
    });
  } catch (error: any) {
    console.error("Erro ao buscar ofertas:", error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.message,
    });
  }
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Ofertas API rodando na porta ${PORT}`);
});
