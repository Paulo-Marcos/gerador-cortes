import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { PELE_FLUTUANTE } from '@/components/ui/superficie-flutuante';
import { CabecalhoDeLista, FiltrosDaLista, IdentidadeDaLive, LinhaDeLista } from './ContextColumn';
import { Icon } from './Icon';
import { SELETOR_MAX_PX } from './medidas';
import type { ChromeAtual, ChromeLista } from './UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-1137 (E-069 H-13) · O seletor do item em foco, na linha do topo.
//
// Saiu da `TopBar` (que deixou de existir, DIRECAO §7.0) sem mudar o que faz:
// ‹ › trocam de corte (J/K), o meio abre a lista quando ela não está na coluna.
// Trocar de corte não é "voltar à lista e escolher": é J/K sem tirar os olhos
// do player (D-599). O painel é sólido (`bg-pop`), nunca vidro: abre sobre a
// tela, inclusive sobre o vídeo tocando (§3.6).
// ─────────────────────────────────────────────────────────────────

/** O teto do botão: o título longo do corte não empurra a linha (D-877). */
const TETO = { '--teto': `${SELETOR_MAX_PX}px` } as CSSProperties;

const BOTAO_SETA =
  'inline-grid size-[30px] flex-none place-items-center rounded-pilula text-fg-2 hover:bg-vidro-2 hover:text-fg ' +
  'disabled:text-fg-off disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco';

function RotuloDoSeletor({ atual }: { atual: ChromeAtual }) {
  return (
    <>
      <Icon name="scissors" className="flex-none text-iris" />
      {atual.num ? <span className="font-mono text-micro text-fg-3">#{atual.num}</span> : null}
      <span className="min-w-0 flex-1 truncate text-left text-pequeno font-semibold">{atual.titulo}</span>
      {atual.selo}
    </>
  );
}

/** As linhas do painel e o rodapé (D-1092: os riscados). Exportado para o teste. */
export function ItensDoPainel({ lista, fechar }: { lista: ChromeLista; fechar: () => void }) {
  return (
    <div className="max-h-[300px] overflow-auto px-[7px] pb-[7px]">
      {lista.itens.map((item) => (
        <LinhaDeLista
          key={item.id}
          item={{
            ...item,
            onClick: () => {
              item.onClick?.();
              fechar();
            },
          }}
        />
      ))}
      {lista.rodape}
    </div>
  );
}

function PainelDoSeletor({ atual, lista, fechar }: { atual: ChromeAtual; lista: ChromeLista; fechar: () => void }) {
  return (
    <div className={cn('absolute right-0 top-[38px] z-20 flex w-[360px] flex-col overflow-hidden rounded-bloco', PELE_FLUTUANTE)}>
      {/* Nesta largura de janela este é o ÚNICO lugar onde a identidade do
          conjunto existe — a coluna não está montada. */}
      {lista.cabecalho ? (
        <div className="border-b border-fio p-[11px]">
          <IdentidadeDaLive titulo={lista.cabecalho.titulo} sub={lista.cabecalho.sub} thumb={lista.cabecalho.thumb} />
        </div>
      ) : null}
      <CabecalhoDeLista titulo={lista.titulo} resumo={lista.resumo} padding="9px 11px" />
      {lista.filtros?.length ? <FiltrosDaLista filtros={lista.filtros} /> : null}
      {/* A linha do painel é a MESMA da coluna de contexto: um componente, dois
          lugares que nunca aparecem juntos. */}
      <ItensDoPainel lista={lista} fechar={fechar} />
      {atual.onVerTodos ? (
        <div className="flex justify-end border-t border-fio px-[11px] py-[9px]">
          <button
            type="button"
            className="inline-flex h-[26px] items-center gap-1.5 rounded-pilula border border-fio-2 bg-vidro-2 px-3 text-pequeno font-semibold text-fg hover:bg-vidro-3"
            onClick={() => {
              atual.onVerTodos?.();
              fechar();
            }}
          >
            <Icon name="layout-grid" />
            Ver todos
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Fecha ao clicar fora ou no Esc — e o Esc é dele enquanto está aberto. */
function useFecharFora(aberto: boolean, fechar: () => void) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const foraOuEsc = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        // Sem parar aqui o Esc segue para os ouvintes do documento e fecha também
        // o que estiver atrás.
        if (e.key === 'Escape') {
          e.stopPropagation();
          fechar();
        }
        return;
      }
      if (caixa.current && !caixa.current.contains(e.target as Node)) fechar();
    };
    document.addEventListener('mousedown', foraOuEsc);
    document.addEventListener('keydown', foraOuEsc, true);
    return () => {
      document.removeEventListener('mousedown', foraOuEsc);
      document.removeEventListener('keydown', foraOuEsc, true);
    };
  }, [aberto, fechar]);
  return caixa;
}

export function SeletorDoCorte({ atual, compacto, lista }: { atual: ChromeAtual; compacto: boolean; lista?: ChromeLista }) {
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);
  const caixa = useFecharFora(aberto, fechar);
  // Compacto nunca abre painel: a lista já está na coluna, à esquerda.
  useEffect(() => {
    if (compacto) setAberto(false);
  }, [compacto]);
  const rotulo = <RotuloDoSeletor atual={atual} />;
  const meio = 'flex h-[30px] max-w-[var(--teto)] items-center gap-1.5 rounded-pilula border px-2.5';

  return (
    <div ref={caixa} className="relative flex flex-none items-center gap-[3px]">
      <button type="button" className={BOTAO_SETA} title="Item anterior · J" aria-label="Item anterior" aria-keyshortcuts="J" onClick={atual.onAnterior} disabled={!atual.onAnterior}>
        <Icon name="chevron-left" />
      </button>
      {compacto ? (
        <span title={atual.num ? `#${atual.num} · ${atual.titulo}` : atual.titulo} style={TETO} className={cn(meio, 'border-fio bg-poco')}>
          {rotulo}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-haspopup="true"
          style={TETO}
          className={cn(meio, 'min-w-[190px] bg-vidro-2 text-fg hover:bg-vidro-3', aberto ? 'border-iris-fio' : 'border-fio-2')}
        >
          {rotulo}
          <Icon name="chevron-down" className="flex-none text-fg-3" />
        </button>
      )}
      <button type="button" className={BOTAO_SETA} title="Próximo item · K" aria-label="Próximo item" aria-keyshortcuts="K" onClick={atual.onProximo} disabled={!atual.onProximo}>
        <Icon name="chevron-right" />
      </button>
      {aberto && !compacto && lista ? <PainelDoSeletor atual={atual} lista={lista} fechar={fechar} /> : null}
    </div>
  );
}
