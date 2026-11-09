import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { SeloDeProvider } from '@/components/ui/selo-provider';
import { useUltimaGeracao } from '@/features/ia';
import { ConfirmDialog, useConfirmacao } from '@/components/ui/confirm-dialog';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import { useAtualizarCorte } from '@/features/editor/useCortes';
import { useGravarCenas } from './useGravarCenas';
import { useCenasEmGeracao, useGerarCenasClaude } from '@/features/editor/useGeracoesDaIa';
import { usePreencherRetratosCenas, useValidarCenasRemotion } from '@/features/editor/useCenas';
import type { CenaRemotion } from '@/types/models';
import { confirmacaoRegerarCenas } from '../regeracaoConfirmacao';
import { montarBotaoDoValidar } from './botaoDoValidar';
import { CenaComOrigem } from './CenaComOrigem';
import { LegendaDoPlano } from './LegendaDoPlano';
import { NumerosDoPlano } from './NumerosDoPlano';
import { CenasManualModal } from './CenasManualModal';
import { RendererConfigControls } from './RendererConfigControls';
import { TIPOS_CENA } from './sceneTypes';
import { SceneTypeIcon, sceneTypeStyle } from './SceneTypeIcon';
import {
  criarCenaManual,
  marcarSeReescrita,
  riscarCena,
  trazerCenaDeVolta,
  usePlanoDasCenas,
  validarSobreposicoesDoPlano,
} from './planoDasCenas';
import { AjusteDaCena } from './AjusteDaCena';
import { aceitaAjuste } from './regrasDoAjuste';
import { useAjusteDaCena } from './useAjusteDaCena';
import { Icon } from '@/upgrade/Icon';
import { mensagemErro } from '@/lib/mensagemErro';
import { ErroDaApi } from '@/shared/api';

// ─────────────────────────────────────────────────────────────
// CenasPanel — replica `design_reference/src/v3_pos.jsx > TabCenas (449-647)`.
// Header reorganizado por frequencia de uso:
//   1. Linha de titulo: Film + serif 17/500 + Chip contagem + Chip "N sem
//      retrato" warn + caption "roteiro visual"
//   2. Acao primaria (AUDITORIA-v4 §1): UMA linha — "Gerar cenas" (accent) +
//      menu ⋯ com Retratos / Manual / Studio / Padroes do palco
//   3. Padroes do palco: so aparece quando acionado pelo ⋯ (nao e mais linha fixa)
//   4. Stats (AUDITORIA-v4 §2): uma linha inline "Ns duracao · N cenas · N% cobertura",
//      com a legenda das origens recolhida na ponta (D-1086, NumerosDoPlano)
//   5. A rodada numa linha, com o Desfazer e o Comparar ao lado (D-1073, D-1086)
// Lista: CenaItem expansivel.
// Footer: "Tipos disponiveis ▾" + spacer + "Validar o plano (faltam N)" (D-1070).
//
// Mantem as acoes visiveis de IA, retratos, edicao e validacao de cenas.
// ─────────────────────────────────────────────────────────────

interface Props {
  corteId: string;
  projetoId: string;
  cenas: CenaRemotion[];
  formato?: string;
  paleta?: Record<string, string>;
  cenaAtivaIdx: number;
  cenasValidadas?: boolean;
  onSeek: (seg: number) => void;
  onCenasChange: (cenas: CenaRemotion[]) => void;
}

export interface CenasPanelHandle {
  /** Salva se houver pendencias. Retorna true se disparou a mutation. */
  saveIfDirty: () => boolean;
}

// A lista sem cenas. Durante a geração, não manda gerar: o convite é o clique que paga
// duas vezes (D-1037).
const LISTA_GERANDO = {
  titulo: 'Gerando cenas',
  dica: 'As cenas aparecem aqui quando a IA terminar. Pode trocar de corte enquanto isso.',
};
const LISTA_SEM_CENAS = {
  titulo: 'Nenhuma cena gerada',
  dica: 'Use Gerar por IA para criar automaticamente; ou Manual para uma cena vazia.',
};

/** O `detail` do backend já é a frase para o operador; o status HTTP é ruído (D-1065). */
const motivoDaFalhaDosRetratos = (erro: unknown) =>
  erro instanceof ErroDaApi ? erro.detalhe : mensagemErro(erro, 'Erro ao buscar retratos.');

