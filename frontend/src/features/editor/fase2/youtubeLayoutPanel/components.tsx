/**
 * Subcomponentes de apresentação do YoutubeLayoutPanel (E-006).
 * Extraídos da fachada; recebem tudo por props (sem estado do painel).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { CLASSES_DO_CAMPO } from '@/components/ui/field';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { LayoutPreset, LayoutPresetTipo } from '@/types/presets';
import { segParaMmSs } from '../../timeUtils';
import { DefinirSplitButton } from '../DefinirSplitButton';
import type { YoutubeLayoutMode, YoutubeLayoutRegion } from '@/shared/palco/youtubeLayout';
import { legendaDoModoDoCorte, MODE_LABEL, MODE_SHORT, round } from './shared';
import type { OrigemDoTipo } from '../youtubeLayoutPadrao';
import { limitar } from '@/lib/limitar';
import { Icon, type IconName } from '@/upgrade/Icon';
import { FERRAMENTA_ICONE, FOCO } from '../../salaDoEditor';

/** Cor do ícone de escopo/modo: íris para o corte, info para projeto e global (DIRECAO §9.2). */
type TomDoEscopo = 'iris' | 'info';
const ICONE_DO_TOM: Record<TomDoEscopo, string> = {
  iris: 'bg-iris-suave text-iris',
  info: 'bg-info/[.13] text-info',
};
const TEXTO_DO_TOM: Record<TomDoEscopo, string> = { iris: 'text-iris', info: 'text-info' };

/** Rótulo de seção do painel: frase, sem caixa-alta. */
const ROTULO_DA_SECAO = 'text-micro font-semibold text-fg-3';

// Collapsible removido (F-060): as secoes Fundo/Placa migraram para o modal
// de posicionamento — fundo e placa agora pertencem ao preset/escopo.

