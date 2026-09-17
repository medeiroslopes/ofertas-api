import dotenv from "dotenv";

dotenv.config();

export async function enviarWhatsApp(
  numero: string,
  texto: string
) {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!baseUrl || !apiKey || !instance) {
    throw new Error(
      "Configuração da Evolution API incompleta no .env."
    );
  }

  const resposta = await fetch(
    `${baseUrl}/message/sendText/${instance}`,
    {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: numero,
        text: texto,
      }),
    }
  );

  const dados = await resposta.json();

  if (!resposta.ok) {
    const erro = new Error(
      `Evolution API retornou HTTP ${resposta.status}: ${JSON.stringify(dados)}`
    );

    (erro as any).response = {
      status: resposta.status,
      data: dados,
    };

    throw erro;
  }

  return dados;
}

export async function enviarImagemWhatsApp(
  numero: string,
  imagem: string,
  legenda: string
) {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!baseUrl || !apiKey || !instance) {
    throw new Error(
      "Configuração da Evolution API incompleta no .env."
    );
  }

  const resposta = await fetch(
    `${baseUrl}/message/sendMedia/${instance}`,
    {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: numero,
        mediatype: "image",
        mimetype: "image/jpeg",
        media: imagem,
        caption: legenda,
      }),
    }
  );

  const dados = await resposta.json();

  if (!resposta.ok) {
    const erro = new Error(
      `Evolution API retornou HTTP ${resposta.status}: ${JSON.stringify(dados)}`
    );

    (erro as any).response = {
      status: resposta.status,
      data: dados,
    };

    throw erro;
  }

  return dados;
}