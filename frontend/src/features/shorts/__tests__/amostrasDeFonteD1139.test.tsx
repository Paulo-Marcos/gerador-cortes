import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SpeakerLabelOverlay } from '@/shared/palco/youtubeChrome';
import { AmostrasDeFonte } from '../AmostrasDeFonte';
import { FONTES_DA_LEGENDA } from '../LegendaPrevia';

// D-1139: o seletor único de fonte dos modais de palco e de gancho.
const montar = (extra: Partial<Parameters<typeof AmostrasDeFonte>[0]> = {}) =>
  renderToStaticMarkup(
    <AmostrasDeFonte valor="Anton" onEscolher={() => {}} rotulo="Fonte da legenda" classeDaEscolhida="ESCOLHIDA" {...extra} />,
  );

describe('AmostrasDeFonte', () => {
  it('uma amostra por fonte, com o rótulo e o nome nos atributos de acessibilidade', () => {
    const html = montar();
    for (const opcao of FONTES_DA_LEGENDA) {
      expect(html).toContain(`aria-label="Fonte da legenda: ${opcao.nome}"`);
    }
  });

  it('só a escolhida fica pressionada e leva a classe de seleção', () => {
    const html = montar({ valor: 'Oswald' });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/ESCOLHIDA/g)).toHaveLength(1);
  });

  it('desabilitado desliga todas as opções; sem a prop, nenhuma', () => {
    expect(montar({ desabilitado: true }).match(/disabled=""/g)).toHaveLength(FONTES_DA_LEGENDA.length);
    expect(montar()).not.toContain('disabled=""');
  });

  it('cada amostra carrega a família na variável CSS, e as amostras nascem ocultas até as fontes chegarem', () => {
    const html = montar();
    expect(html).toContain('--fonte:Anton');
    expect(html).toContain('invisible');
  });
});

describe('rótulo do apresentador', () => {
  it('espera o Inter antes de mostrar o nome', () => {
    const html = renderToStaticMarkup(<SpeakerLabelOverlay left={0} top={0} nome="Fulano" />);
    expect(html).toContain('visibility:hidden');
  });
});