// ─── EscopoLadder · D-421 ──────────────────────────────────────────────
// Substitui o DefinirPadroesCard (F-048), onde a cascata de escopos existia
// apenas como PROSA ("segmento > segmento (padrão) > corte > projeto >
// global") dentro de um card colapsado, a dois cliques de distância. Agora a
// cascata E a ordem visual das linhas — sempre aberta, do mais específico ao
// mais geral, com o escopo vencedor marcado.
//
// Duas remoções deliberadas:
//   - o toggle "Definindo Full|Compartilhada" era um FILTRO desenhado com o
//     mesmo segmented que define VALOR em outros dois pontos do painel; virou
//     um link discreto no cabeçalho da escada;
//   - o disclosure "Ajuste fino" (um único controle dentro) morreu.
//
// D-423: o "tipo do projeto" chegou a morar na linha Projeto desta escada e não
// coube — voltou para o cabeçalho, agora no ModoBlock. Esta escada trata de UMA
// coisa: de qual escopo sai o POSICIONAMENTO do modo selecionado.
//
// Referências: indicador "Modified in: <escopo>" do Settings do VS Code (expõe
// de onde o valor efetivo nasce, em vez de escondê-lo) e overrides de instância
// do Figma (herdado vs sobrescrito sempre visível, com caminho de volta).
export function EscopoLadder({
  modo,
  onAlternarModo,
  escopoAtivo,
  corteDefinido,
  projetoDefinido,
  globalDefinido,
  segmentoPadraoDefinido,
  presetCorteNome,
  presetProjetoNome,
  presetGlobalNome,
  presetSegmentoPadraoNome,
  onDefinirCorte,
  onDefinirProjeto,
  onDefinirGlobal,
  onDefinirSegmentoPadrao,
  onPresetCorte,
  onPresetProjeto,
  onPresetGlobal,
  onPresetSegmentoPadrao,
  onResetSegmentoPadrao,
  pendingProjeto,
  pendingGlobal,
}: {
  /** F-060: qual modo a escada exibe e define (Full | Compartilhada). */
  modo: YoutubeLayoutMode;
  onAlternarModo: (modo: YoutubeLayoutMode) => void;
  /** Escopo que alimenta o corte agora — recebe o selo "em uso". */
  escopoAtivo: 'corte' | 'projeto' | 'global' | 'default';
  corteDefinido: boolean;
  projetoDefinido: boolean;
  globalDefinido: boolean;
  segmentoPadraoDefinido: boolean;
  presetCorteNome: string | null;
  presetProjetoNome: string | null;
  presetGlobalNome: string | null;
  presetSegmentoPadraoNome: string | null;
  onDefinirCorte: () => void;
  onDefinirProjeto: () => void;
  onDefinirGlobal: () => void;
  onDefinirSegmentoPadrao: () => void;
  onPresetCorte: (preset: LayoutPreset) => void;
  onPresetProjeto: (preset: LayoutPreset) => void;
  onPresetGlobal: (preset: LayoutPreset) => void;
  onPresetSegmentoPadrao: (preset: LayoutPreset) => void;
  onResetSegmentoPadrao: () => void;
  pendingProjeto: boolean;
  pendingGlobal: boolean;
}) {
  const presetTipo: LayoutPresetTipo = modo === 'full' ? 'posicionamento_full' : 'posicionamento';
  const outroModo: YoutubeLayoutMode = modo === 'full' ? 'compartilhada' : 'full';

  return (
    <section>
      <div className="flex items-center gap-2">
        <span className={ROTULO_DA_SECAO}>Posicionamento</span>
        <div className="flex-1" />
        <Tooltip label={`Ver e definir os padrões de ${MODE_LABEL[outroModo]}`} side="left">
          <button
            type="button" data-sala=""
            onClick={() => onAlternarModo(outroModo)}
            className={`inline-flex items-center gap-1 rounded-etiqueta px-1.5 py-0.5 text-micro text-iris transition-colors duration-150 hover:bg-iris-suave motion-reduce:transition-none ${FOCO}`}
          >
            {MODE_SHORT[modo]}
            <Icon name="arrow-left-right" />
          </button>
        </Tooltip>
      </div>
      <p className="mb-1.5 mt-0.5 text-micro text-fg-3">
        do mais específico ao mais geral — o primeiro definido vence
      </p>

      {/* "Segmento (padrão)" e não "Segmento": o override por-região é outro
        escopo (LABEL_ESCOPO.segmento), editado no RegionItem. Dois rótulos
        iguais para escopos diferentes seriam desinformação. */}
      <DefinirScopeRow
        title="Segmento (padrão)"
        hint="base das regiões"
        icon="flag"
        tone="info"
        definido={segmentoPadraoDefinido}
        presetNome={presetSegmentoPadraoNome}
        presetTipo={presetTipo}
        onDefinir={onDefinirSegmentoPadrao}
        onPreset={onPresetSegmentoPadrao}
        onReset={segmentoPadraoDefinido ? onResetSegmentoPadrao : undefined}
        pendingDefinir={false}
      />
      <DefinirScopeRow
        title="Corte"
        icon="scissors"
        tone="iris"
        ativo={escopoAtivo === 'corte'}
        definido={corteDefinido}
        presetNome={presetCorteNome}
        presetTipo={presetTipo}
        onDefinir={onDefinirCorte}
        onPreset={onPresetCorte}
        pendingDefinir={false}
      />
      <DefinirScopeRow
        title="Projeto"
        icon="folder"
        tone="info"
        ativo={escopoAtivo === 'projeto'}
        definido={projetoDefinido}
        presetNome={presetProjetoNome}
        presetTipo={presetTipo}
        onDefinir={onDefinirProjeto}
        onPreset={onPresetProjeto}
        pendingDefinir={pendingProjeto}
      />
      <DefinirScopeRow
        title="Global"
        icon="globe"
        tone="info"
        ativo={escopoAtivo === 'global'}
        definido={globalDefinido}
        presetNome={presetGlobalNome}
        presetTipo={presetTipo}
        onDefinir={onDefinirGlobal}
        onPreset={onPresetGlobal}
        pendingDefinir={pendingGlobal}
      />
      {escopoAtivo === 'default' && (
        <p className="mt-1 text-micro text-fg-3">
          nenhum escopo definido — usando o fallback da aplicação
        </p>
      )}
    </section>
  );
}

