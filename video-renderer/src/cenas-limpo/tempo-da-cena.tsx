import { createContext, useContext, type CSSProperties, type FC, type ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { estadoDaLinha, opacidadeDeSaida } from "./movimento";

/**
 * D-918: o tempo da cena para o movimento do limpo.
 *
 * `ContinuidadeContext` vem da linha do tempo (OverlayTimelineV2): diz se a
 * cena continua a anterior ou a próxima (o morph). `TempoDaCenaContext` é
 * montado pelo enquadramento de cada cena, com o fim já em quadros.
 */
export interface Continuidade {
  daAnterior: boolean;
  naProxima: boolean;
}

export const SEM_CONTINUIDADE: Continuidade = { daAnterior: false, naProxima: false };

export const ContinuidadeContext = createContext<Continuidade>(SEM_CONTINUIDADE);

export const useContinuidade = (): Continuidade => useContext(ContinuidadeContext);

export interface TempoDaCena extends Continuidade {
  /** Quadros da cena em tela (a barra inferior já vem limitada a 4 s). */
  fim: number;
}

export const TempoDaCenaContext = createContext<TempoDaCena>({ ...SEM_CONTINUIDADE, fim: Number.MAX_SAFE_INTEGER });

export const useTempoDaCena = (): TempoDaCena & { quadro: number } => ({
  ...useContext(TempoDaCenaContext),
  quadro: useCurrentFrame(),
});

/** Uma linha do texto: entra na vez dela (subindo 10 px) e sai junto com a cena. */
export const Linha: FC<{ indice: number; children: ReactNode; style?: CSSProperties }> = ({
  indice,
  children,
  style,
}) => {
  const { quadro, fim } = useTempoDaCena();
  const entrada = estadoDaLinha(quadro, indice);
  // O texto sempre sai: no morph é ele que troca, e só o traço fica.
  const saida = opacidadeDeSaida(quadro, fim);
  return (
    <div style={{ ...style, opacity: Math.min(entrada.opacidade, saida), transform: `translateY(${entrada.subida}px)` }}>
      {children}
    </div>
  );
};
