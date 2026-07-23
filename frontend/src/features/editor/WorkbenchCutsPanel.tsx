import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  ChevronUp,
  Film,
  Plus,
  Scissors,
  Settings,
  Sparkles,
  Tag,
  Youtube,
} from 'lucide-react';
import { cn, formatarDuracaoHMS } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { PanelShell } from '@/components/workbench/PanelShell';
import { RetractableFooter } from '@/components/workbench/RetractableFooter';
import type { Corte, StatusExportCorte } from '@/types/models';
import { moverCorte, useReordenarCortes } from '@/hooks/useEditor';
import { MetadataModal } from '@/features/metadata/MetadataModal';
import { AdicionarCorteModal } from './AdicionarCorteModal';
import { resolveThumbUrl } from '@/lib/api';
import { tintarFundo, type SinalFlags } from './UnifiedSidebar';

// ─────────────────────────────────────────────────────────────
// WorkbenchCutsPanel — a lista de cortes da UnifiedSidebar
// re-hospedada num PanelShell retrátil (DE-PARA §3, Etapa 3a).
// A navegação por fases saiu (virou aba do shell); os tints
// `tintarFundo` e o CorteStatusCard são preservados intactos.
//
// Rodapé "⚙ FERRAMENTAS DO CORTE" (AUDITORIA-v2 §8, CP9): a auditoria
// lista 5 ações candidatas, mas 4 delas já têm um gatilho que funciona
// bem em outro lugar — duplicá-las aqui violaria a regra "sem duplicar
// trigger" da própria etapa. Decisão (ver deviations do commit):
//   - "÷ dividir corte em dois" já mora no menu ⚙ da Timeline (CP7).
//   - "↕ reordenar cortes" já é prático como setas ↑↓ inline na lista.
//   - "⧉ duplicar corte" está fora de escopo desta rodada (não existe
//     hook/endpoint — decisão de Paulo).
//   - "🗑 excluir corte" duplicaria 1:1 o botão "R · Rejeitar" do
//     veredito: `toggleRejeitado` já chama `useDeletarCorte` (delete
//     permanente com confirm), como confirma o title="Excluir (R)" em
//     `CommonTopBar.tsx`.
// Sobra só "✂ adicionar corte manual" (piso explícito da etapa) — o
// mesmo `AdicionarCorteModal` já acionado pelo ícone do header e pelo
// botão tracejado da lista; o rodapé é só mais um ponto de acesso
// estável (sempre no mesmo lugar, mesmo com a lista rolada/colapsada).
// ─────────────────────────────────────────────────────────────

const APROVADO_STATUS = new Set<Corte['status']>(['aprovado', 'editado', 'processado']);

// ─────────────────────────────────────────────────────────────
// D-397 · Semáforo do card: DECISÃO (cor) + ESTÁGIO (ícones)
//
// São dois eixos independentes e o card os mantém separados:
//   • DECISÃO editorial — rejeitado / aprovado / 🔥 fire / 📖 leitura.
//     Vive na cor: fundo tintado (`tintarFundo`, regra única já usada
//     pela sidebar antiga) + uma faixa vertical à esquerda em cor
//     CHEIA. O fundo inativo usa os tints `-soft` (quase brancos), e
//     num degradê verde→laranja→azul isso fica ilegível; a faixa é o
//     que torna o degradê perceptível sem gritar no painel.
//   • ESTÁGIO do pipeline — bruto gerado? pós/render final feito? já
//     está no YouTube? Vive em 3 ícones + a palavra da fase.
//
// Por que não confiar só na cor: pelos guias de status indicator
// (Carbon), um indicador acessível combina ao menos 3 de 4 canais —
// cor, forma, símbolo e texto. Daí o trio faixa colorida + ícone
// preenchido/vazado + palavra da fase (+ tooltip descritivo).
// ─────────────────────────────────────────────────────────────

const COR_ESTAGIO = {
  bruto: 'oklch(0.72 0.16 75)',
  pos: 'oklch(0.62 0.2 300)',
  youtube: 'oklch(0.6 0.2 25)',
} as const;

type EstadoEstagio = 'pronto' | 'andamento' | 'pendente';