function DefinirScopeRow({
  title,
  hint,
  icon,
  definido,
  presetNome,
  presetTipo,
  tone,
  ativo = false,
  onDefinir,
  onPreset,
  onReset,
  pendingDefinir,
}: {
  title: string;
  /** Nota curta ao lado do titulo (ex.: onde este escopo se aplica). */
  hint?: string;
  icon: IconName;
  /** Tem JSON salvo neste escopo (i.e. nao cai para o proximo da escada). */
  definido: boolean;
  /** Nome do preset salvo que bate com o config atual deste escopo. */
  presetNome: string | null;
  /** F-060: tipo de preset listado no dropdown (por modo). */
  presetTipo: LayoutPresetTipo;
  tone: TomDoEscopo;
  /** D-421: escopo que efetivamente alimenta o corte agora. */
  ativo?: boolean;
  onDefinir: () => void;
  onPreset: (preset: LayoutPreset) => void;
  /** Opcional: limpa este escopo (usado pelo Segmento p/ voltar a herdar). */
  onReset?: () => void;
  pendingDefinir: boolean;
}) {
  let subtitulo: string;
  if (!definido) subtitulo = 'Não definido — cai para o próximo';
  else if (presetNome) subtitulo = `Preset: ${presetNome}`;
  else subtitulo = 'Personalizado (não bate com preset salvo)';

  return (
    <div
      className={cn(
        'mb-1 flex items-center gap-2 rounded-ladrilho border p-1.5 last:mb-0',
        ativo ? 'border-iris-fio bg-iris-suave' : 'border-fio bg-vidro',
      )}
    >
      <span
        className={cn(
          'inline-flex size-6 flex-shrink-0 items-center justify-center rounded-full',
          ICONE_DO_TOM[tone],
        )}
      >
        <Icon name={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="flex-none text-pequeno font-semibold text-fg">{title}</span>
          {hint && (
            <span className="truncate text-micro text-fg-3">
              {hint}
            </span>
          )}
          {ativo && (
            <span
              className="flex-none rounded-pilula bg-iris-suave px-1.5 text-micro text-iris"
              title="É deste escopo que o corte está lendo agora"
            >
              em uso
            </span>
          )}
        </div>
        <div
          className="truncate text-micro text-fg-3"
          title={subtitulo}
        >
          {subtitulo}
        </div>
      </div>
      <DefinirSplitButton
        label="Definir"
        onOpenModal={onDefinir}
        onApplyPreset={onPreset}
        presetTipo={presetTipo}
        pending={pendingDefinir}
      />
      {onReset && (
        <Tooltip label="Remover este padrão (volta a herdar)" side="left">
          <button
            type="button" data-sala=""
            onClick={onReset}
            aria-label="Remover padrao"
            className={cn(FERRAMENTA_ICONE, 'hover:bg-erro/[.13] hover:text-erro')}
          >
            <Icon name="trash-2" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

// PadraoAtualChip removido (D-421): o selo "Corte · preset X" duplicava o que a
// EscopoLadder agora diz na propria linha do escopo, com o marcador "em uso".

// (LayoutSubLabel removido: os titulos das secoes viraram parte do
// componente Collapsible.)

// ─── ModePills — segmented Full | Comp. reutilizavel ───────────────────
// D-421: extraido do InlineModeToggle para que a linha Projeto da EscopoLadder
// use as mesmas pilulas sem arrastar junto o rotulo e o layout de linha.
//
// D-423: `flex-none`. Sem ele as pilulas eram o item flexivel da linha e, num
// painel estreito, encolhiam ate a segunda (COMP.) sair pela direita — que o
// container do painel corta com `overflow-x-hidden`. Resultado: so dava para
// clicar FULL. Agora quem cede espaco e o rotulo (truncate), nunca o controle.
export function ModePills({
  value,
  onChange,
  pending,
  herdando = false,
}: {
  value: YoutubeLayoutMode;
  onChange: (modo: YoutubeLayoutMode) => void;
  pending?: boolean;
  /** Nenhuma pílula fica pressed: o valor efetivo vem de outro escopo. */
  herdando?: boolean;
}) {
  return (
    <div className="inline-flex flex-none items-center gap-0.5 rounded-pilula border border-fio bg-poco p-0.5">
      {(['full', 'compartilhada'] as const).map((m) => {
        const pressed = !herdando && value === m;
        return (
          <button
            key={m}
            type="button" data-sala=""
            onClick={() => onChange(m)}
            disabled={pending}
            aria-pressed={pressed}
            title={MODE_LABEL[m]}
            className={cn(
              `h-6 rounded-pilula px-2.5 text-micro transition-colors duration-150 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none ${FOCO}`,
              pressed ? 'bg-iris-suave text-iris-2' : 'bg-transparent text-fg-2 hover:text-fg',
            )}
          >
            {/* Rótulo curto (COMP.) como nos chips de região; o nome completo
                fica no title. */}
            {MODE_SHORT[m]}
          </button>
        );
      })}
    </div>
  );
}

// ─── ModoBlock — as DUAS decisões de modo, lado a lado ─────────────────
// D-423: o "modo com que novos cortes nascem" morava dentro da linha Projeto da
// escada de posicionamento (D-421), espremido entre o ícone e o botão "Definir
// ▾" — e a pílula COMP. simplesmente não cabia, ficando fora da área visível.
// Não dava para escolher Compartilhada como padrão do projeto.
//
// Duas mudanças de fundo, além de destravar o clique:
//   - MODO deixou de ser um detalhe de um dos degraus da escada. Modo (o quê se
//     compõe) e posicionamento (onde cada coisa entra) são decisões diferentes;
//     agora são dois blocos, e a escada volta a ser só cascata de
//     posicionamento — que é o que o título dela diz.
//   - as duas linhas de modo ficam adjacentes e com o MESMO widget, então
//     "este corte está em Full porque o projeto está em Full" se lê numa
//     olhada, e mudar o padrão é um clique na linha de baixo.
export function ModoBlock({
  modoCorte,
  onChangeModoCorte,
  herdando,
  onResetCorte,
  tipoProjeto,
  origemTipoProjeto,
  onChangeTipoProjeto,
  pendingProjeto,
}: {
  modoCorte: YoutubeLayoutMode;
  onChangeModoCorte: (modo: YoutubeLayoutMode) => void;
  /** I-025: quando true, nenhuma pílula fica pressed — o corte herda do projeto. */
  herdando: boolean;
  /** D-421: devolve o corte ao modo do projeto. Ausente quando já coincidem. */
  onResetCorte?: () => void;
  tipoProjeto: YoutubeLayoutMode;
  /** D-970: de onde vem o `tipoProjeto` — a legenda do corte que herda cita a fonte real. */
  origemTipoProjeto: OrigemDoTipo;
  onChangeTipoProjeto: (modo: YoutubeLayoutMode) => void;
  pendingProjeto: boolean;
}) {
  return (
    <section className="mt-2 rounded-ladrilho border border-fio bg-vidro px-2 py-1">
      <span className={ROTULO_DA_SECAO}>Modo</span>
      <ModoRow
        icon="scissors"
        tone="iris"
        label="Este corte"
        caption={legendaDoModoDoCorte(herdando, origemTipoProjeto, tipoProjeto)}
        value={modoCorte}
        onChange={onChangeModoCorte}
        herdando={herdando}
        onReset={onResetCorte}
        resetLabel="Voltar ao modo do projeto"
      />
      <ModoRow
        icon="folder"
        tone="info"
        label="Novos cortes"
        caption="padrão do projeto"
        value={tipoProjeto}
        onChange={onChangeTipoProjeto}
        pending={pendingProjeto}
      />
    </section>
  );
}

// Uma linha do ModoBlock. O rótulo (com a legenda embaixo) é quem encolhe; as
// pílulas são `flex-none` e ficam sempre alcançáveis por mais estreito que o
// painel esteja — a regressão que o D-423 corrige.
function ModoRow({
  icon,
  tone,
  label,
  caption,
  value,
  onChange,
  herdando = false,
  pending,
  onReset,
  resetLabel,
}: {
  icon: IconName;
  tone: TomDoEscopo;
  label: string;
  caption: string;
  value: YoutubeLayoutMode;
  onChange: (modo: YoutubeLayoutMode) => void;
  herdando?: boolean;
  pending?: boolean;
  onReset?: () => void;
  resetLabel?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <Icon name={icon} className={cn('flex-none', TEXTO_DO_TOM[tone])} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-micro font-semibold text-fg">{label}</div>
        <div className="truncate text-micro text-fg-3" title={caption}>
          {caption}
        </div>
      </div>
      {onReset && resetLabel && (
        <Tooltip label={resetLabel} side="left">
          <button
            type="button" data-sala=""
            onClick={onReset}
            aria-label={resetLabel}
            className={FERRAMENTA_ICONE}
          >
            <Icon name="rotate-cw" />
          </button>
        </Tooltip>
      )}
      <ModePills value={value} onChange={onChange} herdando={herdando} pending={pending} />
    </div>
  );
}

// SharedScreenCountToggle e ModePicker movidos para ./posicionamentoControls.tsx
// FundoPicker removido (F-060): o seletor de fundo migrou para o modal de
// posicionamento (PosicionamentoModal).

// SceneStat removido (AUDITORIA-v4 §2/§3): os 3 cards de stats viraram uma
// linha inline tanto no CenasPanel quanto aqui no Layout YouTube.

// PlacaField removido (F-060): a edicao da placa migrou para o modal de
// posicionamento (PosicionamentoModal).

// PadraoLayoutGroup REMOVIDO: substituido por PadraoLayoutCard + PadraoScopeRow
// (decisao de produto: hierarquia compacta com 4 acoes Projeto/Global, modal de
// confirmacao). Veja a definicao mais acima neste arquivo.

// ─── RegionItem ────────────────────────────────────────────────
// F-049: pares de botões ± de ajuste fino (passo FINE_STEP_SEG) ao redor
// dos campos Início/Fim. Cada clique ajusta a borda da região E faz seek
// no player para o novo tempo, permitindo ver o quadro exato.
const FINE_STEP_SEG = 0.1;

export function RegionItem({
  region,
  active,
  duration,
  presetEmUsoNome,
  onSeek,
  onSeekTo,
  onRemove,
  onChangeInicio,
  onChangeFim,
  onChangeModo,
  onClearOverride,
  onAbrirPosicionamento,
  onAplicarPresetSegmento,
}: {
  region: YoutubeLayoutRegion;
  active: boolean;
  duration: number;
  presetEmUsoNome: string | null;
  onSeek: () => void;
  onSeekTo: (seg: number) => void;
  onRemove: () => void;
  onChangeInicio: (seg: number) => void;
  onChangeFim: (seg: number) => void;
  onChangeModo: (modo: YoutubeLayoutMode) => void;
  /** F-060: limpa o override de posicionamento da regiao (volta a herdar). */
  onClearOverride: () => void;
  onAbrirPosicionamento: () => void;
  onAplicarPresetSegmento: (preset: LayoutPreset) => void;
}) {
  const isShared = region.modo === 'compartilhada';
  const tom = isShared ? 'text-info' : 'text-iris';
  // F-060: regioes full tambem tem override de posicionamento ({crop, slot}).
  const hasOverride = isShared
    ? region.compartilhada !== undefined && Object.keys(region.compartilhada).length > 0
    : region.full !== undefined && Object.keys(region.full).length > 0;

  // Replica o clamp de commitRegionInicio/Fim para que o seek caia no
  // mesmo ponto que será gravado. Sem isso, seek e valor salvo podem
  // divergir em até FINE_STEP_SEG nas bordas (inicio + 0.1, duration).
  const adjustInicio = (delta: number) => {
    const next = limitar(round(region.inicio + delta), 0, duration);
    if (next !== region.inicio) onChangeInicio(next);
    onSeekTo(next);
  };
  const adjustFim = (delta: number) => {
    const minFim = region.inicio + 0.1;
    const next = limitar(round(region.fim + delta), minFim, Math.max(minFim, duration));
    if (next !== region.fim) onChangeFim(next);
    onSeekTo(next);
  };

  return (
    <li
      className={cn(
        'rounded-campo border p-2',
        active ? 'border-iris-fio bg-iris-suave' : 'border-fio bg-vidro',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button" data-sala=""
          onClick={onSeek}
          className={`flex flex-1 items-center gap-2 rounded-etiqueta text-left ${FOCO}`}
        >
          <span className={cn('inline-flex items-center gap-1.5 text-micro', tom)}>
            <span className="size-1.5 rounded-full bg-current" />
            {region.modo}
          </span>
          <span className="num text-micro tabular-nums text-fg-2">
            {segParaMmSs(region.inicio, true)} → {segParaMmSs(region.fim, true)}
          </span>
        </button>
        <Tooltip label="Remover intervalo" side="left">
          <button
            type="button" data-sala=""
            onClick={onRemove}
            aria-label="Remover intervalo"
            className={cn(FERRAMENTA_ICONE, 'hover:bg-erro/[.13] hover:text-erro')}
          >
            <Icon name="trash-2" />
          </button>
        </Tooltip>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <label className="flex flex-col gap-0.5 text-micro text-fg-3">
          Início
          <div className="flex items-center gap-1">
            <FineStepButton
              label="Recuar início 0,1s e ver o quadro"
              onClick={() => adjustInicio(-FINE_STEP_SEG)}
            >
              <Icon name="minus" />
            </FineStepButton>
            <div className="min-w-0 flex-1">
              <TimeField campo="inicio"
                valueSeg={region.inicio}
                ariaLabel="Início do intervalo (mm:ss)"
                onCommit={onChangeInicio}
              />
            </div>
            <FineStepButton
              label="Avançar início 0,1s e ver o quadro"
              onClick={() => adjustInicio(+FINE_STEP_SEG)}
            >
              <Icon name="plus" />
            </FineStepButton>
          </div>
        </label>
        <label className="flex flex-col gap-0.5 text-micro text-fg-3">
          Fim
          <div className="flex items-center gap-1">
            <FineStepButton
              label="Recuar fim 0,1s e ver o quadro"
              onClick={() => adjustFim(-FINE_STEP_SEG)}
            >
              <Icon name="minus" />
            </FineStepButton>
            <div className="min-w-0 flex-1">
              <TimeField campo="fim"
                valueSeg={region.fim}
                ariaLabel="Fim do intervalo (mm:ss)"
                onCommit={onChangeFim}
              />
            </div>
            <FineStepButton
              label="Avançar fim 0,1s e ver o quadro"
              onClick={() => adjustFim(+FINE_STEP_SEG)}
            >
              <Icon name="plus" />
            </FineStepButton>
          </div>
        </label>
        <label className="flex flex-col gap-0.5 text-micro text-fg-3">
          Modo
          <select name="modo"
            data-sala=""
            value={region.modo}
            onChange={(e) => onChangeModo(e.target.value as YoutubeLayoutMode)}
            className={cn(CLASSES_DO_CAMPO, 'h-7 px-2 text-pequeno')}
          >
            <option value="full">Full</option>
            <option value="compartilhada">Compartilhada</option>
          </select>
        </label>
      </div>
      <div className="mt-2 flex flex-col gap-1 rounded-ladrilho border border-fio bg-poco px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={ROTULO_DA_SECAO}>Posicionamento</span>
          {hasOverride && (
            <span className="rounded-pilula bg-iris-suave px-1.5 py-0.5 text-micro text-iris">
              personalizado
            </span>
          )}
          <div className="flex-1" />
          <DefinirSplitButton
            label="Mudar posicionamento"
            onOpenModal={onAbrirPosicionamento}
            onApplyPreset={onAplicarPresetSegmento}
            presetTipo={isShared ? 'posicionamento' : 'posicionamento_full'}
            compact
          />
          {hasOverride && (
            <Tooltip label="Voltar ao posicionamento do corte" side="left">
              <button
                type="button" data-sala=""
                onClick={onClearOverride}
                className={`inline-flex items-center gap-1 rounded-pilula bg-transparent px-1.5 text-micro text-fg-2 transition-colors duration-150 hover:text-fg motion-reduce:transition-none ${FOCO}`}
              >
                <Icon name="rotate-cw" />
                Reverter
              </button>
            </Tooltip>
          )}
        </div>
        <span
          className="truncate text-micro text-fg-3"
          title={presetEmUsoNome ?? undefined}
        >
          {presetEmUsoNome
            ? `Preset: ${presetEmUsoNome}`
            : hasOverride
              ? 'Personalizado neste segmento (não bate com preset salvo)'
              : 'Herda do corte'}
        </span>
      </div>
    </li>
  );
}

function FineStepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} side="top">
      <button
        type="button" data-sala=""
        onClick={onClick}
        aria-label={label}
        className={`inline-flex h-7 w-5 flex-shrink-0 items-center justify-center rounded-etiqueta border border-fio-2 bg-vidro-2 text-fg-2 transition-colors duration-150 hover:bg-vidro-3 hover:text-fg motion-reduce:transition-none ${FOCO}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

// CropPicker, SharedRectEditor, resizeSlotForCrop, rectFromPoints, rectToStyle,
// isCropRectKey, isFacecamRectKey, getRectLabel, clamp, IconControl movidos para
// ./posicionamentoControls.tsx (consumidos pelo PosicionamentoModal).

function parseTimeInput(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const parts = t.split(':');
    if (parts.length > 3) return null;
    const nums = parts.map((part) => Number(part));
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return nums.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function TimeField({
  campo,
  valueSeg, onCommit, ariaLabel,
}: {
  campo: string;
  valueSeg: number;
  onCommit: (seg: number) => void;
  ariaLabel: string;
}) {
  const [text, setText] = useState(() => segParaMmSs(valueSeg, true));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(segParaMmSs(valueSeg, true));
  }, [valueSeg, editing]);

  const commit = () => {
    setEditing(false);
    const seg = parseTimeInput(text);
    if (seg === null) {
      setText(segParaMmSs(valueSeg, true));
      return;
    }
    onCommit(seg);
  };

  return (
    <Input name={campo}
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={text}
      placeholder="mm:ss"
      onFocus={() => setEditing(true)}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      aparencia="sala"
      className="num h-7 px-2 text-pequeno"
    />
  );
}
