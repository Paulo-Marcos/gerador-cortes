import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../ActionBar';

// D-1086: na Pós, a barra de ações quebrava em duas fileiras ("Renderizar final"
// descia sozinho), porque os textos (lembretes, pendências, motivo) não cediam
// largura. Medido a 1520×900: 89 px. Agora ela é uma fileira: quem encolhe são as
// pendências (reticências, texto inteiro no hover) e o motivo (até duas linhas, D-870).

const longo = 'Sem o vídeo bruto: regere o bruto antes de renderizar.';
const html = renderToStaticMarkup(
  <ActionBar
    barra={{
      teclas: [{ teclas: ['Space'], texto: 'tocar' }],
      veredito: { aprovado: true, onAlternar: vi.fn() },
      pendencias: <span>2 avisos de cena, cenas por validar</span>,
      primario: { texto: 'Renderizar final', icone: 'clapperboard', desabilitado: true, motivo: longo },
    }}
  />,
);

describe('D-1086 · a barra de ações numa fileira', () => {
  it('não quebra em duas fileiras', () => {
    expect(html).toMatch(/^<div class="gl" style="[^"]*flex-wrap:nowrap/);
  });

  it('o lembrete de tecla não encolhe nem quebra', () => {
    expect(html).toMatch(/<span style="[^"]*flex:none;white-space:nowrap[^"]*"><kbd>Space<\/kbd>tocar<\/span>/);
  });

  it('o motivo do principal cede largura antes dos botões', () => {
    const motivo = html.match(/<span id="motivo-do-primario"[^>]*>/)?.[0] ?? '';
    expect(motivo).toContain('min-width:0');
    expect(motivo).toContain('flex:0 1 auto');
  });
});
