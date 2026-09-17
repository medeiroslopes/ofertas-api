export async function mercadoLivreGet(
  url: string,
  accessToken: string
): Promise<Response> {
  return fetch(
    url,
    {
      method: 'GET',

      headers: {
        Authorization:
          `Bearer ${accessToken}`,

        Accept:
          'application/json',
      },
    }
  );
}
