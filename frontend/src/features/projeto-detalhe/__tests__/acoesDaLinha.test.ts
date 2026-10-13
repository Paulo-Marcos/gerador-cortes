import { describe, expect, it, vi } from 'vitest';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { estadoDaLinha, maisDaLinha, ondeJaSubiu, primarioDaLinha } from '../acoesDaLinha';

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

describe('ondeJaSubiu (D-906)', () => {
  it('separa "subiu em alguma rede" de "está no YouTube"', () => {
    expect(ondeJaSubiu(status())).toEqual({ publicado: false, noYoutube: false });
    expect(ondeJaSubiu(status({ tiktok_publicado_em: '2026-10-01T10:00:00' }))).toEqual({
      publicado: true,
      noYoutube: false,
    });
    expect(ondeJaSubiu(status({ youtube_url_publicado: 'https://youtu.be/x' }))).toEqual({
      publicado: true,
      noYoutube: true,
    });
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
    const base = { publicado: false, noYoutube: false, abrindoPasta: false };
    return { itens: maisDaLinha({ ...base, ...fns, ...extra }), fns };
  }

  it('o ⋯ traz Pós, Metadados, a pasta e a URL publicada, com rótulo', () => {
    expect(montar().itens.map((i) => i.label)).toEqual([
      'Pós-produção',
      'Metadados do corte',
      'Abrir a pasta do corte',
      'Informar a URL publicada',
    ]);
  });

  it('corte no ar no YouTube troca "Informar a URL" por "Liberar publicação"', () => {
    const rotulos = montar({ publicado: true, noYoutube: true }).itens.map((i) => i.label);
    expect(rotulos).not.toContain('Informar a URL publicada');
    expect(rotulos.at(-1)).toBe('Liberar publicação');
  });

  it('D-906: só no TikTok, oferece informar a URL do YouTube E liberar', () => {
    const rotulos = montar({ publicado: true, noYoutube: false }).itens.map((i) => i.label);
    expect(rotulos.slice(-2)).toEqual(['Informar a URL publicada', 'Liberar publicação']);
  });

  it('cada item chama a sua ação', () => {
    const { itens, fns } = montar();
    for (const item of itens) item.onClick!();
    expect(fns.posProducao).toHaveBeenCalledOnce();
    expect(fns.metadados).toHaveBeenCalledOnce();
    expect(fns.abrirPasta).toHaveBeenCalledOnce();
    expect(fns.informarUrl).toHaveBeenCalledOnce();
    const liberar = montar({ publicado: true, noYoutube: true });
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
