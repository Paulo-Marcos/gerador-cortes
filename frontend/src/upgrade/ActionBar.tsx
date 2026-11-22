import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';
import { Icon, ICONE_DO_CONCEITO } from './Icon';
import type { ChromeBarra } from './UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 · A barra de ações fixa.
//
// Ela fica fora da área que rola, então a ação que fecha a tela —
// aprovar, renderizar, publicar — está sempre visível, não importa onde
// a pessoa esteja na página. A ordem também é fixa: lembretes de tecla à
// esquerda, depois o fiel, depois secundário → terciário → primário.
// Quem aprende a ordem uma vez a encontra em todas as telas.
//
// RODADA 2 · os três botões passam a carregar `data-decisao`. É o que a
// trava do Enter lê (`teclasDaCasca`): antes ela olhava para qualquer
// controle focado, e como o navegador deixa o foco no botão clicado,
// bastava clicar um corte na lista para o Enter morrer — com o ↵ ainda
// impresso aqui. Agora o Enter só é engolido quando o foco está num
// controle que TAMBÉM decide, que é o caso em que ele duplicaria a ação.
// ─────────────────────────────────────────────────────────────────

/**
 * D-746: o veredito editorial, à esquerda e com peso menor que o primário.
 * Antes, na Pós, "Aprovar corte" disparava o render final — um veredito
 * acionando ~20 min de GPU. Aqui ele só alterna aprovado ⇄ proposto.
 */
function Veredito({ aprovado, ocupado, onAlternar }: NonNullable<ChromeBarra['veredito']>) {
  return aprovado ? (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex h-7 items-center gap-[5px] whitespace-nowrap rounded-campo border border-ok bg-ok/13 px-[9px] text-pequeno font-bold text-ok">
        <Icon name="check" />
        Aprovado
      </span>
      <Button
        type="button"
        variant="fantasma"
        size="pq"
        data-decisao
        disabled={ocupado}
        onClick={onAlternar}
        title="Devolver o corte para proposto — não apaga nada"
      >
        <Icon name="undo-2" />
        Devolver
      </Button>
    </span>
  ) : (
    <Button
      type="button"
      variant="secundario"
      size="pq"
      data-decisao
      disabled={ocupado}
      onClick={onAlternar}
      title="Aprovar o corte — não renderiza nada"
      className="border-ok text-ok hover:border-ok"
    >
      <Icon name="check" />
      Aprovar corte
    </Button>
  );
}

/**
 * Por que o principal está desligado, escrito ao lado (D-746). D-870: no
 * máximo duas linhas, com o texto inteiro no hover — a lista de pendências
 * de uma live grande fazia a barra crescer a 90 px. D-1086: as duas linhas
 * cabem na altura do botão; ele encolhe antes de a barra quebrar em duas fileiras.
 */
function MotivoDoPrimario({ motivo }: { motivo: string }) {
  return (
    <span
      id="motivo-do-primario"
      title={motivo}
      // D-1086: a quebra de linha conta só o mínimo legível (96 px), não o texto
      // inteiro; com folga, o motivo cresce até o próprio tamanho (max-content). O
      // crescimento alto vence o espaçador (flex 1), que só fica com o resto.
      className="inline-flex min-w-[96px] max-w-max flex-[1000_1_0] items-center gap-[5px] text-micro text-aviso"
    >
      <Icon name="ban" className="flex-none" />
      {/* O teto de 320 px e as duas linhas ficam no texto. */}
      <span className="max-w-[320px] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
        {motivo}
      </span>
    </span>
  );
}

/** O estado do corte, antes dos botões: o veredito e o que ficou em aberto (D-1044). */
function EstadoDoCorte({ barra }: { barra: ChromeBarra }) {
  return (
    <>
      {barra.veredito ? <Veredito {...barra.veredito} /> : null}
      {barra.pendencias}
    </>
  );
}

/** D-1088: a dica, a tecla e o apagado do botão secundário (Riscar corte).
 *  `aria-disabled`, e não `disabled`: o botão desabilitado engole o passar do
 *  mouse, e a dica é o que explica por que não dá. */
