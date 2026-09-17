export interface FiltrosProduto {
  textoLivre: string;
  modelo?: string;
  armazenamentoGb?: number;
  ramGb?: number;
  cor?: string;
  redes: string[];
}

export interface ProdutoConvertido {
  id: string;
  produtoId: string;
  nome: string;
  preco: number;
  vendedorId?: number;
  vendedorNome?: string;
  imagem?: string;
  link?: string;
  estoque?: number;
  condicao?: string;
  relevancia?: number;
}
