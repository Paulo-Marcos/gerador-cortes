import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConfiguracaoCapaChatgpt } from '../api';
import { GerarNoChatGPT } from '../GerarNoChatGPT';

// D-804: o botão só habilita quando há onde gerar (o projeto) e o que mandar (o
// prompt) — e, quando não habilita, o title diz o que falta.

const PROJETO = 'https://chatgpt.com/g/g-p-6aa2f1d08414819192ac821e77ded48e/project';

function renderizar(projetoUrl: string, prompt?: string) {
  const qc = new QueryClient();
  const config: ConfiguracaoCapaChatgpt = { projeto_url: projetoUrl, fichas: [], maximo_de_fichas: 10 };
  qc.setQueryData(['capa-chatgpt', 'configuracao'], config);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <GerarNoChatGPT prompt={prompt} proporcao="16:9" entregar={async () => undefined} />
    </QueryClientProvider>,
  );
}

describe('GerarNoChatGPT', () => {
  it('com projeto e prompt, habilita', () => {
    const html = renderizar(PROJETO, 'o sapo aponta');
    expect(html).toContain('Gerar no ChatGPT');
    expect(html).not.toContain('disabled');
    expect(html).toContain('imagem 16:9');
  });

  it('sem projeto configurado, manda para Canais', () => {
    const html = renderizar('', 'o sapo aponta');
    expect(html).toContain('disabled');
    expect(html).toContain('Canais → Capas no ChatGPT');
  });

  it('sem prompt, pede o prompt antes', () => {
    const html = renderizar(PROJETO, '   ');
    expect(html).toContain('disabled');
    expect(html).toContain('Gere o prompt da capa primeiro');
  });
});
