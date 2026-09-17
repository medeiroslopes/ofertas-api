import { Oferta } from "../../models/oferta";

function limitarTitulo(titulo: string, limite = 70): string {
  if (titulo.length <= limite) {
    return titulo;
  }

  const trecho = titulo.substring(0, limite);
  const ultimoEspaco = trecho.lastIndexOf(" ");

  if (ultimoEspaco === -1) {
    return trecho.trimEnd() + "...";
  }

  return trecho.substring(0, ultimoEspaco).trimEnd() + "...";
}

export function formatarOferta(oferta: Oferta): string {
  const titulo = limitarTitulo(oferta.titulo);

  return `🔥 *OFERTA ${oferta.plataforma.toUpperCase()}*

🛍️ *${titulo}*

💰 *R$ ${oferta.preco.toFixed(2).replace(".", ",")}*

👉 *COMPRE AQUI:*
${oferta.linkAfiliado}

⚠️ Preço e disponibilidade podem mudar.`;
}