interface EstagioView {
  chave: keyof typeof COR_ESTAGIO;
  Icon: LucideIcon;
  rotulo: string;
  estado: EstadoEstagio;
  cor: string;
  detalhe: string;
}

/** Marco do pipeline: ícone, rótulo e como cada estado se lê por extenso. */
const MARCOS = {
  bruto: {
    Icon: Film,
    rotulo: 'Bruto',
    cor: COR_ESTAGIO.bruto,
    detalhe: { pronto: 'gerado', andamento: 'gerando', pendente: 'não gerado' },
  },
  pos: {
    Icon: Sparkles,
    rotulo: 'Pós',
    cor: COR_ESTAGIO.pos,
    detalhe: { pronto: 'render final pronto', andamento: 'em andamento', pendente: 'não iniciada' },
  },
  youtube: {
    Icon: Youtube,
    rotulo: 'YouTube',
    cor: COR_ESTAGIO.youtube,
    detalhe: { pronto: 'publicado', andamento: 'agendado', pendente: 'não publicado' },
  },
} as const satisfies Record<
  keyof typeof COR_ESTAGIO,
  { Icon: LucideIcon; rotulo: string; cor: string; detalhe: Record<EstadoEstagio, string> }
>;

function marcoView(chave: keyof typeof MARCOS, estado: EstadoEstagio): EstagioView {
  const { Icon, rotulo, cor, detalhe } = MARCOS[chave];
  return { chave, Icon, rotulo, cor, estado, detalhe: detalhe[estado] };
}

/** Os 3 marcos que dizem em que fase o corte está, na ordem do pipeline. */
export function derivarEstagios(
  status: StatusExportCorte | undefined,
  publicado: boolean,
): EstagioView[] {
  // "Pós" fecha no encode final (upload_ready/video.mp4). Grade, overlays e
  // cenas salvas são etapas intermediárias — valem como "em andamento".
  const posIniciada = Boolean(
    status?.grade_pronta || status?.overlays_prontos || status?.cenas_geradas,
  );

  return [
    marcoView('bruto', status?.raw_pronto ? 'pronto' : 'pendente'),
    marcoView('pos', status?.video_pronto ? 'pronto' : posIniciada ? 'andamento' : 'pendente'),
    marcoView(
      'youtube',
      publicado ? 'pronto' : status?.youtube_scheduled_at ? 'andamento' : 'pendente',
    ),
  ];
}

interface FaseView {
  rotulo: string;
  ink: string;
}

/**
 * A palavra que resume onde o corte está — canal de TEXTO do semáforo.
 * A tinta usa os tokens `-ink` do tema (legíveis sobre o fundo tintado nos
 * dois temas); os `--tint-*` são cores de SUPERFÍCIE e no escuro ficariam
 * quase invisíveis como texto.
 */
export function derivarFase(
  flags: SinalFlags,
  status: StatusExportCorte | undefined,
  publicado: boolean,
): FaseView {
  if (flags.rejeitado) return { rotulo: 'rejeitado', ink: 'var(--wb-err-ink)' };
  if (!flags.aprovado) return { rotulo: 'pendente', ink: 'var(--wb-text-mute)' };
  if (publicado) return { rotulo: 'publicado', ink: 'var(--wb-ok-ink)' };
  // "a publicar" e não "pronto para publicar": a linha tem ~124px no painel
  // de 236px e o rótulo longo truncava.
  if (status?.video_pronto) return { rotulo: 'a publicar', ink: 'var(--wb-ok-ink)' };
  if (status?.raw_pronto) return { rotulo: 'pós', ink: 'var(--wb-violet)' };
  return { rotulo: 'edição', ink: 'var(--wb-warn-ink)' };
}

/** Faixa lateral: mesma regra de `tintarFundo`, porém sempre em cor cheia. */
export function faixaDeSinais(flags: SinalFlags): string {
  if (flags.rejeitado) return 'var(--tint-rejeitado)';
  const stops: string[] = [];
  if (flags.aprovado) stops.push('var(--tint-aprovado)');
  if (flags.fire) stops.push('var(--tint-fire)');
  if (flags.leitura) stops.push('var(--tint-leitura)');
  if (stops.length === 0) return 'var(--wb-border)';
  if (stops.length === 1) return stops[0];
  return `linear-gradient(180deg, ${stops.join(', ')})`;
}

