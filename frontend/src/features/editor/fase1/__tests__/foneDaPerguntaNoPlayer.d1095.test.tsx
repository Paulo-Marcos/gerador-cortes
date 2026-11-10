import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EstadoLipSync } from '@/hooks/useLipSyncPreview';
import { assentar, montar } from '../../__tests__/domMinimo';

// D-1095 (auditoria r1, B1): o fio do fone de ponta a ponta. A pergunta 3 liga
// o fone; o useSomDoCorte (no EditorFase1) leva isso ao PlayerPanel; o player
// liga o preview (useLipSyncPreview) e devolve em que pé ele está, que volta à
// pergunta. Só o preview fica falso: ele precisa de <video> e Web Audio.

const h = vi.hoisted(() => ({
  chamadas: [] as { enabled: boolean; offsetMs: number; proxyStartSec: number }[],
  /** O que o preview diz quando ligado. */
  estadoLigado: 'carregando' as EstadoLipSync,
}));
vi.mock('@/hooks/useLipSyncPreview', () => ({
  useLipSyncPreview: (_video: unknown, _audio: unknown, opcoes: { enabled: boolean; offsetMs: number; proxyStartSec: number }) => {
    h.chamadas.push(opcoes);
    return opcoes.enabled ? h.estadoLigado : 'desligado';
  },
}));

const { useSomDoCorte } = await import('../useSomDoCorte');
const { PlayerPanel } = await import('../PlayerPanel');
const { PerguntaDoSom } = await import('../PerguntaDoSom');
type SomDoCorte = import('../useSomDoCorte').SomDoCorte;

type Elemento = ReactElement<Record<string, unknown>>;
function elementos(no: ReactNode): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!isValidElement(no)) return [];
  const el = no as Elemento;
  return [el, ...elementos(abrir(el))];
}
/** Abre os componentes sem hook da pergunta, para achar o fone; dos outros, só os filhos. */
function abrir(el: Elemento): ReactNode {
  const tipo = el.type as (p: unknown) => ReactNode;
  const semHook = typeof tipo === 'function' && ['AudioSyncControl', 'PerguntaDaDecisao'].includes(tipo.name);
  return semHook ? tipo(el.props) : (el.props.children as ReactNode);
}

/** O PlayerPanel por dentro: os hooks dele rodam na sonda, sem desenhar <video>. */
const renderDoPlayer = (PlayerPanel as unknown as { render: (props: object, ref: null) => ReactNode }).render;

const atual: { som?: SomDoCorte; fone?: Elemento } = {};

/** O mesmo arranjo do EditorFase1: um som, a pergunta de um lado, o player do outro. */
function Bancada({ audioPreviewSrc }: { audioPreviewSrc?: string }) {
  const { som, noPlayer } = useSomDoCorte({
    corteId: 'c1',
    audioPreviewSrc,
    audioPreviewStartSec: 12,
    audioOffsetMs: 40,
    onAudioOffsetChange: () => undefined,
  });
  const pergunta = elementos(PerguntaDoSom({ som }));
  renderDoPlayer({ src: '', inicioSeg: 0, fimSeg: 60, ...noPlayer }, null);
  atual.som = som;
  atual.fone = pergunta.find((e) => e.type === 'button' && e.props['aria-label'] === 'Preview de sincronia de áudio');
  return null;
}

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
  h.chamadas = [];
  h.estadoLigado = 'carregando';
});

const montarBancada = async (audioPreviewSrc?: string) => {
  ({ limpar } = montar(<Bancada audioPreviewSrc={audioPreviewSrc} />));
  await assentar();
};
const clicar = async (botao?: Elemento) => {
  (botao!.props.onClick as () => void)();
  await assentar();
};
const ultimaChamada = () => h.chamadas[h.chamadas.length - 1];

describe('o fone da pergunta liga o preview do player (D-1095)', () => {
  it('desligado no começo: o player não toca o áudio deslocado', async () => {
    await montarBancada('/a.flac');
    expect(ultimaChamada()).toMatchObject({ enabled: false, offsetMs: 40, proxyStartSec: 12 });
    expect(atual.som?.estadoDoPreview).toBe('desligado');
  });

  it('o clique no fone liga o preview do player, com o offset e o início do proxy', async () => {
    await montarBancada('/a.flac');
    await clicar(atual.fone);
    expect(ultimaChamada()).toMatchObject({ enabled: true, offsetMs: 40, proxyStartSec: 12 });
    expect(atual.som?.ouvindo).toBe(true);
  });

  it('o estado do preview volta do player para a pergunta (preparando, depois pronto)', async () => {
    await montarBancada('/a.flac');
    await clicar(atual.fone);
    expect(atual.som?.estadoDoPreview).toBe('carregando');
    expect(atual.fone?.props['aria-pressed']).toBe(true);

    h.estadoLigado = 'pronto';
    await clicar(atual.fone); // desliga
    await clicar(atual.fone); // liga de novo, agora pronto
    expect(atual.som?.estadoDoPreview).toBe('pronto');
  });

  it('"Está certo" desliga o preview do player, e o estado volta a desligado', async () => {
    await montarBancada('/a.flac');
    await clicar(atual.fone);
    expect(ultimaChamada().enabled).toBe(true);
    atual.som?.marcarCerto();
    await assentar();
    expect(ultimaChamada().enabled).toBe(false);
    expect(atual.som?.estadoDoPreview).toBe('desligado');
  });

  it('sem proxy de áudio, o fone não liga o preview', async () => {
    await montarBancada(undefined);
    expect(atual.fone?.props.disabled).toBe(true);
    atual.som?.alternarOuvir();
    await assentar();
    expect(ultimaChamada().enabled).toBe(false);
  });
});
