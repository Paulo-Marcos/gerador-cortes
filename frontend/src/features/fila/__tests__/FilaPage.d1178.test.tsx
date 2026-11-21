import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueueJob } from '@/shared/filaGlobal/useWorkbenchQueue';
import { esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';

// D-1178 (E-069 H-23; DIRECAO §7.13): a Fila como tela, na mesma casca da gaveta (§7.11):
// `Lista`, `Selo`, `Progresso` e `EstadoVazio`. Fila não tem primário (PRIMARIOS_POR_TELA).

const h = vi.hoisted(() => ({ jobs: [] as unknown[] }));

vi.mock('@/upgrade/UpgradeChrome', () => ({ useDefinirChrome: () => undefined }));
vi.mock('@/shared/filaGlobal/useWorkbenchQueue', () => ({
  useWorkbenchQueue: () => ({
    jobs: h.jobs,
    removeJob: vi.fn(),
    cancelJob: vi.fn(),
    clearAll: vi.fn(),
  }),
}));

import FilaPage from '../FilaPage';

const job = (extra: Partial<QueueJob>): QueueJob =>
  ({
    id: 'render:1',
    tipo: 'render',
    familia: 'midia',
    corteId: 'c1',
    projetoId: 'p1',
    alvo: '265 · corte 7',
    rotuloTipo: 'render',
    rotulo: '265 · corte 7 → render',
    estado: 'rodando',
    progresso: 42,
    etapa: 'compondo',
    erro: '',
    terminalDesde: null,
    iniciadoEm: Date.now(),
    atualizadoEm: Date.now(),
    ...extra,
  }) as QueueJob;

const montar = () => renderToStaticMarkup(<FilaPage />);

beforeEach(() => {
  h.jobs = [];
});

describe('Fila na Sala escura (§7.13)', () => {
  it('fila vazia: estado vazio com a explicação, sem primário', () => {
    const html = montar();
    expect(html).toContain('data-estado="vazio"');
    expect(html).toContain('Nada na fila');
    esperarPrimarios(html, 'Fila');
  });

  it('job rodando: linha de lista, selo em curso, barra com o percentual e Cancelar destrutivo', () => {
    h.jobs = [job({})];
    const html = montar();
    expect(html).toContain('aria-label="Jobs da fila"');
    expect(html).toContain('265 · corte 7 → render');
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="42"/);
    expect(html).toContain('rodando');
    expect(html).toMatch(/<button[^>]*data-variant="destrutivo"[^>]*>[\s\S]*?Cancelar/);
    esperarPrimarios(html, 'Fila');
  });

  it('job concluído: sem Cancelar; só tirar da lista', () => {
    h.jobs = [job({ estado: 'concluido', progresso: 100 })];
    const html = montar();
    expect(html).toContain('concluído');
    expect(html).not.toContain('data-variant="destrutivo"');
    expect(html).toContain('aria-label="Tirar 265 · corte 7 → render da lista"');
  });

  it('job com erro mostra o erro em vez da etapa', () => {
    h.jobs = [job({ estado: 'erro', erro: 'ffmpeg caiu' })];
    expect(montar()).toContain('ffmpeg caiu');
  });

  it('a tela não usa mais as classes antigas (card, chip, btn)', () => {
    h.jobs = [job({})];
    expect(montar()).not.toMatch(/class="[^"]*\b(card|chip|btn)\b/);
  });
});
