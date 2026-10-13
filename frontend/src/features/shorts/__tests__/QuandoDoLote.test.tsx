import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuandoDoLote } from '../QuandoDoLote';
import type { LinhaDaAgenda } from '../loteApi';
import type { ModoDeQuando } from '../agendaDoLote';

/**
 * D-908. A seção "Quando" é o que o operador lê ANTES de publicar: a agenda
 * tem de estar à vista, linha a linha, com quem ficou sem data e por quê. O
 * teste prova o HTML, que é o que ele vê.
 */
const LINHAS: LinhaDaAgenda[] = [
  {
    alvo_tipo: 'short',
    alvo_id: 's1',
    plataforma: 'youtube_shorts',
    agendar_para: '2030-01-07T16:00',
    intensidade: 'forte',
    motivo: '',
  },
  {
    alvo_tipo: 'short',
    alvo_id: 's2',
    plataforma: 'tiktok',
    agendar_para: '',
    intensidade: '',
    motivo: 'não cabe nos 10 dias que a plataforma deixa agendar',
  },
  {
    alvo_tipo: 'short',
    alvo_id: 's1',
    plataforma: 'instagram_reels',
    agendar_para: '',
    intensidade: '',
    motivo: 'publica no ato: o Instagram não agenda pelo compositor da web',
  },
];

function desenhar(modo: ModoDeQuando, extra: Partial<Parameters<typeof QuandoDoLote>[0]> = {}) {
  return renderToStaticMarkup(
    <QuandoDoLote
      modo={modo}
      onModo={() => {}}
      agendarPara="2030-01-07T12:00"
      onAgendarPara={() => {}}
      problemaDoAgendamento={null}
      notas={[{ plataforma: 'TikTok', como: 'sozinho', texto: 'o robô marca no Studio' }]}
      linhas={LINHAS}
      carregandoAgenda={false}
      erroDaAgenda={null}
      problemasDasLinhas={new Map()}
      onAjustarLinha={() => {}}
      onRecalcular={() => {}}
      rotuloDoAlvo={(id) => (id === 's1' ? 'O erro da igreja' : 'Pix e o Estado')}
      {...extra}
    />,
  );
}

describe('os três modos', () => {
  it('oferece agora, uma data e distribuir, e marca o escolhido', () => {
    const html = desenhar('distribuir');

    expect(html).toContain('aria-label="Agora"');
    expect(html).toContain('aria-label="Uma data para tudo"');
    expect(html).toContain('aria-pressed="true" aria-label="Distribuir pela janela do canal"');
  });

  it('em "agora" não há caixa de data nem agenda', () => {
    const html = desenhar('agora');

    expect(html).not.toContain('datetime-local');
    expect(html).not.toContain('Agenda do lote');
  });

  it('em "uma data" a caixa única continua a de sempre, com as notas', () => {
    const html = desenhar('uma_data');

    expect(html).toContain('value="2030-01-07T12:00"');
    expect(html).toContain('o robô marca no Studio');
    expect(html).not.toContain('Agenda do lote');
  });
});

describe('a agenda distribuída', () => {
  it('mostra cada item com rede, data e a força do público', () => {
    const html = desenhar('distribuir');

    expect(html).toContain('O erro da igreja');
    expect(html).toContain('→ YouTube Shorts');
    expect(html).toContain('seg 07/01 · 16:00');
    expect(html).toContain('público forte');
    expect(html).toContain('aria-label="Data de O erro da igreja no YouTube Shorts"');
  });

  it('diz quem ficou sem data e por quê, e quem publica no ato', () => {
    const html = desenhar('distribuir');

    expect(html).toContain('sem data: não cabe nos 10 dias');
    expect(html).toContain('no ato');
    // O Instagram não ganha caixa de data: não há o que ajustar.
    expect(html).not.toContain('Data de O erro da igreja no Instagram Reels');
  });

  it('resume quantos vão com data, sem data e no ato', () => {
    const html = desenhar('distribuir');

    expect(html).toContain('1 com data');
    expect(html).toContain('1 sem data');
    expect(html).toContain('1 no ato');
  });

  it('aponta o problema da linha ao lado dela', () => {
    const html = desenhar('distribuir', {
      problemasDasLinhas: new Map([['short:s1|youtube_shorts', 'esse horário já passou']]),
    });

    expect(html).toContain('esse horário já passou');
  });

  it('enquanto calcula, diz que está calculando', () => {
    const html = desenhar('distribuir', { linhas: [], carregandoAgenda: true });

    expect(html).toContain('calculando a agenda');
  });
});
