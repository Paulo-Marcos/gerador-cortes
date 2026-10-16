import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinhaDaAgenda } from '@/features/shorts/loteApi';
import { agendaKey } from '@/features/shorts/useAgendaDoLote';
import { notasDeAgendamento, problemaDoHorario } from '@/features/shorts/agendamentoDoLote';
import type { StatusExportCorte } from '@/types/models';
import { LoteDoTiktokHorizontal } from '../LoteDoTiktokHorizontal';
import { PublicarMassaModal } from '../PublicarMassaModal';
import { pedidoDoLoteYoutube } from '../pedidoDoLoteYoutube';

// D-934: a D-908 ligou a janela do público só no lote de shorts. Os horizontais
// (o lote do YouTube longo, o TikTok horizontal e o envio de um corte só)
// continuavam com 15 minutos fixos ou uma data única. Aqui se guarda o combinado:
// a agenda vem do backend (o mesmo motor dos shorts), antes do clique, por linha.

const cortes = Array.from({ length: 10 }, (_, i) => ({
  corte_id: `c${i + 1}`,
  numero: i + 1,
  titulo: `Corte ${i + 1}`,
})) as StatusExportCorte[];
const alvos = cortes.map((c) => `corte:${c.corte_id}`);

// O que o backend devolve para dez cortes com os blocos padrão do YouTube:
// 12:00 e 18:00, quatro por bloco de 15 em 15, e o resto no dia seguinte.
const HORAS = ['12:00', '12:15', '12:30', '12:45', '18:00', '18:15', '18:30', '18:45'];
const DATAS = [...HORAS.map((h) => `2030-01-07T${h}`), '2030-01-08T12:00', '2030-01-08T12:15'];
const linhas = (plataforma: string): LinhaDaAgenda[] =>
  cortes.map((c, i) => ({
    alvo_tipo: 'corte',
    alvo_id: c.corte_id,
    plataforma,
    agendar_para: DATAS[i],
    intensidade: 'medio',
    motivo: '',
  }));

function comAgenda(plataforma: string, alvosDaAgenda: string[]) {
  const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  cliente.setQueryData(agendaKey(alvosDaAgenda, [plataforma]), { itens: linhas(plataforma) });
  return cliente;
}

describe('lote do YouTube longo (PublicarMassaModal)', () => {
  it('mostra a agenda da janela do canal, e não 15 minutos fixos', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={comAgenda('youtube', alvos)}>
        <PublicarMassaModal open onClose={() => {}} projetoId="p1" cortesProntos={cortes} />
      </QueryClientProvider>,
    );

    expect(html).not.toContain('15 minutos');
    expect(html).toContain('Distribuir pela janela do canal');
    // Sem "agora": dez vídeos públicos de uma vez é o que a janela evita.
    expect(html).not.toContain('cada destino publica assim que ficar pronto');
    // Quatro no bloco das 12h, quatro no das 18h, e dois transbordam para terça.
    for (const hora of HORAS) expect(html).toContain(`seg 07/01 · ${hora}`);
    expect(html).toContain('ter 08/01 · 12:00');
    expect(html).toContain('ter 08/01 · 12:15');
  });

  it('envia ao upload as datas da agenda, em UTC, e deixa de fora quem ficou sem data', () => {
    const agenda = linhas('youtube').slice(0, 3);
    agenda[2] = { ...agenda[2], agendar_para: '', motivo: 'não cabe' };

    const pedido = pedidoDoLoteYoutube('distribuir', ['c1', 'c2', 'c3'], agenda, '');

    expect(pedido.corte_ids).toEqual(['c1', 'c2']);
    expect(pedido.scheduled_dates).toEqual([
      new Date('2030-01-07T12:00').toISOString(),
      new Date('2030-01-07T12:15').toISOString(),
    ]);
    expect(pedido.agendar).toBe(true);
  });

  it('uma data só e agora continuam como alternativa', () => {
    const umaData = pedidoDoLoteYoutube('uma_data', ['c1', 'c2'], [], '2030-01-07T19:00');
    const agora = pedidoDoLoteYoutube('agora', ['c1', 'c2'], [], '');

    expect(umaData.scheduled_dates).toEqual(Array(2).fill(new Date('2030-01-07T19:00').toISOString()));
    expect(agora).toEqual({ corte_ids: ['c1', 'c2'], agendar: false, scheduled_dates: [null, null] });
  });
});

