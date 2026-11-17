import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MedidorDeEtapas } from '@/components/ui/medidor-de-etapas';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { StatusExportCorte } from '@/types/models';
import { montarTira } from '../tiraDoCorte';

// D-1121: o medidor de etapas. Mora aqui (e não em `components/ui/__tests__`) porque monta a
// `Tira` com `statusExportPendente`, de `features/`, que `components/` não pode importar.

function status(patch: Partial<StatusExportCorte> = {}): StatusExportCorte {
  return statusExportPendente({
    corte_id: 'c',
    numero: 1,
    titulo: 'Corte',
    raw_pronto: false,
    grade_pronta: false,
    overlays_prontos: false,
    cenas_geradas: false,
    cenas_validadas: false,
    video_pronto: false,
    thumbnail_pronta: false,
    metadados_completos: false,
    pronto_publicar: false,
    ...patch,
  });
}

describe('MedidorDeEtapas', () => {
  const parado = montarTira(status({ raw_pronto: true, cenas_validadas: true }));
  const html = renderToStaticMarkup(<MedidorDeEtapas tira={parado} />);

  it('desenha oito traços em três grupos (Cenas 2 · Render 3 · Publicação 3)', () => {
    expect(html.match(/data-etapa=/g)).toHaveLength(8);
    expect(html.match(/data-grupo="CENAS"/g)).toHaveLength(1);
    expect(html).toMatch(/data-grupo="CENAS"(?:(?!data-grupo).)*?(?:data-etapa=.*?){2}<\/span>/);
  });

  it('o aria-label tem a contagem e o verbo, e a frase aparece ao lado', () => {
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Etapas do corte: 2 de 8 · próximo: aplicar filtro"');
    expect(html).toContain('>2 de 8 · próximo: aplicar filtro<');
  });

  it('nenhuma sigla: nem BRU/GRD/OVL em lugar nenhum do HTML', () => {
    const texto = html.replace(/<[^>]*>/g, ' ');
    expect(texto).not.toMatch(/\b(BRU|CEN|GRD|OVL|FIN|THU|MET|YT)\b/);
    // E o título dos traços (o que o mouse lê) também é o nome, nunca a sigla.
    expect(html).not.toMatch(/title="(BRU|CEN|GRD|OVL|FIN|THU|MET|YT)\b/);
  });

  it('o traço se lê pelo nome da etapa ("Filtro", "Capa"), não pela chave em inglês', () => {
    expect(html).toContain('title="Filtro — é aqui que parou"');
    expect(html).toContain('title="Capa — pendente"');
    expect(html).toContain('title="Bruto — feita"');
    expect(html).not.toContain('Graded');
    expect(html).not.toContain('Thumb');
  });

  it('exatamente um traço "agora" e dois "feito" para 2 de 8', () => {
    expect(html.match(/data-estado="agora"/g)).toHaveLength(1);
    expect(html.match(/data-estado="feito"/g)).toHaveLength(2);
    expect(html.match(/data-estado="falta"/g)).toHaveLength(5);
  });

  it('corte riscado: o primeiro traço é falha e a frase é "corte rejeitado" em erro', () => {
    const h = renderToStaticMarkup(
      <MedidorDeEtapas tira={montarTira(status({ raw_pronto: true }), 'rejeitado')} />,
    );
    expect(h.match(/data-estado="falha"/g)).toHaveLength(1);
    expect(h).not.toContain('data-estado="agora"');
    expect(h).toContain('corte rejeitado');
    expect(h).toContain('text-erro');
  });

  it('corte no ar: sem traço "agora" e a frase é "no ar"', () => {
    const h = renderToStaticMarkup(
      <MedidorDeEtapas
        tira={montarTira(
          status({
            raw_pronto: true,
            thumbnail_pronta: true,
            metadados_completos: true,
            youtube_url_publicado: 'https://youtu.be/x',
          }),
        )}
      />,
    );
    expect(h).not.toContain('data-estado="agora"');
    expect(h).toContain('aria-label="Etapas do corte: no ar"');
  });

  it('comFrase={false} tira a frase mas mantém o aria-label', () => {
    const h = renderToStaticMarkup(<MedidorDeEtapas tira={parado} comFrase={false} />);
    expect(h).not.toContain('text-pequeno');
    expect(h).toContain('aria-label="Etapas do corte: 2 de 8');
  });

  it('nunca usa o feixe: medidor é estado (aviso/erro), não "onde estou"', () => {
    expect(html).not.toMatch(/feixe/);
  });
});
