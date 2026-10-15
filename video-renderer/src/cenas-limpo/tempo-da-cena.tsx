import { createContext, useContext, type CSSProperties, type FC, type ReactNode } from "react";
import { useGlobalFrame } from "../frame-context";
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
  /** D-926: o quadro em que a cena começa, no relógio global do vídeo. */
  inicio: number;
}

export const TempoDaCenaContext = createContext<TempoDaCena>({
  ...SEM_CONTINUIDADE,
  fim: Number.MAX_SAFE_INTEGER,
  inicio: 0,
});

/**
 * D-926: o quadro DENTRO da cena (0 no começo dela), como as cenas de sempre
 * medem (`useGlobalFrame() - inicio`). Contar com o quadro cru só dava certo
 * dentro de uma `<Sequence>` (o render em pedaços); na prévia do editor e no
 * Studio o quadro é o do vídeo inteiro, e todo card que começava depois da
 * própria duração se dava por terminado e não aparecia.
 */
export const useQuadroDaCena = (inicio: number): number => useGlobalFrame() - inicio;

export const useTempoDaCena = (): TempoDaCena & { quadro: number } => {
  const tempo = useContext(TempoDaCenaContext);
  return { ...tempo, quadro: useQuadroDaCena(tempo.inicio) };
};

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
