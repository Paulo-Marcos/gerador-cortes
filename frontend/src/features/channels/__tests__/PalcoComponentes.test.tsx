import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PalcoComponentes } from '../api/canais';
import { PalcoComponentesForm, edicaoDe, rascunhoDe } from '../PalcoComponentesSection';
import { paraComponentesDoPalco, urlDaImagem } from '../palcoDoCanal';

function palco(extra: Partial<PalcoComponentes> = {}): PalcoComponentes {
  return {
    canal_id: 'default',
    estilo: 'atual',
    estilos: ['atual', 'limpo'],
    fundo: 'reticula-aurora',
    fundos: ['reticula-aurora', 'reticula', 'aurora', 'linho', 'chapado'],
    cabecalho: {
      ativo: true,
      nome: '',
      handle: '',
      imagem: '',
      nome_efetivo: 'Seu Canal',
      handle_efetivo: '@seucanal',
      imagem_url: '/api/channels/default/palco/imagem?v=1',
    },
    placa: { ativo: true },
    ...extra,
  };
}

describe('rascunho e edição do palco (D-911)', () => {
  it('o rascunho parte do que o canal gravou e a edição devolve tudo', () => {
    const rascunho = rascunhoDe(palco({ estilo: 'limpo', placa: { ativo: false } }));
    expect(rascunho.estilo).toBe('limpo');
    expect(rascunho.placaAtiva).toBe(false);
    expect(edicaoDe({ ...rascunho, nome: 'Pedro', handle: '@pedro' })).toEqual({
      estilo: 'limpo',
      fundo: 'reticula-aurora',
      cabecalho: { ativo: true, nome: 'Pedro', handle: '@pedro' },
      placa: { ativo: false },
    });
  });

  it('a resposta vira o que a prévia desenha, com a imagem na origem da API', () => {
    const componentes = paraComponentesDoPalco(palco({ estilo: 'limpo' }));
    expect(componentes.estilo).toBe('limpo');
    expect(componentes.fundo).toBe('reticula-aurora');
    expect(componentes.cabecalho.nome).toBe('Seu Canal');
    expect(componentes.cabecalho.handle).toBe('@seucanal');
    expect(componentes.cabecalho.imagemUrl).toMatch(/\/api\/channels\/default\/palco\/imagem\?v=1$/);
    expect(urlDaImagem('')).toBe('');
    expect(paraComponentesDoPalco(undefined).estilo).toBe('atual');
  });
});

describe('PalcoComponentesForm', () => {
  const nada = () => undefined;

  it('mostra os dois estilos, marca o escolhido e os interruptores', () => {
    const html = renderToStaticMarkup(
      <PalcoComponentesForm
        rascunho={rascunhoDe(palco({ estilo: 'limpo' }))}
        palco={palco({ estilo: 'limpo' })}
        pendente={false}
        enviandoImagem={false}
        onMudar={nada}
        onSalvar={nada}
        onEnviarImagem={nada}
        onRemoverImagem={nada}
      />,
    );
    expect(html).toContain('Atual');
    expect(html).toContain('Limpo');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Mostrar o cabeçalho');
    expect(html).toContain('Mostrar a placa');
    expect(html).toContain('Pose padrão do mascote');
    // No limpo aparece a escolha do fundo, com o padrão marcado.
    expect(html).toContain('Fundo do palco limpo');
    expect(html).toContain('Retícula + aurora');
    expect(html).not.toContain('Voltar ao mascote');
    // Vazio herda da identidade: o placeholder diz o que vai aparecer.
    expect(html).toContain('placeholder="Seu Canal"');
    expect(html).toContain('placeholder="@seucanal"');
  });

  it('com imagem própria oferece voltar ao mascote', () => {
    const comImagem = palco({
      cabecalho: {
        ...palco().cabecalho,
        imagem: 'cabecalho.png',
        imagem_url: '/api/channels/default/palco/imagem?v=2',
      },
    });
    const html = renderToStaticMarkup(
      <PalcoComponentesForm
        rascunho={rascunhoDe(comImagem)}
        palco={comImagem}
        pendente={false}
        enviandoImagem={false}
        onMudar={nada}
        onSalvar={nada}
        onEnviarImagem={nada}
        onRemoverImagem={nada}
      />,
    );
    expect(html).toContain('Imagem do canal');
    expect(html).toContain('Voltar ao mascote');
  });
});
