import { Oferta } from "../../models/oferta";
import { Plataforma } from "../interfaces/plataforma";
import { buscarMeusProdutosMercadoLivre } from "../../services/mercadoLivre/produtos.service.js";
import { obterLinkAfiliado } from "../../services/mercadoLivre/afiliados.service.js";


export class MercadoLivre implements Plataforma {
  nome = "Mercado Livre";

  async buscarOfertas(): Promise<Oferta[]> {
    const produtos = await buscarMeusProdutosMercadoLivre();

    return produtos
      .filter((produto) => produto.status === "active")
      .map((produto) => ({
        plataforma: this.nome,
        titulo: produto.title,
        preco: produto.price,
        imagem: produto.thumbnail,
        imagens: produto.pictures,
        linkProduto: produto.permalink,
        linkAfiliado: obterLinkAfiliado(produto.id),
        disponivel:
          produto.status === "active" &&
          (produto.available_quantity ?? 0) > 0,
      }));
  }
}