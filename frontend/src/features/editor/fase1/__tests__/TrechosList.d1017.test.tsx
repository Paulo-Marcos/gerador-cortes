import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toaster';
import { TrechosList } from '../TrechosList';
import type { Desvio, TranscricaoLinha } from '@/types/models';

const noop = vi.fn();
const LINHAS: TranscricaoLinha[] = [
  { start: 10, end: 14, texto: 'a gente estava falando da classe média' },
  { start: 14, end: 18, texto: 'e aí, veja bem, a classe média paga' },
  { start: 18, end: 22, texto: 'essa conta todo mês sem reclamar' },
];
const CITADO: Desvio = {
  inicio_hms: '00:00:14.000',
  fim_hms: '00:00:18.000',
  motivo: 'Repete a tese',
  categoria: 'repeticao',
  inicio_texto: 'veja bem',
  fim_texto: 'classe média paga',
};

function render(props: Partial<Parameters<typeof TrechosList>[0]> = {}) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <TooltipProvider>
          <TrechosList
            desvios={[]}
            selectedDesvioIdx={null}
            onSeek={noop}
            onAdicionarDesvio={noop}
            onRemoverDesvio={noop}
            onGerarManual={noop}
            onGerarTrechosIA={noop}
            pending={{}}
            linhas={LINHAS}
            {...props}
          />
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('TrechosList (D-1017)', () => {
  it('mostra a fala que sai e como a emenda fica, para decidir lendo', () => {
    const html = render({ desvios: [CITADO] });

    expect(html).toContain('veja bem, a classe média paga');
    expect(html).toContain('aria-label="Como a emenda fica"');
    expect(html).toContain('classe média e aí,');
  });

  it('o motivo continua inteiro na linha', () => {
    expect(render({ desvios: [CITADO] })).toContain('Repete a tese');
  });

  it('o botão da linha risca, em vez de apagar', () => {
    const html = render({ desvios: [CITADO] });

    expect(html).toContain('aria-label="Riscar trecho"');
    expect(html).not.toContain('aria-label="Remover trecho"');
  });

  it('o riscado fica visível, riscado, e pode voltar', () => {
    const html = render({ riscados: [CITADO], onRestaurarDesvio: noop });

    expect(html).toContain('Riscados · 1');
    expect(html).toContain('line-through');
    expect(html).toContain('veja bem, a classe média paga');
    expect(html).toContain('aria-label="Restaurar trecho"');
  });

  it('a marca recusada diz por quê', () => {
    const html = render({
      riscados: [{ ...CITADO, recusa: 'A citação não confere com a fala neste tempo' }],
    });

    expect(html).toContain('A citação não confere com a fala neste tempo');
  });

  it('marca da IA sem citação avisa que não foi conferida; a feita à mão não', () => {
    const semCitacao = { inicio_hms: '00:00:14.000', fim_hms: '00:00:18.000', motivo: 'x' };

    expect(render({ desvios: [{ ...semCitacao, origem: 'claude' }] })).toContain('Sem citação da IA');
    expect(render({ desvios: [{ ...semCitacao, origem: 'manual' }] })).not.toContain('Sem citação da IA');
    expect(render({ desvios: [{ ...CITADO, origem: 'claude' }] })).not.toContain('Sem citação da IA');
  });

  it('sem riscados não há seção vazia', () => {
    expect(render()).not.toContain('Riscados');
  });

  it('oferece desfazer a rodada dizendo quantos trechos saem', () => {
    const html = render({ desvios: [CITADO], trechosDaUltimaRodada: 7, onDesfazerRodada: noop });

    expect(html).toContain('Desfazer a última rodada da IA');
    expect(html).toContain('7 trechos');
  });

  it('sem rodada para desfazer, a ação não aparece', () => {
    expect(render({ desvios: [CITADO], trechosDaUltimaRodada: 0 })).not.toContain('Desfazer');
  });
});
