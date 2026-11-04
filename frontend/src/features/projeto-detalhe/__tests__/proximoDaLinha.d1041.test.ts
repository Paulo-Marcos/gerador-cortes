import { describe, expect, it, vi } from 'vitest';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { StatusExportCorte } from '@/types/models';
import { montarTira } from '@/upgrade/tiraDoCorte';
import { primarioDaLinha, proximoDaLinha } from '../acoesDaLinha';

// D-1041: "Finalizar" abria a Pós do corte sem bruto, onde o render ficava travado,
// e a do corte que só precisava de capa. Medido no navegador na D-1019. O clique só
// leva à tela, sem disparar nada: por isso o rótulo diz o verbo e o destino.

const PASSO_A_PASSO: [string, Partial<StatusExportCorte>, string, string][] = [
  ['sem bruto', {}, 'Gerar bruto no editor', '/projetos/p1/cortes/c7'],
  ['com bruto, sem cenas', { raw_pronto: true }, 'Gerar cenas na Pós', '/projetos/p1/post-production?corte=c7'],
  [
    'com cenas por validar',
    { raw_pronto: true, cenas_geradas: true },
    'Validar cenas na Pós',
    '/projetos/p1/post-production?corte=c7',
  ],
  [
    'cenas validadas, sem render',
    { raw_pronto: true, cenas_geradas: true, cenas_validadas: true },
    'Renderizar na Pós',
    '/projetos/p1/post-production?corte=c7',
  ],
  [
    'render pronto, sem capa',
    {
      raw_pronto: true,
      cenas_geradas: true,
      cenas_validadas: true,
      grade_pronta: true,
      overlays_prontos: true,
      video_pronto: true,
    },
    'Gerar capa em Metadados',
    '/projetos/p1/metadados?corte=c7',
  ],
  [
    'com capa, sem metadados',
    {
      raw_pronto: true,
      cenas_geradas: true,
      cenas_validadas: true,
      grade_pronta: true,
      overlays_prontos: true,
      video_pronto: true,
      thumbnail_pronta: true,
    },
    'Completar metadados',
    '/projetos/p1/metadados?corte=c7',
  ],
  [
    'tudo pronto, ainda sem subir',
    {
      raw_pronto: true,
      cenas_geradas: true,
      cenas_validadas: true,
      grade_pronta: true,
      overlays_prontos: true,
      video_pronto: true,
      thumbnail_pronta: true,
      metadados_completos: true,
    },
    'Revisar',
    '/projetos/p1/final-review?corte=c7',
  ],
];

function proximo(status: Partial<StatusExportCorte>) {
  const ir = vi.fn();
  const tira = montarTira(statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Corte', ...status }), 'aprovado');
  return { ir, passo: proximoDaLinha(tira, 'p1', 'c7', ir) };
}

describe('D-1041 · o principal do corte aprovado', () => {
  it.each(PASSO_A_PASSO)('%s: o verbo e o destino são os da etapa que falta', (_nome, status, texto, destino) => {
    const { ir, passo } = proximo(status);
    expect(passo.texto).toBe(texto);
    passo.acao();
    expect(ir).toHaveBeenCalledWith(destino);
  });

  it('o verbo do botão é o mesmo do "próximo" que a linha mostra ao lado', () => {
    for (const [, status, texto] of PASSO_A_PASSO.slice(0, 3)) {
      const tira = montarTira(statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Corte', ...status }), 'aprovado');
      expect(texto.toLowerCase().startsWith(tira.proxima!.verbo)).toBe(true);
    }
  });

  it('o estado aprovado usa o próximo passo, com o peso forte de sempre', () => {
    const acao = vi.fn();
    const p = primarioDaLinha('aprovado', {
      aprovar: vi.fn(),
      voltar: vi.fn(),
      enviarYoutube: vi.fn(),
      abrirNoYoutube: vi.fn(),
      proximo: { texto: 'Gerar capa em Metadados', icone: 'sparkle', acao },
    });
    expect([p.texto, p.forte]).toEqual(['Gerar capa em Metadados', true]);
    p.acao();
    expect(acao).toHaveBeenCalledOnce();
  });
});
