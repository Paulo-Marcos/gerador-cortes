import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { StatusCorte, StatusExportCorte } from '@/types/models';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import {
  barraDoWorkspace,
  chipDaProntidao,
  pedidoAprovarPropostos,
  proximaAcaoDaLive,
  type DadosDoRodape,
} from '../rodapeDoWorkspace';

// D-870 (Onda 3, nota 5): "Ação principal no rodapé — o botão diz o próximo
// passo da live e fica sempre no canto inferior direito, como no editor."
// Decisões do Paulo: Aprovar os N propostos com confirmação → renderizar
// (leva à Pós do próximo corte sem render, não há render em lote) →
// publicar; gerar trechos fica fora do rodapé.

const corte = (id: string, numero: number, status: StatusCorte) => ({ id, numero, status });
const exportado = (corte_id: string, campos: Partial<StatusExportCorte> = {}) => ({
  ...statusExportPendente({ corte_id, numero: 0, titulo: '' }),
  ...campos,
});
const prontidao = (total: number, liberado: boolean, detalhe = 'motivo') => ({
  total,
  liberado,
  detalhe,
});

function dados(extra: Partial<DadosDoRodape> = {}): DadosDoRodape {
  return {
    cortes: [corte('a', 1, 'aprovado'), corte('b', 2, 'aprovado')],
    statusList: [exportado('a', { video_pronto: true }), exportado('b', { video_pronto: true })],
    prontidao: prontidao(2, true),
    arquivosLimpos: false,
    ...extra,
  };
}

describe('proximaAcaoDaLive', () => {
  it('live sem cortes: analisar', () => {
    expect(proximaAcaoDaLive(dados({ cortes: [], statusList: [] }))).toEqual({ tipo: 'analisar' });
  });

  it('com propostos, o primeiro passo é aprovar os N propostos', () => {
    const d = dados({
      cortes: [corte('a', 1, 'proposto'), corte('b', 2, 'proposto'), corte('c', 3, 'aprovado')],
    });
    expect(proximaAcaoDaLive(d)).toEqual({ tipo: 'aprovar', quantos: 2 });
  });

  it('sem propostos, renderizar o primeiro aprovado sem render, na ordem da live', () => {
    const d = dados({
      cortes: [corte('a', 1, 'aprovado'), corte('b', 2, 'processado'), corte('c', 3, 'aprovado')],
      statusList: [exportado('a', { video_pronto: true }), exportado('b'), exportado('c')],
    });
    expect(proximaAcaoDaLive(d)).toEqual({ tipo: 'renderizar', corteId: 'b', numero: 2 });
  });

  it('corte no ar ou rejeitado não pede render', () => {
    const d = dados({
      cortes: [corte('a', 1, 'aprovado'), corte('b', 2, 'rejeitado')],
      statusList: [exportado('a', { youtube_url_publicado: 'u' }), exportado('b')],
      prontidao: prontidao(0, false),
    });
    expect(proximaAcaoDaLive(d)).toEqual({ tipo: 'no-ar' });
  });

  it('live limpa (encerrada, D-866) não manda renderizar o que teve o vídeo apagado', () => {
    const d = dados({ statusList: [exportado('a'), exportado('b')], arquivosLimpos: true });
    expect(proximaAcaoDaLive(d).tipo).toBe('publicar');
  });

  it('tudo renderizado: publicar — liberado ou não, com o motivo', () => {
    expect(proximaAcaoDaLive(dados())).toEqual({
      tipo: 'publicar',
      total: 2,
      liberado: true,
      motivo: 'motivo',
    });
    expect(proximaAcaoDaLive(dados({ prontidao: prontidao(2, false, 'falta capa') }))).toMatchObject({
      tipo: 'publicar',
      liberado: false,
      motivo: 'falta capa',
    });
  });

  it('nada a publicar: tudo no ar', () => {
    expect(proximaAcaoDaLive(dados({ prontidao: prontidao(0, false) }))).toEqual({ tipo: 'no-ar' });
  });
});