interface Props {
  projetoId: string;
  cortes: Corte[];
  corteAtivoId: string;
  exportStatus: StatusExportCorte[];
  /** Resolve a URL ao clicar num corte. Default: /projetos/:id/cortes/:corteId. */
  getCortePath?: (corte: Corte) => string;
  /** Tempo atual do player p/ o modal "Adicionar corte" (só no Bruto). */
  getCurrentTime?: () => number;
}

export function WorkbenchCutsPanel({
  projetoId,
  cortes,
  corteAtivoId,
  exportStatus,
  getCortePath,
  getCurrentTime,
}: Props) {
  const navigate = useNavigate();
  const activeCardRef = useRef<HTMLDivElement | null>(null);
  const statusMap = new Map(exportStatus.map((s) => [s.corte_id, s] as const));
  const [adicionarOpen, setAdicionarOpen] = useState(false);
  const [metaCorte, setMetaCorte] = useState<Corte | null>(null);
  const [ferramentasOpen, setFerramentasOpen] = useState(false);
  const reordenar = useReordenarCortes(projetoId);

  const aprovados = cortes.filter((c) => APROVADO_STATUS.has(c.status)).length;

  function mover(corteId: string, delta: -1 | 1) {
    const novaOrdem = moverCorte(cortes, corteId, delta);
    if (novaOrdem) reordenar.mutate(novaOrdem);
  }

  useEffect(() => {
    activeCardRef.current?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }, [corteAtivoId, cortes.length]);

  return (
    <PanelShell
      id="cuts"
      side="left"
      title={`CORTES · ${aprovados}/${cortes.length}`}
      indicator={<span aria-hidden className="h-2 w-2 rounded-full bg-[var(--wb-accent)]" />}
      headerExtra={
        <Tooltip label="Adicionar corte manualmente" side="bottom">
          <button
            type="button"
            onClick={() => setAdicionarOpen(true)}
            aria-label="Adicionar corte manualmente"
            className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
          >
            <Plus size={12} strokeWidth={2.4} aria-hidden />
          </button>
        </Tooltip>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1.5 pb-2">
        {cortes.map((corte, idx) => {
          const ativo = corte.id === corteAtivoId;
          return (
            <CorteCard
              key={corte.id}
              cardRef={ativo ? activeCardRef : undefined}
              projetoId={projetoId}
              corte={corte}
              status={statusMap.get(corte.id)}
              ativo={ativo}
              podeSubir={idx > 0}
              podeDescer={idx < cortes.length - 1}
              reordenando={reordenar.isPending}
              onMover={(delta) => mover(corte.id, delta)}
              href={getCortePath?.(corte) ?? `/projetos/${projetoId}/cortes/${corte.id}`}
              onAbrirMetadados={() => setMetaCorte(corte)}
            />
          );
        })}

        <button
          type="button"
          onClick={() => setAdicionarOpen(true)}
          className="mt-1 rounded-lg border border-dashed border-[var(--wb-border)] px-2 py-1.5 text-center text-[10.5px] font-semibold text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
        >
          ＋ adicionar corte
        </button>
      </div>

      <RetractableFooter
        icon={<Settings size={13} />}
        label="Ferramentas do corte"
        open={ferramentasOpen}
        onToggle={() => setFerramentasOpen((v) => !v)}
      >
        <button
          type="button"
          onClick={() => setAdicionarOpen(true)}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[11.5px] font-semibold text-[var(--wb-text)] hover:bg-[var(--wb-bg-inset)]"
        >
          <Scissors size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
          Adicionar corte manual
        </button>
      </RetractableFooter>

      <AdicionarCorteModal
        open={adicionarOpen}
        onClose={() => setAdicionarOpen(false)}
        projetoId={projetoId}
        getCurrentTime={getCurrentTime}
        onCreated={(corte) =>
          navigate(getCortePath?.(corte) ?? `/projetos/${projetoId}/cortes/${corte.id}`)
        }
      />

      {metaCorte && (
        <MetadataModal
          open
          projetoId={projetoId}
          corte={metaCorte}
          onClose={() => setMetaCorte(null)}
        />
      )}
    </PanelShell>
  );
}

interface CorteCardProps {
  cardRef?: RefObject<HTMLDivElement>;
  projetoId: string;
  corte: Corte;
  status: StatusExportCorte | undefined;
  ativo: boolean;
  podeSubir: boolean;
  podeDescer: boolean;
  reordenando: boolean;
  onMover: (delta: -1 | 1) => void;
  /** Rota do corte. É um <Link> de verdade — ver D-404 no corpo do card. */
  href: string;
  onAbrirMetadados: () => void;
}

/**
 * Card de um corte na lista: decisão editorial na cor (fundo tintado + faixa
 * lateral) e estágio do pipeline nos ícones + na palavra da fase.
 */
function CorteCard({
  cardRef,
  projetoId,
  corte,
  status,
  ativo,
  podeSubir,
  podeDescer,
  reordenando,
  onMover,
  href,
  onAbrirMetadados,
}: CorteCardProps) {
  const publicado = Boolean(status?.youtube_url_publicado);
  const flags: SinalFlags = {
    aprovado: APROVADO_STATUS.has(corte.status),
    rejeitado: corte.status === 'rejeitado',
    fire: Boolean(corte.is_fire),
    leitura: Boolean(corte.is_leitura),
  };
  const tintBackground = tintarFundo(flags, ativo);
  const fase = derivarFase(flags, status, publicado);
  const thumbUrl = resolveThumbUrl(projetoId, status?.thumbnail_path);

  return (
    <div
      ref={cardRef}
      style={tintBackground ? { background: tintBackground } : undefined}
      className={cn(
        'group relative flex w-full flex-col gap-1.5 rounded-[var(--radius-sm)] border py-2 pl-[13px] pr-2 transition-colors',
        !tintBackground && 'hover:bg-[var(--wb-bg-inset)]',
        ativo
          ? cn('border-[var(--wb-accent)] shadow-sm', !tintBackground && 'bg-[var(--wb-bg-card)]')
          : 'border-transparent',
      )}
    >
      <span
        aria-hidden
        style={{ background: faixaDeSinais(flags) }}
        className="absolute bottom-2 left-1 top-2 w-[3px] rounded-full"
      />

      <div
        className={cn(
          'pointer-events-none absolute right-0.5 top-0.5 flex flex-col gap-0.5 transition-opacity',
          'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
          reordenando && 'opacity-100',
        )}
      >
        <button
          type="button"
          onClick={() => onMover(-1)}
          disabled={!podeSubir || reordenando}
          aria-label={`Mover corte ${corte.numero} para cima`}
          className="pointer-events-auto flex h-3.5 w-3.5 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--wb-bg-card)]/85 text-[var(--wb-text-dim)] shadow-sm hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--wb-focus)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-[var(--wb-bg-card)]/85"
        >
          <ChevronUp size={10} strokeWidth={2.4} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onMover(1)}
          disabled={!podeDescer || reordenando}
          aria-label={`Mover corte ${corte.numero} para baixo`}
          className="pointer-events-auto flex h-3.5 w-3.5 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--wb-bg-card)]/85 text-[var(--wb-text-dim)] shadow-sm hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--wb-focus)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-[var(--wb-bg-card)]/85"
        >
          <ChevronDown size={10} strokeWidth={2.4} aria-hidden />
        </button>
      </div>

      {/* Linha 1: thumb 58×33 + "NN · título" + duração · fase.
          D-404: é um <Link> (âncora de verdade), não um <button> com
          navigate(). Só assim o navegador devolve os gestos nativos —
          Ctrl/⌘+clique e clique do meio abrem o corte em nova aba, e o
          menu de contexto ganha "abrir link em nova aba". O clique
          simples continua sendo navegação SPA, sem reload. */}
      <Link
        to={href}
        aria-current={ativo ? 'page' : undefined}
        className="flex w-full items-center gap-2 text-left focus-visible:outline-none"
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            className="h-[33px] w-[58px] flex-none rounded object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-[33px] w-[58px] flex-none items-center justify-center rounded bg-[var(--wb-bg-inset)] font-code text-[10.5px] font-bold text-[var(--wb-text-dim)]"
          >
            #{corte.numero}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-[12.5px] leading-tight',
              flags.aprovado || publicado
                ? 'font-bold text-[var(--wb-text)]'
                : 'font-semibold text-[var(--wb-text-mute)]',
            )}
          >
            {corte.numero} · {corte.titulo_proposto || `Corte #${corte.numero}`}
          </span>
          <span className="mt-0.5 block truncate text-[11px] leading-tight text-[var(--wb-text-mute)]">
            {formatarDuracaoHMS(Math.max(0, corte.fim_seg - corte.inicio_seg))}
            {' · '}
            {/* No card ativo o fundo vai para o tint VIVO e as tintas de fase
                caem para ~3:1 — ali o rótulo usa o texto normal (>8:1) e a cor
                fica por conta da faixa e dos ícones de estágio. */}
            <span
              className="font-semibold"
              style={{ color: ativo && tintBackground ? 'var(--wb-text)' : fase.ink }}
            >
              {fase.rotulo}
            </span>
          </span>
        </span>
      </Link>

      {/* Linha 2: em que ponto do pipeline o corte está + atalho de metadados. */}
      <div className="flex items-center justify-between gap-1">
        <EstagioTrack numero={corte.numero} estagios={derivarEstagios(status, publicado)} />
        <button
          type="button"
          aria-label={`Abrir metadados do corte ${corte.numero}`}
          title="Metadados"
          onClick={onAbrirMetadados}
          className="flex h-[20px] w-[20px] flex-none items-center justify-center rounded-[var(--radius-xs)] text-[var(--wb-text-dim)] opacity-0 hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] group-hover:opacity-100"
        >
          <Tag size={12} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * Trilha compacta dos 3 marcos do pipeline (bruto → pós → YouTube).
 * Cada slot combina forma + cor + símbolo; o texto vem no tooltip e no
 * aria-label, para que o estado não dependa só da cor.
 */
