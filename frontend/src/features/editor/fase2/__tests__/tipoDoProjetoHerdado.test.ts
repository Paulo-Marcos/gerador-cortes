import { describe, expect, it } from 'vitest';
import { montarPadraoJson, podeVoltarAHerdar, tipoDoProjeto } from '../youtubeLayoutPadrao';
import { DEFAULT_YOUTUBE_LAYOUT } from '@/shared/palco/youtubeLayout';

// D-966 (auditoria do PR #234): o "tipo do projeto" lia só o JSON cru do
// projeto ('{}' dava FULL). Sem as cópias do Global nos projetos, todo projeto
// que herda passava a MOSTRAR FULL — e "Definir posicionamento" gravava esse
// FULL como modo do projeto, trocando o render de todos os cortes herdeiros.

const GLOBAL_COMP = JSON.stringify({ modo_padrao: 'compartilhada' });

describe('tipo do projeto herdado do Global (D-966)', () => {
  it('o projeto sem modo próprio mostra o modo do Global', () => {
    expect(tipoDoProjeto('{}', GLOBAL_COMP)).toBe('compartilhada');
    expect(tipoDoProjeto(JSON.stringify({ fundo: 'cosmograph' }), GLOBAL_COMP)).toBe(
      'compartilhada',
    );
  });

  it('o modo próprio do projeto vence o do Global', () => {
    expect(tipoDoProjeto(JSON.stringify({ modo_padrao: 'full' }), GLOBAL_COMP)).toBe('full');
  });

  it('sem nada em nenhum nível, o padrão do app', () => {
    expect(tipoDoProjeto(undefined, undefined)).toBe(DEFAULT_YOUTUBE_LAYOUT.modo_padrao);
  });

  it('definir posicionamento num projeto que herda o modo não grava modo nenhum', () => {
    const json = montarPadraoJson('{}', { compartilhada: DEFAULT_YOUTUBE_LAYOUT.compartilhada });

    expect(JSON.parse(json)).not.toHaveProperty('modo_padrao');
    expect(tipoDoProjeto(json, GLOBAL_COMP)).toBe('compartilhada');
  });
});

describe('o ↺ do modo do corte (D-966)', () => {
  it('só aparece com o painel limpo e o corte com modo próprio', () => {
    expect(podeVoltarAHerdar(false, false)).toBe(true);
    expect(podeVoltarAHerdar(false, true)).toBe(false);
    expect(podeVoltarAHerdar(true, false)).toBe(false);
  });
});
