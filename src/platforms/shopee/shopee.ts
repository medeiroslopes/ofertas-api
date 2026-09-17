import { Oferta } from "../../models/oferta";
import { Plataforma } from "../interfaces/plataforma";

export class Shopee implements Plataforma {
  nome = "Shopee";

  async buscarOfertas(): Promise<Oferta[]> {
    return [];
  }
}