import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

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

app.get('/api/produtos', (req, res) => {
  const busca = String(req.query.busca || '').toLowerCase();

  const produtos = [
    {
      id: '1',
      nome: 'Fone Bluetooth Sem Fio',
      plataforma: 'Mercado Livre',
      preco: 79.90,
      precoAnterior: 99.90,
      avaliacao: 4.8,
      linkAfiliado: 'https://exemplo.com/oferta-1',
    },
    {
      id: '2',
      nome: 'Fone Bluetooth Esportivo',
      plataforma: 'Shopee',
      preco: 59.90,
      precoAnterior: 89.90,
      avaliacao: 4.7,
      linkAfiliado: 'https://exemplo.com/oferta-2',
    },
    {
      id: '3',
      nome: 'Fone de Ouvido Bluetooth',
      plataforma: 'Mercado Livre',
      preco: 69.90,
      precoAnterior: 94.90,
      avaliacao: 4.9,
      linkAfiliado: 'https://exemplo.com/oferta-3',
    },
  ];

  const resultados = produtos.filter((produto) =>
    produto.nome.toLowerCase().includes(busca)
  );

  res.json({
    sucesso: true,
    busca,
    quantidade: resultados.length,
    produtos: resultados,
  });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ofertas API rodando na porta ${PORT}`);
});