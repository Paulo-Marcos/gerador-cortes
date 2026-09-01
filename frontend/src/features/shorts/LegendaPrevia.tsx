import { useMemo } from 'react';
import { paginaEm, paginasDoTrecho, SAFE_ZONE } from './previaLegenda';
import type { PalavraTranscrita } from './shortsApi';

// D-479: a legenda desenhada por cima do player, como sairá no arquivo.
//
// Fica DENTRO da janela 9:16 (o componente é posicionado pelo pai sobre ela),
// e não sobre o quadro 16:9 inteiro: no arquivo final a legenda vive no
// vertical, e mostrá-la centrada no horizontal seria prometer um enquadramento
// que o render não entrega.
//
// O estilo imita `LegendaShort.tsx` do renderer — contorno em vez de caixa
// (caixa esconde o vídeo, e o vídeo é o que segura o dedo), realce na palavra
// corrente, dentro da safe zone. É imitação declarada, não coincidência: a
// prévia serve para julgar legibilidade e quebra de linha, e as duas dependem
// disso. A QUEBRA em si não é imitada — vem da mesma função do render.

interface Props {
  palavras: PalavraTranscrita[];
  /** Bordas do short, na timeline do bruto. */
  inicioSeg: number;
  fimSeg: number;
  /** Onde o player está, na timeline do bruto. */
  tempoAtualSeg: number;
}

export function LegendaPrevia({ palavras, inicioSeg, fimSeg, tempoAtualSeg }: Props) {
  const paginas = useMemo(
    () => paginasDoTrecho(palavras, inicioSeg, fimSeg),
    [palavras, inicioSeg, fimSeg],
  );

  // O tempo do player corre na timeline do BRUTO; as páginas nascem rebaseadas
  // ao zero do short. Sem esta subtração a legenda apareceria minutos adiante
  // — o mesmo erro que a `transcricao_final` já resolveu no corte.
  const pagina = paginaEm(paginas, tempoAtualSeg - inicioSeg);
  if (!pagina) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 text-center"
      style={{ bottom: `${SAFE_ZONE * 100}%` }}
      aria-hidden
    >
      <p
        className="mx-auto font-display text-[clamp(11px,2.6cqw,26px)] font-extrabold leading-[1.18] tracking-[-0.01em]"
        style={{
          width: '84%',
          textShadow:
            '0 2px 0 rgba(0,0,0,0.85), 0 -2px 0 rgba(0,0,0,0.85), 2px 0 0 rgba(0,0,0,0.85), -2px 0 0 rgba(0,0,0,0.85), 0 6px 18px rgba(0,0,0,0.55)',
        }}
      >
        {pagina.tokens.map((token, indice) => {
          const noShort = tempoAtualSeg - inicioSeg;
          const corrente = noShort >= token.deSeg && noShort < token.ateSeg;
          return (
            <span
              key={`${token.deSeg}-${indice}`}
              style={{
                whiteSpace: 'pre',
                color: corrente ? 'var(--wb-accent)' : '#ffffff',
              }}
            >
              {token.texto}
            </span>
          );
        })}
      </p>
    </div>
  );
}
