import { app, gerenciador } from './app.js';
import { env } from './config/env.js';
import { carregarTokenDoBanco } from './services/mercadoLivre/auth.service.js';
import { enviarOfertasAutomaticamente } from './services/agendamento/enviarOfertasAutomatico.js';
import { iniciarAgendador } from './services/agendamento/agendador.js';

async function iniciarServidor() {
  await carregarTokenDoBanco();

iniciarAgendador(
  () => gerenciador.buscarTodasAsOfertas()
);

  app.listen(
    env.port,
    '0.0.0.0',
    () => {
      console.log(
        `Ofertas API rodando na porta ${env.port}`
      );

      console.log(
        `Mercado Livre: ${env.mercadoLivre.siteId}`
      );

      console.log(
        'Supabase configurado: true'
      );
    }
  );
}

iniciarServidor().catch((erro) => {
  console.error(
    'Erro fatal ao iniciar API:',
    erro
  );

  process.exit(1);
});