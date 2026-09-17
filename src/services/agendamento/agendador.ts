import { enviarOfertasAutomaticamente } from "./enviarOfertasAutomatico.js";
import { Oferta } from "../../models/oferta.js";

const HORARIOS = [
  "08:00",
  "12:00",
  "15:00",
  "18:00",
  "21:00",
];

let ultimoEnvio = "";

export function iniciarAgendador(
  buscarOfertas: () => Promise<Oferta[]>
): void {
  console.log(
    `Agendador iniciado. Horários: ${HORARIOS.join(", ")}`
  );

  setInterval(async () => {
    const agora = new Date();

    const hora = String(
      agora.getHours()
    ).padStart(2, "0");

    const minuto = String(
      agora.getMinutes()
    ).padStart(2, "0");

    const horarioAtual = `${hora}:${minuto}`;

    const ano = agora.getFullYear();
    const mes = String(
      agora.getMonth() + 1
    ).padStart(2, "0");
    const dia = String(
      agora.getDate()
    ).padStart(2, "0");

    const dataAtual = `${ano}-${mes}-${dia}`;

    const identificador =
      `${dataAtual} ${horarioAtual}`;

    if (
      HORARIOS.includes(horarioAtual) &&
      ultimoEnvio !== identificador
    ) {
      ultimoEnvio = identificador;

      console.log(
        `Horário ${horarioAtual} atingido. Iniciando envio...`
      );

      await enviarOfertasAutomaticamente(
        buscarOfertas
      );
    }
  }, 30_000);
}