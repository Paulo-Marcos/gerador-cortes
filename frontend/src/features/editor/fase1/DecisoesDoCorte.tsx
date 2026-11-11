import type { ReactNode } from 'react';
import type { Corte, Desvio } from '@/types/models';
import { formatarDuracao } from '@/lib/utils';
import { medirFicaESai } from '../timeUtils';
import { naoESilencioDoApp } from './silencioDoCorte';

// D-1089 (E6, canvas `03-cortes-proposta`): a aba "Trechos" virou "Decisões". O
// operador não revisa uma lista: responde perguntas sobre o corte, uma sob a outra,
// numeradas na ordem em que se decide — 1 o silêncio, 2 os desvios de assunto, 3 o
// som. Cada pergunta diz no título quanto sai, para decidir sem abrir o bloco.
//
// Esta moldura é só o lugar: cada pergunta tem a sua demanda (silêncio D-1093,
// som D-1095) e entra aqui como um `PerguntaDaDecisao` com o seu número.

/** A coluna das perguntas. A rolagem é dela: com três perguntas, nenhuma rola sozinha. */
export function DecisoesDoCorte({ children }: { children: ReactNode }) {
  return (
    <div aria-label="Decisões do corte" className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 py-2">
      {children}
    </div>
  );
}

interface PerguntaDaDecisaoProps {
  numero: number;
  /** A pergunta, como o operador a responde: "Tirar os desvios de assunto?". */
  pergunta: string;
  /** O que a resposta muda, ao lado do título: "sai 2:11". */
  resumo?: string;
  /** O assunto, para o leitor de tela: "os desvios de assunto". */
  assunto: string;
  children: ReactNode;
}

export function PerguntaDaDecisao({ numero, pergunta, resumo, assunto, children }: PerguntaDaDecisaoProps) {
  return (
    // `flex-none`: na coluna que rola, a pergunta tem a altura do que mostra, sem encolher.
    <section
      aria-label={`Pergunta sobre ${assunto}`}
      className="flex flex-none flex-col rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)]"
    >
      <header className="flex items-baseline gap-2 px-3 pb-0.5 pt-2.5">
        <h3 className="m-0 min-w-0 flex-1 text-[13px] font-semibold text-[var(--wb-text)]">
          {numero} · {pergunta}
        </h3>
        {resumo ? (
          <span
            className="flex-none font-code text-[11px] font-semibold text-[var(--wb-text-mute)]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {resumo}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

interface PerguntaDosDesviosProps {
  /** A janela do corte na tela (o corteUI, com o I e o O ainda não salvos), a mesma da faixa. */
  corte?: Pick<Corte, 'inicio_seg' | 'fim_seg'>;
  desvios: Desvio[];
  children: ReactNode;
}

/**
 * Pergunta 2 (P10). O tempo do título conta uma vez o trecho que cai dentro de outro.
 * D-1093: o silêncio do app é da pergunta 1 e não entra aqui.
 * D-1105: a conta e o formato são os da faixa "O bruto vai ter" (medirFicaESai), para a
 * mesma tela não dar dois números ao mesmo sai: recorta pela janela do corte e fecha
 * a conta com o bruto exibido. A janela é a da tela, não a salva (`useCorte`): com o I
 * marcado e ainda não salvo, a faixa já recorta pela nova.
 */
export function PerguntaDosDesvios({ corte, desvios, children }: PerguntaDosDesviosProps) {
  const saiSeg = corte ? medirFicaESai(corte.inicio_seg, corte.fim_seg, desvios.filter(naoESilencioDoApp)).saiSeg : 0;
  const sai = saiSeg > 0 ? `sai ${formatarDuracao(saiSeg)}` : undefined;
  return (
    <PerguntaDaDecisao numero={2} pergunta="Tirar os desvios de assunto?" resumo={sai} assunto="os desvios de assunto">
      {children}
    </PerguntaDaDecisao>
  );
}
