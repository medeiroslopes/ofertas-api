export interface MercadoLivreAttribute {
  id?: string;
  name?: string;
  value_name?: string;
  values?: Array<{
    id?: string;
    name?: string;
  }>;
}

export interface MercadoLivreProduct {
  id: string;
  name?: string;
  title?: string;
  status?: string;
  parent_id?: string | null;
  children_ids?: string[];
  attributes?: MercadoLivreAttribute[];
  main_features?: Array<{
    text?: string;
    type?: string;
    value?: string;
  }>;
  short_description?: string | null;
  description?: string | null;
  domain_id?: string | null;
  category_id?: string | null;
  buy_box_winner?: any;
}

export interface MercadoLivreItem {
  id?: string;
  item_id?: string;
  title?: string;
  price?: number;
  seller_id?: number;
  catalog_product_id?: string | null;
  permalink?: string;
  condition?: string;
  available_quantity?: number;
}