export const CenasPanel = forwardRef<CenasPanelHandle, Props>(function CenasPanel(
  {
    corteId,
    projetoId,
    cenas,
    formato,
    paleta,
    cenaAtivaIdx,
    cenasValidadas = false,
    onSeek,
    onCenasChange,
  }: Props,
  ref,
) {
  const gerarClaude = useGerarCenasClaude(corteId, projetoId);
  const { emGeracao, provider: providerEmVoo } = useCenasEmGeracao(corteId, projetoId);
  const atualizar = useAtualizarCorte(corteId);
  const preencherRetratos = usePreencherRetratosCenas(corteId);
  const validarCenas = useValidarCenasRemotion(corteId, projetoId);
  const { notify } = useToast();
  const confirmacao = useConfirmacao();
  const [manualOpen, setManualOpen] = useState(false);
  const [padroesOpen, setPadroesOpen] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [dirty, setDirty] = useState(false);

  const cenasOrdenadas = useMemo(() => [...cenas].sort((a, b) => a.inicio - b.inicio), [cenas]);
  const { cenasDoRender, riscadas, origens, faltam } = usePlanoDasCenas(corteId, cenasOrdenadas);
  const duracaoCenas = useMemo(
    () => cenasDoRender.reduce((total, cena) => total + Math.max(0, cena.fim - cena.inicio), 0),
    [cenasDoRender],
  );
  const fimTimeline =
    cenasDoRender.length > 0 ? Math.max(...cenasDoRender.map((cena) => cena.fim)) : 0;
  const cobertura = fimTimeline > 0 ? (duracaoCenas / fimTimeline) * 100 : 0;
  const validation = useMemo(() => validarSobreposicoesDoPlano(cenasOrdenadas), [cenasOrdenadas]);
  const totalFichas = cenasDoRender.filter((cena) => cena.tipo === 'ficha_biografica').length;
  const fichasSemRetrato = cenasDoRender.filter(
    (cena) => cena.tipo === 'ficha_biografica' && !cena.retrato_url,
  ).length;
  const retratosDisabled = preencherRetratos.isPending || totalFichas === 0 || dirty || emGeracao;
  const retratosTooltip = emGeracao
    ? 'Espere as cenas terminarem de ser geradas'
    : dirty
      ? 'Salve as cenas antes de buscar retratos'
      : totalFichas === 0
        ? 'Nenhuma ficha biografica para buscar'
        : 'Buscar retratos das fichas biograficas';

  const ajuste = useAjusteDaCena(corteId, projetoId);

  const ultimaCenas = useUltimaGeracao('cenas-expert', { corteId });
  const cenasGeradasPor = ultimaCenas.data?.provider ?? null;

  // F-047: para a geracao, se o corte ja tem cenas e elas nao estao na mesma
  // tela, o clique passa pela confirmacao; sem nenhuma, dispara direto.
  const handleGerarCenas = (provider: 'claude' | 'gemini') => {
    confirmacao.executarOuPedir(confirmacaoRegerarCenas(cenasOrdenadas.length), () => {
      gerarClaude.mutate(provider);
    });
  };

  // Riscar e trazer de volta também mudam as cenas: ao salvar, o backend desfaz a
  // marca de validadas como em qualquer mudança (D-1030, D-1046).
  const substituirCena = (idx: number, next: CenaRemotion) => {
    const novas = [...cenas];
    const sortedToOriginal = cenas.indexOf(cenasOrdenadas[idx]);
    if (sortedToOriginal < 0) return;
    novas[sortedToOriginal] = next;
    onCenasChange(novas);
    setDirty(true);
  };

  // D-1070: reescrever o conteúdo de uma cena da IA a faz manual.
  const handleChange = (idx: number, next: CenaRemotion) =>
    substituirCena(idx, marcarSeReescrita(cenasOrdenadas[idx], next));

  const handleAdd = () => {
    onCenasChange([...cenas, criarCenaManual(cenasOrdenadas)]);
    setDirty(true);
  };

  const handleSalvar = useGravarCenas({ atualizar, formato, paleta, cenas: cenasOrdenadas, dirty, setDirty });

  // Ctrl+S na tela Pos delega para handleSalvar via ref. Sem dirty,
  // retorna false (parent fica em silencio).
  useImperativeHandle(
    ref,
    () => ({
      saveIfDirty: () => {
        if (!dirty || atualizar.isPending) return false;
        handleSalvar();
        return true;
      },
    }),
    [dirty, atualizar.isPending, handleSalvar],
  );

  const handlePreencherRetratos = () => {
    preencherRetratos.mutate(undefined, {
      onSuccess: (data) => {
        const stats = data.retratos;
        const tone =
          stats.atualizados > 0 ? 'success' : stats.total_fichas > 0 ? 'info' : 'warning';
        notify(`${stats.atualizados} retrato(s) atualizados de ${stats.total_fichas} ficha(s).`, {
          tone,
        });
      },
      onError: (error) => {
        notify(motivoDaFalhaDosRetratos(error), { tone: 'error' });
      },
    });
  };

  const validar = montarBotaoDoValidar({
    cenasValidadas,
    faltam,
    totalDeCenas: cenasOrdenadas.length,
    dirty,
    emGeracao,
    validando: validarCenas.isPending,
  });

  const handleValidarCenas = () => {
    validarCenas.mutate(!cenasValidadas, {
      onSuccess: (data) => {
        const validou = Boolean(data.cenas_validadas);
        notify(validou ? 'Plano de cenas validado.' : 'Validação do plano desfeita.', {
          tone: validou ? 'success' : 'info',
        });
      },
      onError: (error) => {
        notify(error instanceof Error ? error.message : 'Erro ao atualizar validacao das cenas.', {
          tone: 'error',
        });
      },
    });
  };

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      {/* Header — v3_pos.jsx:454-585 */}
      <header className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] p-3">
        {/* L1: titulo + chips + caption */}
        <div className="mb-2 flex items-center gap-2">
          <Icon name="film" className="text-[var(--wb-text-mute)]" />
          <strong className="whitespace-nowrap font-editorial text-[17px] font-medium text-[var(--wb-ink)]">
            Cenas Remotion
          </strong>
          <span className="inline-flex items-center rounded-full bg-[var(--wb-accent-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-accent)]">
            {cenasDoRender.length}
          </span>
          {fichasSemRetrato > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--wb-warn-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-warn)]">
              <Icon name="triangle-alert" />
              {fichasSemRetrato} sem retrato
            </span>
          )}
          {cenasValidadas && !dirty && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-[var(--wb-ok-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-ok)]"
              data-testid="cenas-validadas-badge"
            >
              <Icon name="circle-check" /> plano validado
            </span>
          )}
          <div className="flex-1" />
        </div>

        {/* L2: uma única linha de ação (AUDITORIA-v4 §1) — primário
            "Gerar cenas" + ⋯. Antes eram dois botões lado a lado MAIS a linha
            fixa "Padrões · avançado": duas fileiras de controles só para
            chegar na lista de cenas. Nada sumiu — Retratos, Manual, Studio e
            Padrões moram no ⋯, com os mesmos disabled/tooltip/loading. */}
        <div className="mb-2 flex items-stretch gap-1.5">
          <AcaoDeIa
            rotulo="Gerar cenas"
            tamanho="md"
            destaque
            emVoo={providerEmVoo}
            rotuloEmVoo="gerando cenas…"
            desabilitado={ajuste.pedindo}
            onGerar={handleGerarCenas}
            className="h-[34px] flex-1"
          />
          {!emGeracao && cenasOrdenadas.length > 0 && (
            <SeloDeProvider
              provider={cenasGeradasPor}
              modelo={ultimaCenas.data?.model}
              className="self-center"
            />
          )}
          <OverflowMenu
            label="Outras ações das cenas"
            items={[
              {
                icon: 'image',
                label: `Retratos${fichasSemRetrato > 0 ? ` (${fichasSemRetrato})` : ''}`,
                title: retratosTooltip,
                disabled: retratosDisabled,
                onClick: handlePreencherRetratos,
              },
              { icon: 'plus', label: 'Gerar manual', onClick: handleAdd },
              {
                icon: 'external-link',
                label: 'Studio Remotion',
                onClick: () => setManualOpen(true),
              },
              {
                icon: 'settings-2',
                label: padroesOpen ? 'Ocultar padrões do palco' : 'Padrões do palco',
                onClick: () => setPadroesOpen((v) => !v),
              },
            ]}
          />
        </div>

        {/* Padrões do palco — agora só aparece quando pedido pelo ⋯. Traz
            junto o card de config do renderer, que era a antiga linha fixa. */}
        {padroesOpen && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-1.5">
            <RendererConfigControls.Card projetoId={projetoId} />
            <RendererConfigControls.Avancado projetoId={projetoId} />
          </div>
        )}

        {/* L4: os números do plano numa linha, com a legenda recolhida na ponta (D-1086). */}
        <NumerosDoPlano duracao={duracaoCenas} cenas={cenasDoRender.length} riscadas={riscadas} cobertura={cobertura} temCenas={cenasOrdenadas.length > 0} />
        <LegendaDoPlano corteId={corteId} projetoId={projetoId} dirty={dirty} />

        {/* Botao Salvar so aparece quando dirty (mantem comportamento anterior) */}
        {dirty && (
          <div className="mt-2.5 flex justify-end">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSalvar}
              disabled={atualizar.isPending}
            >
              {atualizar.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="circle-check" />}
              Salvar cenas
            </Button>
          </div>
        )}
      </header>

      {/* Lista de cenas */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {validation.overlappingIndices.size > 0 && (
          <div className="mx-1 mb-2.5 rounded-[var(--radius-sm)] border border-wb-err/30 bg-[var(--wb-err-soft)] p-2.5 text-xs text-[var(--wb-err)]">
            <div className="flex items-start gap-2">
              <Icon name="triangle-alert" className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">Cenas sobrepostas detectadas</span>
                <span>
                  {validation.maxSimultaneous > 2
                    ? `Ha ate ${validation.maxSimultaneous} cenas sobrepostas. A tela pode ficar poluida!`
                    : 'Algumas cenas aparecem no mesmo intervalo. Ajuste os limites.'}
                </span>
              </div>
            </div>
          </div>
        )}

        {cenasOrdenadas.length === 0 ? (
          <ListaSemCenas emGeracao={emGeracao} />
        ) : (
          <ul role="list" className="flex flex-col gap-1.5">
            {cenasOrdenadas.map((cena, idx) => (
              <li key={`${cena.tipo}-${idx}-${cena.inicio}`}>
                <CenaComOrigem corteId={corteId}
                  ajuste={aceitaAjuste(origens[idx]) && <AjusteDaCena ajuste={ajuste} cena={cena} ativa={idx === cenaAtivaIdx} dirty={dirty} emGeracao={emGeracao} />}
                  cena={cena}
                  origem={origens[idx]}
                  ativa={idx === cenaAtivaIdx}
                  sobreposta={validation.overlappingIndices.has(idx)}
                  onChange={(next) => handleChange(idx, next)}
                  onRiscar={() => substituirCena(idx, riscarCena(cena))}
                  onTrazerDeVolta={() => substituirCena(idx, trazerCenaDeVolta(cena))}
                  onSeek={onSeek}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer — "Tipos disponiveis ▾" + spacer + o Validar (botaoDoValidar.ts) */}
      <footer className="flex items-center gap-2 border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2.5">
        <button
          type="button"
          onClick={() => setShowTypes((v) => !v)}
          className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded text-[11px] text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)]"
          aria-expanded={showTypes}
          title={`${Object.keys(TIPOS_CENA).length} tipos de cena disponiveis`}
        >
          <span className="truncate">Tipos disponiveis</span>
          <span className="font-code text-[10px] text-[var(--wb-text-dim)]">
            {Object.keys(TIPOS_CENA).length}
          </span>
          <Icon name="chevron-down" className="transition-transform" style={{ transform: showTypes ? 'rotate(180deg)' : 'none' }} />
        </button>
        <div className="flex-1" />
        <Tooltip label={validar.dica} side="top">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleValidarCenas}
            disabled={validar.desabilitado}
            data-testid="botao-validar-cenas"
            aria-pressed={cenasValidadas}
            className={cenasValidadas ? 'bg-[var(--wb-ok)] hover:opacity-90' : ''}
          >
            {validarCenas.isPending ? (
              <Icon name="loader-2" className="animate-spin" />
            ) : cenasValidadas ? (
              <Icon name="circle-check" />
            ) : (
              <Icon name="shield-check" />
            )}
            {validar.rotulo}
          </Button>
        </Tooltip>
      </footer>

      {/* Lista expansivel de tipos (clicar mostra/oculta) */}
      {showTypes && (
        <div className="border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-2.5 pb-2.5">
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {Object.entries(TIPOS_CENA).map(([tipo, meta]) => {
              const style = sceneTypeStyle(tipo);
              return (
                <span
                  key={tipo}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                  style={{ background: style.soft, color: style.color, borderColor: style.border }}
                >
                  <SceneTypeIcon tipo={tipo} />
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <CenasManualModal open={manualOpen} onClose={() => setManualOpen(false)} corteId={corteId} />

      <ConfirmDialog
        pedido={confirmacao.pedido}
        onCancel={confirmacao.cancelar}
        onConfirm={confirmacao.confirmar}
      />
    </section>
  );
});

function ListaSemCenas({ emGeracao }: { emGeracao: boolean }) {
  const { titulo, dica } = emGeracao ? LISTA_GERANDO : LISTA_SEM_CENAS;
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Icon name="film" ilustracao={30} className="text-[var(--wb-text-dim)]" />
      <p className="text-sm font-medium text-[var(--wb-text)]">{titulo}</p>
      <p className="max-w-xs text-[11px] text-[var(--wb-text-mute)]">{dica}</p>
    </div>
  );
}

// SceneStat (3 cards Duração/Densidade/Cobertura) saiu na AUDITORIA-v4 §2 —
// os mesmos números agora vivem numa linha inline no header do painel.
