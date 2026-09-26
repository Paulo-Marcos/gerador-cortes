import { describe, expect, it } from 'vitest';
import type { Corte, StatusExportCorte } from '@/types/models';
import { mesclarCortesComExport } from '../cortesDoWorkspace';
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
