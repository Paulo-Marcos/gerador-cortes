import { describe, expect, it } from 'vitest';
import {
  cortesParaTiktok,
  cortesParaYoutube,
  destinosPublicados,
  pendentesNoTiktok,
} from '../listasDePublicacao';
import type { StatusExportCorte } from '@/types/models';
import { statusExportPendente } from '@/features/publicacao/statusExport';

// D-516: o bug era uma lista servindo a dois destinos.
//
// O TikTok herdou o `!youtube_url_publicado` do YouTube, e os cortes SUMIAM da
// lista dele conforme eram publicados la — sem erro, sem aviso: o botao
// simplesmente deixava de existir para aquele corte.
//
// Por isso o teste central aqui e o de INDEPENDENCIA: publicar num destino nao
// pode mexer no outro.

function corte(over: Partial<StatusExportCorte> = {}): StatusExportCorte {
  return statusExportPendente({
    corte_id: 'c1',
    numero: 1,
    titulo: 'Um corte',
    raw_pronto: true,
    grade_pronta: true,
    overlays_prontos: true,
    video_pronto: true,
    thumbnail_pronta: true,
    metadados_completos: true,
    pronto_publicar: true,
    ...over,
  });
}

describe('cortesParaTiktok', () => {
  it('o corte JA publicado no YouTube continua na lista', () => {
    // O bug, em uma linha. Ele e justamente o candidato mais provavel: tem MP4
    // e ainda nao subiu aqui.
    const publicado = corte({ youtube_url_publicado: 'https://youtu.be/abc' });

    expect(cortesParaTiktok([publicado])).toHaveLength(1);
  });

  it('publicar no YouTube nao muda a lista do TikTok', () => {
    const antes = cortesParaTiktok([corte()]);
    const depois = cortesParaTiktok([corte({ youtube_url_publicado: 'https://youtu.be/abc' })]);

    expect(depois).toHaveLength(antes.length);
  });

  it('basta o video final — thumbnail e metadados sao exigencia do YouTube', () => {
    const semMetadados = corte({
      thumbnail_pronta: false,
      metadados_completos: false,
      pronto_publicar: false,
    });

    expect(cortesParaTiktok([semMetadados])).toHaveLength(1);
  });

  it('sem video final nao ha pacote a montar', () => {
    expect(cortesParaTiktok([corte({ video_pronto: false })])).toEqual([]);
  });
});

describe('cortesParaYoutube', () => {
  it('o publicado sai da lista — o YouTube nao republica', () => {
    expect(cortesParaYoutube([corte({ youtube_url_publicado: 'https://youtu.be/abc' })])).toEqual(
      [],
    );
  });

  it('exige o pacote completo, e nao so o video', () => {
    expect(cortesParaYoutube([corte({ pronto_publicar: false })])).toEqual([]);
  });

  it('confirmar no TikTok nao tira o corte da fila do YouTube', () => {
    // A independencia vale nos dois sentidos.
    const noTiktok = corte({ tiktok_publicado_em: '2026-09-04T10:00:00' });

    expect(cortesParaYoutube([noTiktok])).toHaveLength(1);
  });
});

describe('pendentesNoTiktok', () => {
  it('some quem ja foi confirmado', () => {
    const lista = [
      corte({ corte_id: 'a' }),
      corte({ corte_id: 'b', tiktok_publicado_em: '2026-09-04T10:00:00' }),
    ];

    expect(pendentesNoTiktok(lista).map((c) => c.corte_id)).toEqual(['a']);
  });

  it('quem nao tem video nunca entra na fila', () => {
    expect(pendentesNoTiktok([corte({ video_pronto: false })])).toEqual([]);
  });
});

// D-566: "publicado" deixou de ser estado terminal.
//
// O video pode ser apagado la fora — foi o que aconteceu num reprocessamento —
// e o corte ficava preso: sem botao de enviar, fora da lista de massa, e com o
// backend respondendo "ja publicado; upload ignorado". Esta lista e o primeiro
// passo da volta: mostrar em que destinos o app ACHA que o video esta.
describe('destinosPublicados', () => {
  it('corte virgem nao tem nada a liberar', () => {
    expect(destinosPublicados(corte())).toEqual([]);
  });

  it('lista o YouTube com a URL que o operador confere antes de soltar', () => {
    const marcados = destinosPublicados(
      corte({ youtube_url_publicado: 'https://youtu.be/abc12345678' }),
    );

    expect(marcados).toHaveLength(1);
    expect(marcados[0].destino).toBe('youtube');
    expect(marcados[0].detalhe).toContain('abc12345678');
  });

  it('pega o corte preso so pelo video_id, sem URL', () => {
    // E o `youtube_video_id` que o upload consulta para se declarar
    // idempotente: sem esta linha, o corte preso nao apareceria para ser solto.
    const marcados = destinosPublicados(corte({ youtube_video_id: 'abc12345678' }));

    expect(marcados.map((d) => d.destino)).toEqual(['youtube']);
  });

  it('enxerga os dois destinos de forma independente', () => {
    const marcados = destinosPublicados(
      corte({
        youtube_url_publicado: 'https://youtu.be/abc12345678',
        tiktok_publicado_em: '2026-09-04T10:00:00',
      }),
    );

    expect(marcados.map((d) => d.destino)).toEqual(['youtube', 'tiktok']);
    expect(marcados[1].detalhe).toContain('2026-09-04');
  });
});
