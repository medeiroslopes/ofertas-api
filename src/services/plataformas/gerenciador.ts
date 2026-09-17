import { Oferta } from "../../models/oferta";
import { Plataforma } from "../../platforms/interfaces/plataforma";

export class GerenciadorPlataformas {
  private plataformas: Plataforma[] = [];

  adicionarPlataforma(plataforma: Plataforma): void {
    this.plataformas.push(plataforma);
  }

  async buscarTodasAsOfertas(): Promise<Oferta[]> {
    const resultados = await Promise.all(
      this.plataformas.map((plataforma) =>
        plataforma.buscarOfertas()
      )
    );

    return resultados.flat();
  }
}