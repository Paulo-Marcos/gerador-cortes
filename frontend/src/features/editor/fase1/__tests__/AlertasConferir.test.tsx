import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AlertaConferir } from '@/types/models';
import { AlertasConferirFaixa } from '../AlertasConferir';

// D-998: a faixa "Conferir" da timeline mostra os alertas pendentes, leva o
// player até o trecho e dispensa o alerta. O conferido some da faixa.

const alerta = (id: string, inicio: number, motivo: string, conferido = false): AlertaConferir => ({
  id,
  inicio_hms: '',
  fim_hms: '',
  inicio_seg: inicio,
  fim_seg: inicio + 10,
  motivo,
  origem: 'claude',
  conferido,
});

type Elemento = ReactElement<Record<string, unknown>>;

function elementos(no: ReactNode): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!isValidElement(no)) return [];
  const e = no as Elemento;
  return [e, ...elementos(e.props.children as ReactNode)];
}

const porRotulo = (arvore: Elemento[], rotulo: string) =>
  arvore.find((e) => e.props['aria-label'] === rotulo)!;

describe('AlertasConferirFaixa (D-998)', () => {
  it('sem alerta pendente a faixa não aparece', () => {
    const html = renderToStaticMarkup(
      <AlertasConferirFaixa
        alertas={[alerta('a', 60, 'já visto', true)]}
        onSeek={vi.fn()}
        onConferir={vi.fn()}
      />,
    );
    expect(html).toBe('');
  });

  it('lista só os pendentes, com o tempo e o motivo', () => {
    const html = renderToStaticMarkup(
      <AlertasConferirFaixa
        alertas={[alerta('a', 60, 'cita 40% sem fonte'), alerta('b', 90, 'já visto', true)]}
        onSeek={vi.fn()}
        onConferir={vi.fn()}
      />,
    );
    expect(html).toContain('Conferir (1)');
    expect(html).toContain('00:01:00');
    expect(html).toContain('cita 40% sem fonte');
    expect(html).not.toContain('já visto');
  });

  it('o trecho leva o player ao início do alerta e "Conferido" dispensa pelo id', () => {
    const onSeek = vi.fn();
    const onConferir = vi.fn();
    const arvore = elementos(
      AlertasConferirFaixa({
        alertas: [alerta('60000-70000', 60, 'cita 40% sem fonte')],
        onSeek,
        onConferir,
      }),
    );

    (porRotulo(arvore, 'Marcar como conferido: cita 40% sem fonte').props.onClick as () => void)();
    const irAoTrecho = arvore.find((e) => e.props.title === 'Ir para o trecho: cita 40% sem fonte')!;
    (irAoTrecho.props.onClick as () => void)();

    expect(onConferir).toHaveBeenCalledWith('60000-70000');
    expect(onSeek).toHaveBeenCalledWith(60);
  });

  it('o botão do alerta a caminho do backend fica desabilitado', () => {
    const arvore = elementos(
      AlertasConferirFaixa({
        alertas: [alerta('a', 60, 'x'), alerta('b', 90, 'y')],
        onSeek: vi.fn(),
        onConferir: vi.fn(),
        conferindoId: 'a',
      }),
    );
    expect(porRotulo(arvore, 'Marcar como conferido: x').props.disabled).toBe(true);
    expect(porRotulo(arvore, 'Marcar como conferido: y').props.disabled).toBe(false);
  });
});