describe('barraDoWorkspace', () => {
  function h() {
    return { analisar: vi.fn(), aprovarPropostos: vi.fn(), renderizar: vi.fn(), publicar: vi.fn() };
  }

  it('cada passo vira o botão principal do rodapé, com o verbo e a ação certos', () => {
    const fns = h();
    const p = (acao: Parameters<typeof barraDoWorkspace>[0]) => barraDoWorkspace(acao, fns).primario;

    expect(p({ tipo: 'analisar' }).texto).toBe('Analisar com a IA');
    p({ tipo: 'analisar' }).onClick!();
    expect(fns.analisar).toHaveBeenCalledOnce();

    expect(p({ tipo: 'aprovar', quantos: 3 }).texto).toBe('Aprovar os 3 propostos');
    expect(p({ tipo: 'aprovar', quantos: 1 }).texto).toBe('Aprovar o proposto');
    p({ tipo: 'aprovar', quantos: 3 }).onClick!();
    expect(fns.aprovarPropostos).toHaveBeenCalledWith(3);

    expect(p({ tipo: 'renderizar', corteId: 'b', numero: 2 }).texto).toBe('Renderizar o #2');
    p({ tipo: 'renderizar', corteId: 'b', numero: 2 }).onClick!();
    expect(fns.renderizar).toHaveBeenCalledWith('b');

    const publicar = p({ tipo: 'publicar', total: 2, liberado: true, motivo: 'm' });
    expect([publicar.texto, publicar.icone, publicar.desabilitado]).toEqual([
      'Publicar 2 cortes',
      ICONE_DO_CONCEITO.publicar,
      false,
    ]);
    publicar.onClick!();
    expect(fns.publicar).toHaveBeenCalledOnce();
  });

  it('publicar ainda não liberado fica visível e apagado, dizendo por quê', () => {
    const p = barraDoWorkspace({ tipo: 'publicar', total: 1, liberado: false, motivo: 'falta capa' }, h()).primario;
    expect([p.texto, p.desabilitado, p.motivo]).toEqual(['Publicar 1 corte', true, 'falta capa']);
  });

  it('tudo no ar: o botão fica, apagado, dizendo isso', () => {
    const p = barraDoWorkspace({ tipo: 'no-ar' }, h()).primario;
    expect([p.texto, p.desabilitado]).toEqual(['Tudo no ar', true]);
    expect(p.motivo).toMatch(/nada a publicar/i);
  });

  it('o lote de aprovação pede confirmação, dizendo quantos', () => {
    expect(pedidoAprovarPropostos(3)).toMatchObject({
      titulo: 'Aprovar os 3 propostos',
      confirmLabel: 'Aprovar 3',
    });
  });
});

describe('chipDaProntidao', () => {
  it('nada a publicar é neutro (live fechada), lote pronto é ok, pendência é aviso', () => {
    expect(chipDaProntidao({ total: 0, liberado: false, resumo: '' })).toMatchObject({
      texto: 'nada a publicar',
      cor: 'var(--mute)',
    });
    expect(chipDaProntidao({ total: 2, liberado: true, resumo: '' })).toMatchObject({
      texto: 'lote pronto',
      cor: 'var(--ok)',
    });
    expect(chipDaProntidao({ total: 2, liberado: false, resumo: '1/2 prontos' })).toMatchObject({
      texto: '1/2 prontos',
      cor: 'var(--warn)',
    });
  });
});

describe('o Workspace liga o rodapé', () => {
  const hook = readFileSync(resolve(__dirname, '../useWorkspaceProjeto.tsx'), 'utf8');
  const pagina = readFileSync(resolve(__dirname, '../WorkspaceProjetoPage.tsx'), 'utf8');

  it('o passo vem dos dados da live, inclusive a live limpa', () => {
    expect(hook).toMatch(
      /proximaAcaoDaLive\(\{\s*cortes,\s*statusList,\s*prontidao,\s*arquivosLimpos: Boolean\(dados\?\.arquivos_limpos\),\s*\}\)/,
    );
  });

  it('cada passo chama a ação certa da tela', () => {
    expect(hook).toContain('analisar: () => setAnaliseAberta(true),');
    expect(hook).toMatch(
      /aprovarPropostos: \(n\) =>\s*confirmacao\.executarOuPedir\(pedidoAprovarPropostos\(n\), \(\) => void aplicarEmLote\('aprovar', cortes\)\)/,
    );
    expect(hook).toContain('renderizar: (corte) => navigate(`/projetos/${id}/post-production?corte=${corte}`),');
    expect(hook).toContain('publicar: () => setPublicarAberto(true),');
  });

  it('aprovar os propostos usa o mesmo lote da seleção, com todos os cortes', () => {
    expect(hook).toMatch(/async function aplicarEmLote\(\s*acao: 'aprovar' \| 'devolver',\s*alvos = alvosDoLote\(cortes, selecao, linhas\),/);
  });

  it('o rodapé republica quando o passo muda, por uma chave estável', () => {
    expect(hook).toContain('JSON.stringify(proxima),');
  });

  it('o Publicar saiu da faixa: mora no rodapé', () => {
    expect(pagina).not.toContain('setPublicarAberto(true)');
    expect(pagina).not.toMatch(/Publicar \$\{prontidao\.total\}/);
  });
});
