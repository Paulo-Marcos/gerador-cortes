import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MapaDaLive } from '@/components/ui/mapa-da-live';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusCorte, StatusExportCorte } from '@/types/models';
import { cortesDoMapa, type LinhaDoCorte } from '../leituraDoMapa';

// D-1152 · O mapa só conhecia proposto, pronto e riscado: o corte aprovado, ainda em
// produção, era lido como "proposto" no aria-label e no Selo do corte aberto. Aprovado é
// o `aprovado` e o `processado` do ciclo do corte (`domain/corte/ciclo_corte.py`). Na luz
// ele é igual ao proposto (apagado); a diferença é a palavra.

const linha = (
  id: string,
  numero: number,
  status: StatusCorte,
  extra: Partial<StatusExportCorte> = {},
): LinhaDoCorte => ({
  status: { ...statusExportPendente({ corte_id: id, numero, titulo: `Corte ${id}` }), ...extra },
  corte: { id, status, inicio_seg: numero * 600, fim_seg: numero * 600 + 300 } as Corte,
});

const LINHAS: LinhaDoCorte[] = [
  linha('a', 1, 'aprovado'),
  linha('b', 2, 'processado'),
  linha('c', 3, 'proposto'),
  linha('d', 4, 'aprovado', { pronto_publicar: true }),
  linha('e', 5, 'rejeitado'),
  linha('f', 6, 'processado', { youtube_url_publicado: 'https://youtu.be/x' }),
];

const desenhar = (abertoId?: string) =>
  renderToStaticMarkup(
    <MapaDaLive duracaoSeg={5400} cortes={cortesDoMapa(LINHAS)} abertoId={abertoId} />,
  );

const pilula = (html: string, id: string) =>
  html.match(new RegExp(`<a data-corte="${id}"[^>]*>`))![0];
const classes = (html: string, id: string) => pilula(html, id).match(/class="([^"]*)"/)![1];
/** O Selo é o que vem, no resumo do aberto, antes do título: `[trecho, tom]`. */
const seloDoAberto = (html: string) => {
  const resumo = html.slice(html.indexOf('data-parte="aberto"'));
  return resumo.slice(0, resumo.indexOf('<span class="truncate"')).match(/data-tom="(\w+)".*/)!;
};

describe('D-1152 · o corte aprovado no mapa da live', () => {
  it('aprovado e processado são "aprovado"; os outros três estados continuam como eram', () => {
    expect(cortesDoMapa(LINHAS).map((c) => c.estado)).toEqual([
      'aprovado',
      'aprovado',
      'proposto',
      'pronto',
      'riscado',
      'pronto',
    ]);
  });

  it('o aria-label diz "aprovado", e o dos outros estados não muda', () => {
    const html = desenhar();
    expect(pilula(html, 'a')).toContain('aria-label="Corte 1, Corte a, de 0:10:00 a 0:15:00, aprovado"');
    expect(pilula(html, 'b')).toContain(', aprovado"');
    expect(pilula(html, 'c')).toContain(', proposto"');
    expect(pilula(html, 'd')).toContain(', pronto"');
    expect(pilula(html, 'e')).toContain(', riscado"');
    expect(pilula(html, 'a')).toContain('data-estado="aprovado"');
  });

  it('o Selo do corte aberto diz "Aprovado" no tom neutro (§5)', () => {
    for (const id of ['a', 'b']) {
      const [selo, tom] = seloDoAberto(desenhar(id));
      expect(tom).toBe('neutro');
      expect(selo).toContain('Aprovado');
      expect(selo).not.toContain('Proposto');
    }
  });

  it('os selos dos outros três não mudam', () => {
    expect(seloDoAberto(desenhar('c'))[0]).toMatch(/data-tom="neutro".*Proposto/);
    expect(seloDoAberto(desenhar('d'))[0]).toMatch(/data-tom="convite".*Pronto/);
    expect(seloDoAberto(desenhar('e'))[0]).toMatch(/data-tom="inerte".*Riscado/);
  });

  it('a luz do aprovado é a do proposto: apagada, inclusive no número e no hover', () => {
    const html = desenhar();
    expect(classes(html, 'a')).toBe(classes(html, 'c'));
    expect(classes(html, 'a')).not.toBe(classes(html, 'd'));
    const numero = (id: string) =>
      html.slice(html.indexOf(`<a data-corte="${id}"`)).match(/<span class="([^"]*)">\d<\/span>/)![1];
    expect(numero('a')).toBe(numero('c'));
  });
});
