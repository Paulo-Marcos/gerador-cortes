import { describe, expect, it, vi } from 'vitest';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { estadoDaLinha, maisDaLinha, primarioDaLinha } from '../acoesDaLinha';

// D-868 (Onda 3, nota 4): "uma ação por linha". Editar e o principal com
// rótulo; Pós, Metadados, pasta e URL publicada vão para o "⋯" — nada some.

function status(patch: Partial<StatusExportCorte> = {}): StatusExportCorte {
  return { ...statusExportPendente({ corte_id: 'c1', numero: 7, titulo: 'T' }), ...patch };
}
const corte = (s: Corte['status']) => ({ status: s }) as Corte;

function handlers() {
  return {
    aprovar: vi.fn(),
    voltar: vi.fn(),
    enviarYoutube: vi.fn(),
    finalizar: vi.fn(),
    abrirNoYoutube: vi.fn(),
  };
}

describe('estadoDaLinha', () => {
  it('lê o estado que decide o botão principal', () => {
    expect(estadoDaLinha(corte('proposto'), status())).toBe('proposto');
    expect(estadoDaLinha(corte('aprovado'), status())).toBe('aprovado');
    expect(estadoDaLinha(corte('aprovado'), status({ pronto_publicar: true }))).toBe('pronto');
    expect(estadoDaLinha(corte('aprovado'), status({ youtube_url_publicado: 'u' }))).toBe('publicado');
    expect(estadoDaLinha(corte('rejeitado'), status())).toBe('rejeitado');
  });

  it('a ordem decide: no ar vence tudo; rejeitado vence pronto; pronto vence aprovado', () => {
    expect(estadoDaLinha(corte('rejeitado'), status({ youtube_url_publicado: 'u' }))).toBe('publicado');
    expect(estadoDaLinha(corte('rejeitado'), status({ pronto_publicar: true }))).toBe('rejeitado');
    expect(estadoDaLinha(corte('proposto'), status({ pronto_publicar: true }))).toBe('pronto');
    expect(estadoDaLinha(undefined, status())).toBe('proposto');
  });
});

describe('primarioDaLinha', () => {
  it('cada estado pede uma coisa, com rótulo — e o clique faz essa coisa', () => {
    const casos = [
      ['proposto', 'Aprovar', 'aprovar', false],
      ['aprovado', 'Finalizar', 'finalizar', true],
      ['pronto', 'Enviar ao YouTube', 'enviarYoutube', true],
      ['publicado', 'No ar', 'abrirNoYoutube', false],
      ['rejeitado', 'Voltar', 'voltar', false],
    ] as const;
    for (const [estado, texto, acao, forte] of casos) {
      const h = handlers();
      const p = primarioDaLinha(estado, h);
      expect([p.texto, p.forte]).toEqual([texto, forte]);
      p.acao();
      expect(h[acao]).toHaveBeenCalledOnce();
    }
  });

  it('publicar usa o ícone do conceito (D-858)', () => {
    expect(primarioDaLinha('pronto', handlers()).icone).toBe(ICONE_DO_CONCEITO.publicar);
  });
});

describe('maisDaLinha', () => {
  function montar(extra: Partial<Parameters<typeof maisDaLinha>[0]> = {}) {
    const fns = {
      posProducao: vi.fn(),
      metadados: vi.fn(),
      abrirPasta: vi.fn(),
      informarUrl: vi.fn(),
      liberarPublicacao: vi.fn(),
    };
    return { itens: maisDaLinha({ publicado: false, abrindoPasta: false, ...fns, ...extra }), fns };
  }

  it('o ⋯ traz Pós, Metadados, a pasta e a URL publicada, com rótulo', () => {
    expect(montar().itens.map((i) => i.label)).toEqual([
      'Pós-produção',
      'Metadados do corte',
      'Abrir a pasta do corte',
      'Informar a URL publicada',
    ]);
  });

  it('corte já publicado troca "Informar a URL" por "Liberar publicação"', () => {
    expect(montar({ publicado: true }).itens.at(-1)!.label).toBe('Liberar publicação');
  });

  it('cada item chama a sua ação', () => {
    const { itens, fns } = montar();
    for (const item of itens) item.onClick!();
    expect(fns.posProducao).toHaveBeenCalledOnce();
    expect(fns.metadados).toHaveBeenCalledOnce();
    expect(fns.abrirPasta).toHaveBeenCalledOnce();
    expect(fns.informarUrl).toHaveBeenCalledOnce();
    const liberar = montar({ publicado: true });
    liberar.itens.at(-1)!.onClick!();
    expect(liberar.fns.liberarPublicacao).toHaveBeenCalledOnce();
  });

  it('a pasta fica desligada enquanto abre; ícones pelos conceitos', () => {
    const { itens } = montar({ abrindoPasta: true });
    expect(itens.find((i) => i.label === 'Abrir a pasta do corte')!.disabled).toBe(true);
    expect(itens.map((i) => i.icon)).toEqual([
      'clapperboard',
      'tags',
      'folder',
      ICONE_DO_CONCEITO.urlPublicada,
    ]);
    expect(montar({ publicado: true }).itens.at(-1)!.icon).toBe('rotate-ccw');
  });

  it('as dicas dos itens dizem o que acontece', () => {
    const dica = (rotulo: string, extra = {}) =>
      montar(extra).itens.find((i) => i.label === rotulo)!.title;
    expect(dica('Metadados do corte')).toBe('Abre aqui, sem sair da lista');
    expect(dica('Informar a URL publicada')).toMatch(/já publicado no YouTube/);
    expect(dica('Liberar publicação', { publicado: true })).toBe('Liberar para subir de novo');
  });
});
