import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoletimTecnicoCard, type OpcaoDoBoletim } from '../BoletimTecnicoCard';
import {
  type BoletimTecnico,
  linhaDeEmendas,
  linhaDeParada,
  linhaDeVolume,
  relogio,
  totalDeAvisos,
} from '../boletimTecnico';

// D-1015: o boletim técnico na Revisão Final — texto em português simples,
// estados (medindo, arquivo ausente, falhou) e a mensagem de que só avisa.

const horizontal: OpcaoDoBoletim = { alvo: { tipo: 'corte', id: 'c1' }, rotulo: 'Horizontal' };
const short1: OpcaoDoBoletim = { alvo: { tipo: 'short', id: 's1' }, rotulo: 'Short 1' };

const pronto: BoletimTecnico = {
  estado: 'pronto',
  medido_em: '2026-11-02T10:00:00+00:00',
  erro: null,
  volume: {
    integrado_lufs: -15.4,
    pico_dbtp: -0.4,
    lra_lu: 5.2,
    avisos: ['Volume mais baixo que a referência de -14 LUFS (-15.4 LUFS).'],
  },
  paradas: [
    { inicio_seg: 63, duracao_seg: 0.5, origem: 'live' },
    { inicio_seg: 90, duracao_seg: 0.4, origem: 'render' },
  ],
  emendas: {
    total: 12,
    com_som_dos_dois_lados: 9,
    acima_do_p99: 2,
    p99_da_fala: 0.04,
    itens: [],
  },
};

function renderizar(boletim: BoletimTecnico | undefined, extra: object = {}) {
  return renderToStaticMarkup(
    <BoletimTecnicoCard
      boletim={boletim}
      opcoes={[horizontal]}
      escolhido={horizontal}
      onEscolher={() => {}}
      onRemedir={() => {}}
      {...extra}
    />,
  );
}

describe('texto do boletim', () => {
  it('formata volume, paradas e emendas em português', () => {
    expect(linhaDeVolume(pronto.volume!)).toBe('−15,4 LUFS · pico −0,4 dBTP · variação 5,2 LU');
    expect(relogio(63)).toBe('1:03');
    expect(linhaDeParada(pronto.paradas![0])).toBe('1:03 · 0,50 s · já estava parada no bruto, então veio da live');
    expect(linhaDeParada(pronto.paradas![1])).toContain('surgiu no render');
    expect(linhaDeEmendas(pronto.emendas!)).toBe(
      '12 emendas · 9 com som dos dois lados · 2 com degrau acima do normal da fala',
    );
  });

  it('conta como aviso o volume fora da referência, cada parada e cada degrau acima do p99', () => {
    expect(totalDeAvisos(pronto)).toBe(1 + 2 + 2);
  });
});

describe('BoletimTecnicoCard', () => {
  it('mostra as três medidas, a referência como convenção e que não bloqueia', () => {
    const html = renderizar(pronto);
    expect(html).toContain('Volume');
    expect(html).toContain('Imagem parada');
    expect(html).toContain('Emendas');
    expect(html).toContain('5 avisos');
    expect(html).toContain('convenção');
    expect(html).toContain('não uma exigência');
    expect(html).toContain('O boletim só avisa');
    expect(html).toContain('Medir de novo');
  });

  it('mostra "medindo" enquanto não há resultado', () => {
    expect(renderizar({ estado: 'medindo' } as BoletimTecnico)).toContain('Medindo o vídeo');
    expect(renderizar(undefined)).toContain('Medindo o vídeo');
  });

  it('diz que o vídeo sumiu do disco em vez de mostrar erro', () => {
    const html = renderizar({ estado: 'arquivo_ausente' } as BoletimTecnico);
    expect(html).toContain('não está mais no disco');
    expect(html).not.toContain('Medir de novo');
  });

  it('mostra o motivo da falha e oferece medir de novo', () => {
    const html = renderizar({ estado: 'falhou', erro: 'A medição passou de 600s.' } as BoletimTecnico);
    expect(html).toContain('A medição passou de 600s.');
    expect(html).toContain('Medir de novo');
  });

  it('com short renderizado oferece a aba do short ao lado do horizontal', () => {
    const html = renderToStaticMarkup(
      <BoletimTecnicoCard
        boletim={pronto}
        opcoes={[horizontal, short1]}
        escolhido={short1}
        onEscolher={() => {}}
        onRemedir={() => {}}
      />,
    );
    expect(html).toContain('Horizontal');
    expect(html).toContain('Short 1');
    expect(html).toMatch(/aria-selected="true"[^>]*>Short 1/);
  });
});
