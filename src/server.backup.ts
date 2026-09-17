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

    res.status(500).json({
      sucesso: false,
      erro: error.message,
    });
  }
});

const gerenciador = new GerenciadorPlataformas();

gerenciador.adicionarPlataforma(new MercadoLivre());
gerenciador.adicionarPlataforma(new Shopee());

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
