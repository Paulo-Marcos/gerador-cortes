import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import {
  alvosDoLote,
  linhaPassaNoFiltro,
  listaVaziaDoWorkspace,
  podeReordenar,
  selecionadosVisiveis,
  semFiltroNoAr,
  subDoWorkspace,
} from '../cortesDoWorkspace';

// D-866: o Workspace com a trilha. Os quatro cartões e a faixa "Etapas da
// live" saem (a trilha da casca diz isso); o que só os cartões diziam vai
// para o subtítulo; e a etapa Publicado chega com o filtro "No ar".

const pagina = readFileSync(resolve(__dirname, '../WorkspaceProjetoPage.tsx'), 'utf8');
const hook = readFileSync(resolve(__dirname, '../useWorkspaceProjeto.tsx'), 'utf8');
const selo = readFileSync(resolve(__dirname, '../SeloNoAr.tsx'), 'utf8');

function linha(numero: number, titulo: string, youtube_url_publicado = '') {
  return {
    ...statusExportPendente({ corte_id: `c${numero}`, numero, titulo, video_pronto: false }),
    youtube_url_publicado,
  };
}

describe('Workspace sem os cartões e sem a faixa de etapas', () => {
  it('saem os quatro cartões de números', () => {
    expect(pagina).not.toContain('function Estatistica');
    expect(pagina).not.toMatch(/rotulo="(Renders|No ar|Disco)"/);
  });

  it('sai a faixa "Etapas da live" — as etapas moram na trilha da casca', () => {
    expect(pagina).not.toMatch(/>Etapas da live</);
    expect(pagina).not.toMatch(/etapas\.map/);
  });

  it('as ações do projeto continuam na tela', () => {
    expect(pagina).toContain('Abrir a pasta do projeto');
    expect(pagina).toContain('Reanalisar');
    expect(pagina).toContain('Gerar trechos de todos os cortes');
  });
});

describe('subDoWorkspace', () => {
  const base = { duracao: '2:18:15', cortes: 6, fires: 1, publicados: 0, agendados: 0, arquivosLimpos: false };

  it('leva o que só os cartões diziam: agendados e o disco', () => {
    expect(subDoWorkspace({ ...base, publicados: 2, agendados: 3 })).toBe(
      '2:18:15 de live · 6 cortes · 1 fire · 2 no ar · +3 agendados · bruto guardado em disco',
    );
    expect(subDoWorkspace({ ...base, arquivosLimpos: true })).toContain('mídia pesada apagada');
  });

  it('sem nada no ar diz isso em palavras e não fala de agendados', () => {
    expect(subDoWorkspace(base)).toBe(
      '2:18:15 de live · 6 cortes · 1 fire · nenhum no ar · bruto guardado em disco',
    );
  });
});

describe('filtro "No ar"', () => {
  const noAr = linha(1, 'Pedro II e a Igreja', 'https://youtu.be/x');
  const naoSubiu = linha(2, 'Batman não é Homero');

  it('com o filtro, só passa o que já está no ar', () => {
    expect(linhaPassaNoFiltro(noAr, '', true)).toBe(true);
    expect(linhaPassaNoFiltro(naoSubiu, '', true)).toBe(false);
  });

  it('sem o filtro passa tudo, e a busca por título ou número segue valendo', () => {
    expect(linhaPassaNoFiltro(naoSubiu, '', false)).toBe(true);
    expect(linhaPassaNoFiltro(naoSubiu, 'batman', false)).toBe(true);
    expect(linhaPassaNoFiltro(naoSubiu, '2', false)).toBe(true);
    expect(linhaPassaNoFiltro(noAr, 'batman', true)).toBe(false);
  });

  it('a lista do Workspace passa pelo filtro com o "No ar" da URL', () => {
    expect(hook).toContain('linhaPassaNoFiltro(status, termo, soNoAr)');
  });

  it('a tela mostra o filtro ligado num selo que o desliga', () => {
    expect(pagina).toContain(
      '{soNoAr ? <SeloNoAr total={linhas.length} onTirar={tirarFiltroNoAr} /> : null}',
    );
    expect(selo).toMatch(/onClick=\{onTirar\}[\s\S]*?Só os no ar · \{total\}/);
  });

  it('lista vazia pelo filtro diz por quê e não oferece analisar a live', () => {
    expect(listaVaziaDoWorkspace('', true)).toEqual({
      texto: 'Nenhum corte no ar ainda',
      ofereceAnalise: false,
    });
    expect(listaVaziaDoWorkspace('xyz', false).ofereceAnalise).toBe(false);
    expect(listaVaziaDoWorkspace('', false)).toEqual({
      texto: 'Esta live ainda não tem cortes',
      ofereceAnalise: true,
    });
  });
});

describe('filtro "No ar" · o que a auditoria pegou', () => {
  const linhas = [{ status: { corte_id: 'a' } }, { status: { corte_id: 'b' } }];

  it('o lote age só sobre os selecionados que estão na tela', () => {
    expect([...selecionadosVisiveis(new Set(['a', 'x']), linhas)]).toEqual(['a']);
    expect(hook).toContain('selecionadosVisiveis(selecao, linhas)');
  });

  it('os alvos do lote são os cortes selecionados E visíveis', () => {
    const cortes = [{ id: 'a' }, { id: 'b' }, { id: 'x' }];
    // 'x' foi selecionado e depois escondido pelo filtro: fica fora do lote.
    expect(alvosDoLote(cortes, new Set(['a', 'x']), linhas).map((c) => c.id)).toEqual(['a']);
    expect(hook).toContain('alvosDoLote(cortes, selecao, linhas)');
  });

  it('▲/▼ ficam desligados com a lista filtrada ou buscada', () => {
    expect(podeReordenar('', false)).toBe(true);
    expect(podeReordenar('', true)).toBe(false);
    expect(podeReordenar('pedro', false)).toBe(false);
    expect(podeReordenar('   ', false)).toBe(true);
    expect(pagina).toContain('podeSubir={podeReordenar(busca, soNoAr) && i > 0}');
    expect(pagina).toContain('podeDescer={podeReordenar(busca, soNoAr) && i < linhas.length - 1}');
  });

  it('desligar o filtro preserva o resto da URL', () => {
    const resto = semFiltroNoAr(new URLSearchParams('filtro=no-ar&corte=7'));
    expect(resto.toString()).toBe('corte=7');
    expect(hook).toContain('setParametros(semFiltroNoAr)');
  });

  it('a tela usa a regra da lista vazia, e o subtítulo recebe os agendados', () => {
    expect(pagina).toContain('{!listaVazia.ofereceAnalise ? null : (');
    expect(hook).toMatch(/subDoWorkspace\(\{[^}]*\bagendados,/);
  });

  it('o selo diz ao leitor de tela que o clique tira o filtro', () => {
    expect(selo).toContain('aria-label={`Tirar o filtro: só os no ar (${total})`}');
  });
});
