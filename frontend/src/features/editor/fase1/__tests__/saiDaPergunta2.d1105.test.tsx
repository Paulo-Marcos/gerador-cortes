import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Desvio } from '@/types/models';
import { PerguntaDosDesvios } from '../DecisoesDoCorte';
import { descreverOBruto } from '../descreverOBruto';

// D-1105: a pergunta 2 da aba Decisões dizia "sai 2:28" enquanto a faixa "O bruto vai
// ter" e o resumo da trilha diziam "sai 2:29". A pergunta tinha uma conta própria; agora
// usa a da faixa (medirFicaESai), e a mesma tela dá um número só para o mesmo sai.

const trecho = (inicio_hms: string, fim_hms: string): Desvio => ({ inicio_hms, fim_hms, motivo: '', origem: 'claude' });

/** O "sai X" do título da pergunta 2. */
function saiDaPergunta(corte: { inicio_seg: number; fim_seg: number }, desvios: Desvio[]): string | undefined {
  const html = renderToStaticMarkup(
    <PerguntaDosDesvios corte={corte} desvios={desvios}>
      {null}
    </PerguntaDosDesvios>,
  );
  return html.match(/>(sai [^<]*)</)?.[1];
}

/** O "sai X" da faixa, sem o "em N trechos". */
function saiDaFaixa(corte: { inicio_seg: number; fim_seg: number }, desvios: Desvio[]): string {
  return descreverOBruto({ ...corte, desvios }, 0).sai.replace(/ em .*$/, '');
}

describe('D-1105 · a pergunta 2 diz o mesmo sai da faixa', () => {
  // Bruto de 20:11 (1000 → 2211) e um trecho de 148,4 s: a líquida fica em 1062,6 s.
  const corte = { inicio_seg: 1000, fim_seg: 2211 };
  const fracionario = [trecho('00:16:45.000', '00:19:13.400')];

  it('com a líquida fracionária, a pergunta diz "sai 2:29", como a faixa', () => {
    expect(saiDaFaixa(corte, fracionario)).toBe('sai 2:29');
    expect(saiDaPergunta(corte, fracionario)).toBe('sai 2:29');
  });

  it('o trecho que passa da janela do corte conta só a parte de dentro, como na faixa', () => {
    // 2:00 dentro (2091 → 2211) e 1:00 depois do fim.
    const passaDoFim = [trecho('00:34:51.000', '00:37:51.000')];
    expect(saiDaFaixa(corte, passaDoFim)).toBe('sai 2:00');
    expect(saiDaPergunta(corte, passaDoFim)).toBe('sai 2:00');
  });

  it('abaixo de um minuto, o formato é o da faixa: "sai 0:40"', () => {
    const curto = [trecho('00:16:45.000', '00:17:25.000')];
    expect(saiDaPergunta(corte, curto)).toBe(saiDaFaixa(corte, curto));
    expect(saiDaPergunta(corte, curto)).toBe('sai 0:40');
  });

  it('todo o trecho fora da janela: nada sai, e o título não diz "sai 0:00"', () => {
    const foraDoCorte = [trecho('00:01:00.000', '00:02:00.000')];
    expect(saiDaPergunta(corte, foraDoCorte)).toBeUndefined();
  });
});
