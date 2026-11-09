import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../ActionBar';

// D-1086: na Pós, a barra de ações quebrava em duas fileiras ("Renderizar final"
// descia sozinho), porque os textos (pendências, motivo) entravam na conta da quebra
// com o tamanho inteiro. Medido a 1520×900: 89 px. Agora os textos entram na conta só
// com o mínimo legível (base 0) e crescem na sobra: a barra fica numa fileira enquanto
// os BOTÕES couberem. A barra é a mesma em todas as telas da casca, então a quebra
// continua como rede: numa janela estreita (Bancada a 1100 px, D-877), o principal
// desce para a segunda fileira em vez de sair da barra cortado (auditoria do #349).

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

describe('D-1086 · a barra de ações numa fileira, com a quebra como rede', () => {
  it('o principal nunca fica fora da barra: sem largura, a barra quebra em vez de cortar', () => {
    expect(html).toMatch(/^<div class="gl" style="[^"]*flex-wrap:wrap/);
  });

  it('o motivo entra na conta da quebra só com o mínimo legível e cresce na sobra', () => {
    const motivo = html.match(/<span id="motivo-do-primario"[^>]*>/)?.[0] ?? '';
    expect(motivo).toContain('min-width:96px');
    expect(motivo).toContain('flex:1000 1 0');
    expect(motivo).toContain('max-width:max-content');
  });

  it('o motivo não passa de 320 px nem de duas linhas (D-870)', () => {
    expect(html).toMatch(/-webkit-line-clamp:2;[^"]*max-width:320px[^>]*>Sem o vídeo bruto/);
  });

  it('o lembrete de tecla não encolhe nem quebra', () => {
    expect(html).toMatch(/<span style="[^"]*flex:none;white-space:nowrap[^"]*"><kbd>Space<\/kbd>tocar<\/span>/);
  });
});