function atributosDoSecundario(botao: NonNullable<ChromeBarra['secundario']>) {
  return {
    className: cn('text-fg-2', botao.desabilitado && 'cursor-not-allowed opacity-50'),
    title: botao.titulo,
    'aria-disabled': botao.desabilitado || undefined,
    'aria-keyshortcuts': botao.tecla,
    onClick: botao.desabilitado ? undefined : botao.onClick,
  };
}

export function ActionBar({ barra }: { barra: ChromeBarra }) {
  return (
    // D-1137 (E-069 H-13; DIRECAO §7.0): a barra é uma pílula de vidro no rodapé,
    // a 12 px da janela. Sobre o vídeo (Editor e Pós) o vidro vira sólido pela sala
    // (`data-vidro`, `luzDaSala`), não por aqui.
    <div
      // D-1086: rede de segurança; antes de quebrar, os textos (base 0) cedem.
      className="cc-vidro-casca flex min-h-[62px] flex-none flex-wrap items-center gap-2 rounded-pilula py-2.5 pl-5 pr-3"
      role="toolbar"
      aria-label="Ações da tela"
    >
      {barra.extra}
      {barra.teclas?.map((t) => (
        <span
          key={t.texto}
          className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap text-micro text-fg-2"
        >
          {t.teclas.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
          {t.texto}
        </span>
      ))}

      <EstadoDoCorte barra={barra} />
      <div className="min-w-2 flex-1" />

      {barra.alternancias?.map((a) => (
        <span key={a.texto} className="inline-flex gap-0.5">
          <Button
            type="button"
            variant="secundario"
            size="pq"
            data-decisao
            aria-pressed={a.ativo}
            title={a.titulo}
            disabled={a.ocupado}
            onClick={a.onClick}
            // A cor da alternância vem de quem monta a barra (Leitura é info, Autor é íris):
            // entra por variável CSS, e `!` vence o par `aria-pressed` do botão.
            style={{ '--alt-cor': a.cor, '--alt-suave': a.corSuave } as CSSProperties}
            className={
              a.ativo
                ? '!border-[var(--alt-cor)] !bg-[var(--alt-suave)] !text-[var(--alt-cor)]'
                : 'text-fg-2'
            }
          >
            <Icon name={a.icone} />
            {a.texto}
          </Button>
          {a.ativo && a.editar ? (
            <Button
              type="button"
              variant="fantasma" size="pq" soIcone
              data-decisao
              title={a.editar.titulo}
              aria-label={a.editar.titulo}
              onClick={a.editar.onClick}
            >
              <Icon name={ICONE_DO_CONCEITO.editar} />
            </Button>
          ) : null}
        </span>
      ))}
      {barra.alternancias?.length ? <span className="h-5 w-px bg-fio-2" aria-hidden /> : null}

      {barra.secundario ? (
        <Button
          type="button"
          variant="secundario"
          size="pq"
          data-decisao
          {...atributosDoSecundario(barra.secundario)}
        >
          <Icon name={barra.secundario.icone} />
          {barra.secundario.texto}
          {barra.secundario.tecla ? <kbd>{barra.secundario.tecla}</kbd> : null}
        </Button>
      ) : null}

      {barra.terciario ? (
        <Button
          type="button"
          variant="secundario" size="pq" soIcone
          data-decisao
          title={barra.terciario.titulo}
          aria-label={barra.terciario.titulo}
          onClick={barra.terciario.onClick}
        >
          <Icon name={barra.terciario.icone} />
        </Button>
      ) : null}

      {barra.primario.desabilitado && barra.primario.motivo ? (
        <MotivoDoPrimario motivo={barra.primario.motivo} />
      ) : null}
      <Button
        type="button"
        variant="primario"
        data-decisao
        aria-keyshortcuts={
          barra.primario.desabilitado || barra.primario.semEnter ? undefined : 'Enter'
        }
        aria-describedby={
          barra.primario.desabilitado && barra.primario.motivo ? 'motivo-do-primario' : undefined
        }
        onClick={barra.primario.onClick}
        disabled={barra.primario.desabilitado}
      >
        <Icon name={barra.primario.icone} />
        {barra.primario.texto}
        {barra.primario.desabilitado || barra.primario.semEnter ? null : (
          <kbd className="border-transparent bg-[color-mix(in_srgb,currentColor_18%,transparent)] text-[inherit]">↵</kbd>
        )}
      </Button>
    </div>
  );
}