describe('TikTok horizontal', () => {
  it('o lote distribui pela janela, no destino do TikTok', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={comAgenda('tiktok_horizontal', alvos)}>
        <LoteDoTiktokHorizontal
          projetoId="p1"
          pendentes={cortes}
          envio={{ agendarPara: '', publicarSozinho: false }}
          onPreparado={() => {}}
        />
      </QueryClientProvider>,
    );

    expect(html).toContain('Distribuir pela janela do canal');
    expect(html).toContain('seg 07/01 · 12:00');
    expect(html).toContain('→ TikTok');
  });

  it('a data do horizontal segue a grade de 5 minutos e o horizonte do TikTok', () => {
    const agora = new Date('2026-09-12T10:00');

    expect(problemaDoHorario('2026-09-12T11:03', ['tiktok_horizontal'], agora)).toContain('5 em 5');
    expect(problemaDoHorario('2026-09-23T10:00', ['tiktok_horizontal'], agora)).toContain('10 dias');
    expect(notasDeAgendamento(['tiktok_horizontal'], { tiktokAssistido: true, instagramAssistido: false }))
      .toHaveLength(1);
  });
});

describe('um corte sozinho', () => {
  let pedidos: Request[] = [];

  beforeEach(() => {
    pedidos = [];
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://api.test/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pedido: Request) => {
        pedidos.push(pedido);
        return new Response(JSON.stringify({ itens: linhas('youtube').slice(0, 1) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('a sugestão é o próximo horário livre da janela do destino', async () => {
    const { proximoHorarioLivre } = await import('../useHorarioSugerido');

    expect(await proximoHorarioLivre('youtube')).toBe('2030-01-07T12:00');
    expect(pedidos[0].url).toBe('http://api.test/api/shorts/lote/agenda');
    expect(await pedidos[0].json()).toEqual({ alvos: ['corte:avulso'], plataformas: ['youtube'] });
  });

  // Um campo que o hook controla, sem React: o estado é a variável.
  function campo(inicial = '') {
    const estado = { valor: inicial };
    const aplicar = (mudar: (atual: string) => string) => {
      estado.valor = mudar(estado.valor);
    };
    return { estado, aplicar };
  }
  const vaga = (quando: string) => {
    let soltar: () => void = () => {};
    const promessa = new Promise<string>((resolver) => {
      soltar = () => resolver(quando);
    });
    return { buscar: () => promessa, soltar: () => { soltar(); return promessa; } };
  };

  it('a sugestão do YouTube preenche o campo vazio e respeita o que foi digitado', async () => {
    const { sugerirHorario } = await import('../useHorarioSugerido');
    const vazio = campo();
    const digitado = campo('2030-02-01T09:00');
    const resposta = vaga('2030-01-07T12:00');

    sugerirHorario(vazio.aplicar, resposta.buscar);
    sugerirHorario(digitado.aplicar, resposta.buscar);
    await resposta.soltar();

    expect(vazio.estado.valor).toBe('2030-01-07T12:00');
    expect(digitado.estado.valor).toBe('2030-02-01T09:00');
  });

  it('a resposta de um corte que já foi trocado não cai no campo', async () => {
    const { sugerirHorario } = await import('../useHorarioSugerido');
    const { estado, aplicar } = campo();
    const resposta = vaga('2030-01-07T12:00');

    const cancelar = sugerirHorario(aplicar, resposta.buscar);
    cancelar();
    await resposta.soltar();

    expect(estado.valor).toBe('');
  });

  it('no TikTok, a vaga troca a data provisória, mas não a que o operador mudou', async () => {
    const { marcarComVaga } = await import('../useHorarioSugerido');
    const intocado = campo();
    const mexido = campo();
    const resposta = vaga('2030-01-07T16:00');

    marcarComVaga('tiktok_horizontal', intocado.aplicar, resposta.buscar, '2030-01-07T11:00');
    marcarComVaga('tiktok_horizontal', mexido.aplicar, resposta.buscar, '2030-01-07T11:00');
    expect(intocado.estado.valor).toBe('2030-01-07T11:00');
    mexido.aplicar(() => '2030-01-09T20:00');
    await resposta.soltar();

    expect(intocado.estado.valor).toBe('2030-01-07T16:00');
    expect(mexido.estado.valor).toBe('2030-01-09T20:00');
  });

  it('o envio ao YouTube e o Assistido do TikTok abrem com a sugestão', () => {
    const fonte = (caminho: string) => readFileSync(resolve(__dirname, '..', caminho), 'utf8');

    expect(fonte('useWorkspaceProjeto.tsx')).toMatch(/= useHorarioSugerido\(publicarDe\);/);
    expect(fonte('PublicarTiktokModal.tsx')).toMatch(/useDataDoAvulso\('tiktok_horizontal'\)/);
  });
});
