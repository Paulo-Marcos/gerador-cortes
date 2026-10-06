import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErroDaApi } from '@/shared/api';
import type { Corte } from '@/types/models';
import {
  applyDesvioChange,
  desfechoDaFalhaAoSalvar,
  mergeDirtyPatch,
  resolveWaveformWindow,
} from '../editorEditState';

type DesvioDoCorte = Corte['desvios'][number];

function desvio(inicio: string, fim: string, motivo = 'trecho'): DesvioDoCorte {
  return { inicio_hms: inicio, fim_hms: fim, motivo } as DesvioDoCorte;
}

describe('estado sujo do editor', () => {
  it('acumula várias alterações de trechos antes de salvar', () => {
    const persisted = [
      desvio('00:00:10', '00:00:20', 'primeiro'),
      desvio('00:00:30', '00:00:40', 'segundo'),
    ];

    const afterFirst = applyDesvioChange(persisted, {}, 0, '00:00:11', '00:00:21');
    expect(afterFirst?.desvios?.[0]).toMatchObject({ inicio_hms: '00:00:11', fim_hms: '00:00:21' });

    const afterSecond = applyDesvioChange(persisted, afterFirst ?? {}, 1, '00:00:31', '00:00:41');

    expect(afterSecond?.desvios).toEqual([
      { inicio_hms: '00:00:11', fim_hms: '00:00:21', motivo: 'primeiro' },
      { inicio_hms: '00:00:31', fim_hms: '00:00:41', motivo: 'segundo' },
    ]);
  });

  it('preserva outras mudanças pendentes ao alterar um trecho', () => {
    const currentDirty: Partial<Corte> = mergeDirtyPatch({}, { titulo_proposto: 'Novo titulo' });

    const next = applyDesvioChange(
      [desvio('00:00:10', '00:00:20')],
      currentDirty,
      0,
      '00:00:12',
      '00:00:22',
    );

    expect(next).toMatchObject({
      titulo_proposto: 'Novo titulo',
      desvios: [{ inicio_hms: '00:00:12', fim_hms: '00:00:22', motivo: 'trecho' }],
    });
  });
});

