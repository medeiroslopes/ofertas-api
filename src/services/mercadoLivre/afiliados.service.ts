const linksAfiliados: Record<string, string> = {
  MLB7552204902: "https://meli.la/29Yfc1f",
  MLB5158364029: "https://meli.la/1jTMEfa",
  MLB5158218501: "https://meli.la/1LPEt1v",
  MLB7551850646: "https://meli.la/1MUkWg3",
  MLB5161308625: "https://meli.la/27RtQDZ",
  MLB5161234551: "https://meli.la/1aQhwK1",
  MLB5161232853: "https://meli.la/29rVG3x",
  MLB5184762383: "https://meli.la/34mHhDz",
  MLB5189152033: "https://meli.la/1sM3FVW",
  MLB5189152027: "https://meli.la/1cLv6Wh",
  MLB7552200358: "https://meli.la/222T2ft",
};

export function obterLinkAfiliado(
  produtoId: string
): string {
  return linksAfiliados[produtoId] || "";
}