function EstagioTrack({ numero, estagios }: { numero: number; estagios: EstagioView[] }) {
  const resumo = estagios.map((e) => `${e.rotulo}: ${e.detalhe}`).join(' · ');

  return (
    <Tooltip
      label={
        <span className="flex flex-col gap-0.5 text-[11px] leading-snug">
          <strong className="text-[11.5px] font-medium">Corte {numero} · pipeline</strong>
          {estagios.map((estagio) => (
            <span key={estagio.chave}>
              {estagio.estado === 'pronto' ? '✅' : estagio.estado === 'andamento' ? '◐' : '⬜'}{' '}
              {estagio.rotulo} — {estagio.detalhe}
            </span>
          ))}
        </span>
      }
      side="right"
    >
      <span className="flex items-center gap-1" role="img" aria-label={resumo}>
        {estagios.map((estagio) => (
          <EstagioSlot key={estagio.chave} estagio={estagio} />
        ))}
      </span>
    </Tooltip>
  );
}

function EstagioSlot({ estagio }: { estagio: EstagioView }) {
  const { Icon, estado, cor } = estagio;
  const pronto = estado === 'pronto';
  const andamento = estado === 'andamento';

  return (
    <span
      aria-hidden
      className={cn(
        'flex h-[20px] w-[20px] items-center justify-center rounded-[6px] transition-colors',
        pronto && 'shadow-sm',
        !pronto && !andamento && 'opacity-45',
      )}
      style={{
        background: pronto ? cor : andamento ? 'transparent' : 'var(--wb-bg-inset)',
        // "Em andamento" = contorno na cor do estágio (forma diferente do
        // preenchido), sem depender do ring do Tailwind com cor dinâmica.
        boxShadow: andamento ? `inset 0 0 0 1.5px ${cor}` : undefined,
      }}
    >
      <Icon
        size={12}
        strokeWidth={2.4}
        color={pronto ? '#ffffff' : andamento ? cor : 'var(--wb-text-dim)'}
        aria-hidden
      />
    </span>
  );
}
