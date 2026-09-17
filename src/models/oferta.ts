export interface Oferta {
  plataforma: string;
  titulo: string;
  preco: number;
  precoAnterior?: number;
  percentualDesconto?: number;
  imagem?: string;
  linkProduto: string;
  linkAfiliado: string;
  categoria?: string;
  disponivel: boolean;
}