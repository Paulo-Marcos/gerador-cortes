import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Corte, StatusExportCorte } from '@/types/models';
import { WorkbenchPanelsProvider } from '@/components/workbench/WorkbenchPanelsProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toaster';

vi.mock('@/hooks/useEditor', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useEditor')>('@/hooks/useEditor');
  return {
    ...actual,
    useReordenarCortes: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

import {
  WorkbenchCutsPanel,
  derivarEstagios,
  derivarFase,
  faixaDeSinais,
} from '../WorkbenchCutsPanel';

function corte(numero: number, status: Corte['status'] = 'proposto'): Corte {
  return {
    id: `c${numero}`,
    projeto_id: 'p1',
    numero,
    titulo_proposto: `Corte ${numero}`,
    resumo: '',
    tema_central: '',
    inicio_hms: '00:00:00',
    fim_hms: '00:00:10',
    inicio_seg: 0,
    fim_seg: 10,
    desvios: [],
    status,
    arquivo_clip_path: '',
    youtube_video_id: '',
    youtube_url_publicado: '',
    youtube_scheduled_at: '',
    is_leitura: false,
    is_fire: false,
  } as unknown as Corte;
}

function render(cortes: Corte[], exportStatus: StatusExportCorte[] = []) {
  const qc = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter>
            <WorkbenchPanelsProvider>
              <WorkbenchCutsPanel
                projetoId="p1"
                cortes={cortes}
                corteAtivoId={cortes[0]?.id ?? ''}
                exportStatus={exportStatus}
              />
            </WorkbenchPanelsProvider>
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('WorkbenchCutsPanel — rodapé "Ferramentas do corte" (AUDITORIA-v2 §8, CP9)', () => {
  it('renderiza o rodapé fechado por padrão, sem duplicar "adicionar corte manual" já visível na lista', () => {
    const html = render([corte(1), corte(2, 'aprovado')]);

    expect(html).toContain('Ferramentas do corte');
    expect(html).toContain('aria-expanded="false"');
    // O botão tracejado "＋ adicionar corte" no rodapé DA LISTA continua lá
    // (DE-PARA §3) — o rodapé retrátil é fechado, então seu próprio botão
    // "Adicionar corte manual" não aparece no HTML estático até abrir.
    expect(html).toContain('＋ adicionar corte');
  });

  it('mantém a faixa colapsada "CORTES · aprovados/total" do PanelShell (já existente)', () => {
    const html = render([corte(1), corte(2, 'aprovado'), corte(3, 'editado')]);

    expect(html).toContain('CORTES · 2/3');
  });
});

// ── D-397 · semáforo do card ─────────────────────────────────

function statusExport(over: Partial<StatusExportCorte> = {}): StatusExportCorte {
  return {
    corte_id: 'c1',
    numero: 1,
    titulo: 'Corte 1',
    raw_pronto: false,
    grade_pronta: false,
    overlays_prontos: false,
    video_pronto: false,
    thumbnail_pronta: false,
    metadados_completos: false,
    pronto_publicar: false,
    ...over,
  };
}

const SEM_SINAIS = { aprovado: false, rejeitado: false, fire: false, leitura: false };

describe('D-397 · faixaDeSinais — decisão editorial vira cor', () => {
  it('rejeitado é vermelho e ignora os demais sinais', () => {
    expect(faixaDeSinais({ ...SEM_SINAIS, rejeitado: true, fire: true })).toBe(
      'var(--tint-rejeitado)',
    );
  });

  it('aprovado é verde chapado', () => {
    expect(faixaDeSinais({ ...SEM_SINAIS, aprovado: true })).toBe('var(--tint-aprovado)');
  });

  it('aprovado + fire cai do verde para o laranja', () => {
    expect(faixaDeSinais({ ...SEM_SINAIS, aprovado: true, fire: true })).toBe(
      'linear-gradient(180deg, var(--tint-aprovado), var(--tint-fire))',
    );
  });

  it('aprovado + fire + leitura acrescenta o azul ao degradê', () => {
    expect(faixaDeSinais({ ...SEM_SINAIS, aprovado: true, fire: true, leitura: true })).toBe(
      'linear-gradient(180deg, var(--tint-aprovado), var(--tint-fire), var(--tint-leitura))',
    );
  });

  it('sem sinal nenhum usa a trilha neutra', () => {
    expect(faixaDeSinais(SEM_SINAIS)).toBe('var(--wb-border)');
  });
});

describe('D-397 · derivarEstagios — bruto, pós e YouTube', () => {
  it('sem status de export, os três marcos ficam pendentes', () => {
    expect(derivarEstagios(undefined, false).map((e) => e.estado)).toEqual([
      'pendente',
      'pendente',
      'pendente',
    ]);
  });

  it('bruto gerado acende só o primeiro marco', () => {
    expect(derivarEstagios(statusExport({ raw_pronto: true }), false).map((e) => e.estado)).toEqual(
      ['pronto', 'pendente', 'pendente'],
    );
  });

  it('grade/overlays/cenas deixam a pós "em andamento" até o render final', () => {
    const parcial = derivarEstagios(statusExport({ raw_pronto: true, grade_pronta: true }), false);
    expect(parcial[1].estado).toBe('andamento');

    const finalizado = derivarEstagios(
      statusExport({ raw_pronto: true, grade_pronta: true, video_pronto: true }),
      false,
    );
    expect(finalizado[1].estado).toBe('pronto');
  });

  it('publicado acende o marco do YouTube; agendado fica em andamento', () => {
    expect(derivarEstagios(statusExport(), true)[2].estado).toBe('pronto');
    expect(
      derivarEstagios(statusExport({ youtube_scheduled_at: '2026-08-01T10:00:00' }), false)[2]
        .estado,
    ).toBe('andamento');
  });
});

describe('D-397 · derivarFase — a palavra que resume o estágio', () => {
  const aprovado = { ...SEM_SINAIS, aprovado: true };

  it('rejeitado e pendente vêm antes do pipeline', () => {
    expect(derivarFase({ ...SEM_SINAIS, rejeitado: true }, undefined, false).rotulo).toBe(
      'rejeitado',
    );
    expect(derivarFase(SEM_SINAIS, undefined, false).rotulo).toBe('pendente');
  });

  it('sem bruto o corte está em edição; com bruto, na pós', () => {
    expect(derivarFase(aprovado, statusExport(), false).rotulo).toBe('edição');
    expect(derivarFase(aprovado, statusExport({ raw_pronto: true }), false).rotulo).toBe('pós');
  });

  it('render final pronto vira "a publicar" e publicado fecha o ciclo', () => {
    expect(
      derivarFase(aprovado, statusExport({ raw_pronto: true, video_pronto: true }), false).rotulo,
    ).toBe('a publicar');
    expect(
      derivarFase(aprovado, statusExport({ raw_pronto: true, video_pronto: true }), true).rotulo,
    ).toBe('publicado');
  });
});

describe('D-397 · card sem "aprovado ✓"', () => {
  it('a decisão fica só na cor — nada de rótulo "aprovado" nem do check', () => {
    const html = render([corte(1, 'aprovado')], [statusExport({ raw_pronto: true })]);

    expect(html).not.toContain('aprovado ✓');
    expect(html).not.toContain('aprovado 🔥');
    // Em troca, a fase do pipeline aparece por extenso.
    expect(html).toContain('pós');
  });
});

// ── D-404 · Ctrl+clique abre em nova aba ─────────────────────

describe('D-404 · a linha do corte é um link de verdade', () => {
  it('renderiza <a href> da rota do corte — é o href que dá Ctrl+clique/nova aba', () => {
    const html = render([corte(1), corte(2)]);

    expect(html).toContain('href="/projetos/p1/cortes/c1"');
    expect(html).toContain('href="/projetos/p1/cortes/c2"');
  });

  it('não sobrou <button> navegando por onClick no lugar do link', () => {
    const html = render([corte(1)]);

    // O card ainda tem botões (mover, metadados), mas a navegação do corte
    // sai por âncora: sem href, o navegador não oferece "nova aba".
    expect(html).toMatch(/<a[^>]+href="\/projetos\/p1\/cortes\/c1"/);
  });
});

// ── D-405 · ícone de metadados fixo quando já gerados ────────

describe('D-405 · ícone de metadados vira indicador de estado', () => {
  it('com metadados gerados o ícone fica fixo, preenchido e se anuncia como estado', () => {
    const html = render([corte(1)], [statusExport({ metadados_completos: true })]);

    expect(html).toContain('Metadados do corte 1 gerados — abrir');
    expect(html).toContain('title="Metadados gerados"');
    expect(html).toContain('text-[var(--wb-fire)]');
    expect(html).not.toContain('aria-label="Abrir metadados do corte 1"');
  });

  it('sem metadados o ícone continua sendo só atalho de hover', () => {
    const html = render([corte(1)], [statusExport()]);

    expect(html).toContain('aria-label="Abrir metadados do corte 1"');
    expect(html).toContain('title="Metadados"');
    expect(html).not.toContain('text-[var(--wb-fire)]');
  });
});

describe('D-397 · o card renderiza os dois eixos do semáforo', () => {
  it('pinta a faixa lateral com o degradê dos sinais do corte', () => {
    const fireELeitura = { ...corte(1, 'aprovado'), is_fire: true, is_leitura: true } as Corte;
    const html = render([fireELeitura], [statusExport({ raw_pronto: true })]);

    expect(html).toContain(
      'background:linear-gradient(180deg, var(--tint-aprovado), var(--tint-fire), var(--tint-leitura))',
    );
  });

  it('descreve os 3 marcos do pipeline por texto, não só pela cor', () => {
    const html = render(
      [corte(1, 'aprovado')],
      [statusExport({ raw_pronto: true, grade_pronta: true })],
    );

    expect(html).toContain(
      'aria-label="Bruto: gerado · Pós: em andamento · YouTube: não publicado"',
    );
  });
});
