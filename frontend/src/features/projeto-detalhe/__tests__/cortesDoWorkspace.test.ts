import { describe, expect, it } from 'vitest';
import type { Corte, StatusExportCorte } from '@/types/models';
import { acaoDaTeclaNaLinha, mesclarCortesComExport } from '../cortesDoWorkspace';
import { statusExportPendente } from '@/features/publicacao/statusExport';

function corte(over: Partial<Corte> & Pick<Corte, 'id' | 'numero'>): Corte {
  return {
    projeto_id: 'p1',
    titulo_proposto: `Corte ${over.numero}`,
    resumo: '',
    tema_central: '',
    inicio_hms: '00:00:00',
    fim_hms: '00:00:30',
    inicio_seg: 0,
    fim_seg: 30,
    desvios: [],
    status: 'proposto',
    arquivo_clip_path: '',
    youtube_video_id: '',
    youtube_url_publicado: '',
    youtube_scheduled_at: '',
    is_leitura: false,
    autor_leitura: '',
    parte_leitura: 0,
    is_fire: false,
    criado_em: '',
    ...over,
  } as Corte;
}

describe('mesclarCortesComExport', () => {
  it('mantem todo corte na lista mesmo sem linha em export/status', () => {
    const lista = mesclarCortesComExport([corte({ id: 'a', numero: 1 })], []);

    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ corte_id: 'a', numero: 1, pronto_publicar: false });
  });

  it('usa o dado de export quando ele existe', () => {
    const exportado: StatusExportCorte = statusExportPendente({
      corte_id: 'a',
      numero: 1,
      titulo: 'Titulo do export',
      raw_pronto: true,
      grade_pronta: true,
      overlays_prontos: true,
      video_pronto: true,
      thumbnail_pronta: true,
      metadados_completos: true,
      pronto_publicar: true,
    });

    const lista = mesclarCortesComExport([corte({ id: 'a', numero: 1 })], [exportado]);

    expect(lista[0]).toBe(exportado);
  });

  it('deriva video_pronto de is_pos_producao quando o export ainda nao existe', () => {
    const lista = mesclarCortesComExport(
      [corte({ id: 'a', numero: 1, is_pos_producao: 1, arquivo_clip_path: '/x.mp4' })],
      [],
    );

    expect(lista[0]).toMatchObject({ video_pronto: true, raw_pronto: true });
  });

  it('preserva a ordem dos cortes, nao a do export', () => {
    const lista = mesclarCortesComExport(
      [corte({ id: 'a', numero: 1 }), corte({ id: 'b', numero: 2 })],
      [
        statusExportPendente({
          corte_id: 'b',
          numero: 2,
          titulo: 'b',
          raw_pronto: false,
          grade_pronta: false,
          overlays_prontos: false,
          video_pronto: false,
          thumbnail_pronta: false,
          metadados_completos: false,
          pronto_publicar: false,
        }),
      ],
    );

    expect(lista.map((c) => c.corte_id)).toEqual(['a', 'b']);
  });
});

// D-842: A alterna e R exclui. O R só devolvia a proposto (D-746), o que o A
// já fazia; agora ele exclui — e a confirmação é o que impede o irreversível
// num toque só.
describe('acaoDaTeclaNaLinha', () => {
  it('A aprova o corte proposto', () => {
    expect(acaoDaTeclaNaLinha('a', 'proposto')).toBe('aprovar');
  });

  it.each(['aprovado', 'processado'] as const)('A devolve a proposto o corte %s', (status) => {
    expect(acaoDaTeclaNaLinha('A', status)).toBe('devolver');
  });

  it('A não mexe no corte rejeitado (o botão Voltar cuida dele)', () => {
    expect(acaoDaTeclaNaLinha('a', 'rejeitado')).toBeNull();
  });

  it.each(['proposto', 'aprovado', 'processado', 'rejeitado'] as const)(
    'R exclui o corte %s (a linha pede confirmação antes)',
    (status) => {
      expect(acaoDaTeclaNaLinha('r', status)).toBe('excluir');
    },
  );

  // D-865: J anterior (sobe), K próximo (desce) — o sentido do editor.
  it('J e K andam entre as linhas', () => {
    expect(acaoDaTeclaNaLinha('j', 'proposto')).toBe('subir');
    expect(acaoDaTeclaNaLinha('K', 'aprovado')).toBe('descer');
  });

  // D-886: W de "why" — o porquê da IA vale em qualquer estado do corte.
  it.each(['proposto', 'aprovado', 'processado', 'rejeitado'] as const)(
    'W abre o porquê do corte %s',
    (status) => {
      expect(acaoDaTeclaNaLinha('w', status)).toBe('explicar');
      expect(acaoDaTeclaNaLinha('W', status)).toBe('explicar');
    },
  );

  it('sem corte carregado, só a navegação vale', () => {
    expect(acaoDaTeclaNaLinha('a', undefined)).toBeNull();
    expect(acaoDaTeclaNaLinha('r', undefined)).toBeNull();
    expect(acaoDaTeclaNaLinha('w', undefined)).toBeNull();
    expect(acaoDaTeclaNaLinha('j', undefined)).toBe('subir');
  });

  it('outra tecla não faz nada', () => {
    expect(acaoDaTeclaNaLinha('x', 'proposto')).toBeNull();
  });
});
