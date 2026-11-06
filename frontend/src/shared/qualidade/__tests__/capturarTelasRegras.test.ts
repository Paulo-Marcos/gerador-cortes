import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  acharAlvo,
  conferirAbertura,
  conferirClique,
  conferirTema,
  criarRegistroDeHashes,
  ErroDeCaptura,
  escolherProjetosPadrao,
  montarClique,
} from '../../../../../scripts/capturar-telas-regras.mjs';

// D-1069: na v0.7.0 o scripts/capturar-telas.mjs saiu com exit 0 e 13 das
// 28 capturas iguais a outras — botão não achado, `?.click()` calado, tema
// numa chave morta. Estas regras viram cada silêncio em erro com o nome da
// tela. O teste mora no vitest do frontend porque é o portão que já roda
// JavaScript no CI; o script em si não tem runner próprio.

const SCRIPT = path.resolve(__dirname, '../../../../../scripts/capturar-telas.mjs');

type ElementoFalso = {
  textContent: string;
  disabled?: boolean;
  visivel?: boolean;
  rotulo?: string;
  click: () => void;
};

/** Roda a expressão de `montarClique` contra um `document` de mentira. */
function clicarEm(elementos: ElementoFalso[], alvo: Parameters<typeof montarClique>[0]) {
  const documento = {
    querySelectorAll: () =>
      elementos.map((e) => ({
        ...e,
        getClientRects: () => (e.visivel === false ? [] : [{}]),
        getAttribute: (nome: string) => (nome === 'aria-label' ? (e.rotulo ?? null) : null),
      })),
  };
  return new Function('document', `return ${montarClique(alvo)}`)(documento);
}

describe('acharAlvo', () => {
  const candidatos = [
    { texto: 'Novo corte', rotulo: '' },
    { texto: '', rotulo: 'Metadados do corte #1 — editar aqui' },
    // O rodapé dos Metadados escreve o glifo do atalho junto do texto.
    { texto: 'Publicar 3 cortes↵', rotulo: '' },
  ];

  it('acha pelo texto exato, pelo começo, pelo trecho e pelo regex', () => {
    expect(acharAlvo(candidatos, { nome: 'Novo corte' })).toBe(0);
    expect(acharAlvo(candidatos, { nomeComeca: 'Metadados do corte #' })).toBe(1);
    expect(acharAlvo(candidatos, { nomeContem: 'editar aqui' })).toBe(1);
    expect(acharAlvo(candidatos, { nomeRegex: '^Publicar \\d+ cortes?\\b' })).toBe(2);
  });

  it('nome exato não casa com trecho, e o ausente dá -1', () => {
    expect(acharAlvo(candidatos, { nome: 'Novo' })).toBe(-1);
    expect(acharAlvo(candidatos, { nome: 'Análise IA' })).toBe(-1);
  });
});

describe('montarClique', () => {
  it('sem o botão, não clica nada e diz que não achou', () => {
    const outro = { textContent: 'Outro', click: vi.fn() };
    expect(clicarEm([outro], { nome: 'Análise IA' })).toEqual({ achou: false, desabilitado: false });
    expect(outro.click).not.toHaveBeenCalled();
  });

  it('clica no botão visível que casa, pelo texto ou pelo aria-label', () => {
    const escondido = { textContent: 'Mais', visivel: false, click: vi.fn() };
    const visivel = { textContent: 'Mais', click: vi.fn() };
    expect(clicarEm([escondido, visivel], { nome: 'Mais' })).toEqual({ achou: true, desabilitado: false });
    expect(escondido.click).not.toHaveBeenCalled();
    expect(visivel.click).toHaveBeenCalledOnce();

    const icone = { textContent: '', rotulo: 'Metadados do corte #2', click: vi.fn() };
    clicarEm([icone], { nomeComeca: 'Metadados do corte #' });
    expect(icone.click).toHaveBeenCalledOnce();
  });

  it('botão desabilitado não é clicado e volta marcado', () => {
    const publicar = { textContent: 'Publicar 2 cortes', disabled: true, click: vi.fn() };
    expect(clicarEm([publicar], { nomeRegex: '^Publicar \\d+ cortes?\\b' })).toEqual({
      achou: true,
      desabilitado: true,
    });
    expect(publicar.click).not.toHaveBeenCalled();
  });
});

