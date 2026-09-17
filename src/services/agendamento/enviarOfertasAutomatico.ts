import { Oferta } from "../../models/oferta.js";
import { enviarImagemWhatsApp } from "../evolution.js";
import { formatarOferta } from "../ofertas/formatarOferta.js";

const GRUPO_WHATSAPP = "120363429898028985@g.us";

export async function enviarOfertasAutomaticamente(
  buscarOfertas: () => Promise<Oferta[]>
): Promise<void> {
  console.log("Iniciando envio automático de ofertas...");

  try {
    const ofertas = await buscarOfertas();

    if (ofertas.length === 0) {
      console.log("Nenhuma oferta encontrada.");
      return;
    }

    console.log(`Encontradas ${ofertas.length} ofertas.`);

    for (const oferta of ofertas) {
      const imagem =
        (oferta as any).imagens?.[0]?.secure_url ||
        oferta.imagem ||
        "";

      const mensagem = formatarOferta(oferta);

      console.log("Imagem da oferta:", imagem);

      await enviarImagemWhatsApp(
        GRUPO_WHATSAPP,
        imagem,
        mensagem
      );

      console.log(
        `Oferta enviada: ${oferta.titulo}`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 5000)
      );
    }

    console.log("Envio automático concluído.");
  } catch (error: any) {
    console.error(
      "Erro no envio automático:",
      error?.message || error
    );
  }
}