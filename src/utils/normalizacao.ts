export function normalizarTexto(
  texto: string
): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9\s]/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .replace(
      /(\d+)\s+(gb|tb|mb|ghz|mah|w|v)\b/g,
      '$1$2'
    )
    .trim();
}

export function tokensDaBusca(
  busca: string
): string[] {
  return normalizarTexto(
    busca
  )
    .split(' ')
    .filter(
      (token) =>
        token.length >= 2
    );
}