describe('conferências que param o script', () => {
  it('seletor ausente vira erro com o nome da tela', () => {
    const conferir = () =>
      conferirClique({ achou: false, desabilitado: false }, '21-modal-analise-ia', { nome: 'Reanalisar' });
    expect(conferir).toThrow(ErroDeCaptura);
    expect(conferir).toThrow('[21-modal-analise-ia] não achei o botão "Reanalisar" na tela.');
  });

  it('alvo desabilitado também para, com a dica do que falta', () => {
    expect(() =>
      conferirClique({ achou: true, desabilitado: true }, '23-modal-publicar-massa', { nome: 'X' }, 'Precisa de corte pronto.'),
    ).toThrow('[23-modal-publicar-massa] o botão "X" está desabilitado. Precisa de corte pronto.');
  });

  it('clique certo passa calado', () => {
    expect(() => conferirClique({ achou: true, desabilitado: false }, 't', { nome: 'X' })).not.toThrow();
  });

  it('modal que não apareceu é erro', () => {
    expect(() => conferirAbertura(0, 0, '25-modal-atalhos-editor', '[role="dialog"]')).toThrow(
      '[25-modal-atalhos-editor] o clique não abriu nada',
    );
    expect(() => conferirAbertura(0, 1, 't', '[role="dialog"]')).not.toThrow();
  });

  it('tema escuro que não pegou é erro', () => {
    expect(() => conferirTema('light', 'dark', '01-biblioteca')).toThrow(
      '[01-biblioteca] pedi o tema "dark", a casca está em "light".',
    );
    expect(() => conferirTema(null, 'dark', '01-biblioteca')).toThrow('a casca está em "nenhum"');
    expect(() => conferirTema('dark', 'dark', '01-biblioteca')).not.toThrow();
  });
});

describe('criarRegistroDeHashes', () => {
  it('captura igual a outra já tirada é erro que cita as duas', () => {
    const registro = criarRegistroDeHashes();
    registro.registrar('01-biblioteca', '01-biblioteca.jpg', Buffer.from('tela clara'));
    expect(() =>
      registro.registrar('01-biblioteca', '01-biblioteca-escuro.jpg', Buffer.from('tela clara')),
    ).toThrow(/\[01-biblioteca\] 01-biblioteca-escuro\.jpg saiu idêntica a 01-biblioteca\.jpg/);
  });

  it('capturas diferentes passam e devolvem o sha256', () => {
    const registro = criarRegistroDeHashes();
    const a = registro.registrar('a', 'a.jpg', Buffer.from('a'));
    const b = registro.registrar('b', 'b.jpg', Buffer.from('b'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe('escolherProjetosPadrao', () => {
  const projetos = [
    { id: 'limpo', arquivo_video_path: 'video.mkv', arquivos_limpos: true, total_cortes: 12 },
    { id: 'muitos', arquivo_video_path: 'video.mkv', arquivos_limpos: false, total_cortes: 9 },
    { id: 'prontos', arquivo_video_path: 'video.mkv', arquivos_limpos: false, total_cortes: 7 },
    { id: 'um', arquivo_video_path: 'video.mkv', arquivos_limpos: false, total_cortes: 1 },
  ];

  it('vídeo: o de mais cortes com o vídeo ainda no disco', () => {
    expect(escolherProjetosPadrao(projetos).comVideo).toBe('muitos');
  });

  it('vários cortes: prontos para publicar primeiro, depois o número de cortes', () => {
    expect(escolherProjetosPadrao(projetos, { prontos: 3 }).multiCortes).toBe('prontos');
    expect(escolherProjetosPadrao(projetos).multiCortes).toBe('limpo');
  });

  it('banco sem candidato é erro, não um ID inventado', () => {
    expect(() => escolherProjetosPadrao([])).toThrow('[projetos] nenhum projeto com vídeo');
    expect(() => escolherProjetosPadrao([projetos[3]])).toThrow('dois ou mais cortes');
  });
});

describe('capturar-telas.mjs', () => {
  const script = readFileSync(SCRIPT, 'utf8');

  it('não tem mais clique calado, chave de tema morta nem ID fixo', () => {
    expect(script).not.toContain('?.click()');
    expect(script).not.toContain('wb-theme');
    expect(script).not.toMatch(/\?\? '[0-9a-f]{8}-/);
    expect(script).toContain("localStorage.setItem('upgrade-theme'");
  });

  it('confere tema, abertura e hash em toda captura', () => {
    for (const regra of ['conferirTema(', 'conferirAbertura(', 'hashes.registrar(', 'conferirClique(']) {
      expect(script).toContain(regra);
    }
  });
});
