import { Oferta } from "../../models/oferta";

export interface Plataforma {
  nome: string;

  buscarOfertas(): Promise<Oferta[]>;
}