describe('janela incremental da waveform', () => {
  it('reusa a janela carregada quando o corte salvo ainda cabe no buffer existente', () => {
    const initial = resolveWaveformWindow({
      current: null,
      corteId: 'corte-1',
      inicioSeg: 100,
      fimSeg: 200,
      refreshKey: 0,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    const next = resolveWaveformWindow({
      current: initial,
      corteId: 'corte-1',
      inicioSeg: 80,
      fimSeg: 230,
      refreshKey: 0,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    expect(next).toBe(initial);
  });

  it('cria uma nova janela quando o corte sai do buffer carregado', () => {
    const initial = resolveWaveformWindow({
      current: null,
      corteId: 'corte-1',
      inicioSeg: 100,
      fimSeg: 200,
      refreshKey: 0,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    const next = resolveWaveformWindow({
      current: initial,
      corteId: 'corte-1',
      inicioSeg: 30,
      fimSeg: 200,
      refreshKey: 0,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    expect(next).not.toBe(initial);
    expect(next).toMatchObject({ startSec: 0, endSec: 500 });
  });

  // D-451: o respiro vem de um ajuste que chega da API DEPOIS do primeiro
  // render. Sem invalidar a janela memoizada, o `startSec` congelaria no
  // padrão e a onda ficaria deslocada do vídeo pela diferença.
  it('recria a janela quando o contexto configurado muda', () => {
    const initial = resolveWaveformWindow({
      current: null,
      corteId: 'corte-1',
      inicioSeg: 1000,
      fimSeg: 1100,
      refreshKey: 0,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    const next = resolveWaveformWindow({
      current: initial,
      corteId: 'corte-1',
      inicioSeg: 1000,
      fimSeg: 1100,
      refreshKey: 0,
      preloadBeforeSec: 180,
      preloadAfterSec: 600,
    });

    expect(next).not.toBe(initial);
    expect(next).toMatchObject({ startSec: 820, endSec: 1700 });
  });

  it('força nova janela quando o usuário pede atualização da onda', () => {
    const initial = resolveWaveformWindow({
      current: null,
      corteId: 'corte-1',
      inicioSeg: 100,
      fimSeg: 200,
      refreshKey: 0,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    const next = resolveWaveformWindow({
      current: initial,
      corteId: 'corte-1',
      inicioSeg: 100,
      fimSeg: 200,
      refreshKey: 123,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    expect(next).not.toBe(initial);
    expect(next.version).toBe('40_500_123');
  });
});

// D-883: excluir o corte com um ajuste pendente prendia o editor. A saída
// tentava salvar o ajuste no corte excluído, recebia 404, avisava "não
// consegui salvar" e ficava — para sempre, porque nada mais limpava o ajuste.
describe('saída do editor quando salvar falha (D-883)', () => {
  it('404: o corte não existe mais — descarta o ajuste e deixa sair', () => {
    const desfecho = desfechoDaFalhaAoSalvar(new ErroDaApi(404, '{"detail":"Corte não encontrado"}', 'Not Found'));
    expect(desfecho.sair).toBe(true);
    expect(desfecho.tom).toBe('info');
    expect(desfecho.mensagem).toBe('Este corte não existe mais; os ajustes dele foram descartados.');
  });

  it.each([
    ['erro do servidor', new ErroDaApi(500, '', 'Internal Server Error')],
    ['conflito', new ErroDaApi(409, '', 'Conflict')],
    ['rede fora', new TypeError('Failed to fetch')],
  ])('%s: fica no corte, para o ajuste não se perder', (_caso, erro) => {
    const desfecho = desfechoDaFalhaAoSalvar(erro);
    expect(desfecho.sair).toBe(false);
    expect(desfecho.tom).toBe('error');
    expect(desfecho.mensagem).toBe(
      `Não consegui salvar os ajustes (${erro.message}). Fiquei no corte — tente Ctrl+S.`,
    );
  });

  // O hook não roda aqui (vitest sem DOM, e o bloqueio vive num efeito): a
  // regra é pura e testada acima; aqui se confere que o hook a obedece. O fonte
  // é lido SEM comentários — código comentado não pode passar por ligado.
  const hook = readFileSync(resolve(__dirname, '../useEditorPage.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

  it('a saída bloqueada segue o desfecho, inteiro e nessa ordem', () => {
    const aoFalhar = hook.match(/onError: \(erro\) => \{(.*?)\n {8}\},/s)![1];
    expect(aoFalhar).toMatch(
      /^\s*const desfecho = desfechoDaFalhaAoSalvar\(erro\);\s*notifyToast\(desfecho\.mensagem, \{ tone: desfecho\.tom \}\);\s*if \(!desfecho\.sair\) return saida\.reset\(\);\s*editHistory\.reset\(\{\}\);\s*saida\.proceed\(\);\s*$/,
    );
  });

  // É este ramo que solta o editor depois de excluir: o bloqueio ainda vê o
  // estado sujo da render anterior, mas o ajuste já foi descartado.
  it('sem ajuste pendente, a saída bloqueada só segue', () => {
    expect(hook).toMatch(
      /const pendentes = editHistory\.getPresent\(\);\s*if \(Object\.keys\(pendentes\)\.length === 0\) \{\s*saida\.proceed\(\);\s*return;\s*\}/,
    );
  });

  it('excluir descarta o ajuste antes de tudo, em qualquer caminho', () => {
    const aoExcluir = hook.match(/function excluirConfirmado\(\) \{(.*?)\r?\n {2}\}\r?\n/s)![1];
    expect(aoExcluir).toMatch(/onSuccess: \(\) => \{\s*editHistory\.reset\(\{\}\);\s*if \(cortes\.length > 1\)/);
  });
});
