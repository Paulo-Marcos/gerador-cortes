import {
  Check,
  Clapperboard,
  Crop,
  Eye,
  MoveHorizontal,
  Play,
  Undo2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OverflowMenu } from '@/components/ui/overflow-menu';
import { StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/utils';
import { APARENCIA, notaVisivel, planoDeAcoes, tomDaNota, type AcaoId } from './estadoDoCandidato';
import { LinhaDeAjuste } from './LinhaDeAjuste';
import { PainelPublicacao } from './PainelPublicacao';
import { ProgressoRenderPanel } from './ProgressoRenderPanel';
import { shortVideoUrl, type ShortSugerido, type StatusShort } from './shortsApi';
import { useProgressoRender } from './useShortsDoCorte';

// D-492: o card de um candidato, reorganizado.
//
// Antes: oito botões de peso visual idêntico, todos disponíveis o tempo todo,
// num `BotaoAcao` caseiro que ignorava o kit do projeto. O resultado é o que o
// operador descreveu — "um monte de botão sem organização".
//
// Agora a leitura desce em quatro degraus, e cada um responde uma pergunta:
//
//   IDENTIDADE  o que é este trecho, e quanto vale       (nota, título, gancho)
//   DECISÃO     em que pé está                           (chip de status)
//   AJUSTE      como ele vai ficar                       (recolhido)
//   PRODUÇÃO    o que fazer agora                        (UMA ação em destaque)
//
// O ajuste nasce recolhido de propósito: enquadramento e arranjo são refinos, e
// refino que fica aberto em cinco cards ao mesmo tempo vira parede de controle.

interface Props {
  short: ShortSugerido;
  corteId: string;
  emFoco: boolean;
  /** D-495: o corte tem regiao de palco? Sem ela o arranjo nao muda nada. */
  temRegiao: boolean;
  ocupado: boolean;
  aberto: boolean;
  onAlternarAjuste: () => void;
  onSelecionar: () => void;
  onTocar: () => void;
  onStatus: (status: StatusShort) => void;
  onBorda: (campo: 'inicio_seg' | 'fim_seg') => void;
  onFoco: (delta: number) => void;
  onEnquadrarPeloRosto: () => void;
  enquadrando: boolean;
  vereditoDoRosto: string;
  onModelo: (modeloId: string) => void;
  onPreset: (presetId: string) => void;
  onMoldura: (moldura: string) => void;
  onPrevia: () => void;
  onRenderizar: () => void;
}

function mmss(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function CandidatoCard({
  short,
  corteId,
  emFoco,
  temRegiao,
  ocupado,
  aberto,
  onAlternarAjuste,
  onSelecionar,
  onTocar,
  onStatus,
  onBorda,
  onFoco,
  onEnquadrarPeloRosto,
  enquadrando,
  vereditoDoRosto,
  onModelo,
  onPreset,
  onMoldura,
  onPrevia,
  onRenderizar,
}: Props) {
  // O hook mora AQUI, e nao no pai: e um por candidato, e um laco no pai nao
  // pode chamar hooks. Consulta uma vez ao montar e so entra em polling se
  // achar algo rodando.
  const progresso = useProgressoRender(
    short.id,
    corteId,
    short.status === 'aprovado' || short.status === 'renderizado',
  );
  const renderizando = progresso !== null && !progresso.concluido;
  const plano = planoDeAcoes(short, renderizando);
  const aparencia = APARENCIA[short.status];

  const acoes: Record<AcaoId, { rotulo: string; icone: React.ReactNode; ao: () => void }> = {
    aprovar: { rotulo: 'Aprovar', icone: <Check />, ao: () => onStatus('aprovado') },
    rejeitar: { rotulo: 'Rejeitar', icone: <X />, ao: () => onStatus('rejeitado') },
    voltar: { rotulo: 'Voltar para sugerido', icone: <Undo2 />, ao: () => onStatus('sugerido') },
    previa: { rotulo: 'Gerar prévia', icone: <Eye />, ao: onPrevia },
    refazerPrevia: { rotulo: 'Refazer prévia', icone: <Eye />, ao: onPrevia },
    finalizar: { rotulo: 'Finalizar', icone: <Clapperboard />, ao: onRenderizar },
    refazerFinal: { rotulo: 'Refazer o final', icone: <Clapperboard />, ao: onRenderizar },
  };

  // D-495: rejeitado COLAPSA. Ele ja foi decidido — manter o card inteiro
  // ocupando a coluna faz o operador rolar por cima do que descartou para
  // chegar no que interessa. Uma linha basta para lembrar que existe e permitir
  // voltar atras.
  if (short.status === 'rejeitado') {
    return (
      <article
        onClick={onSelecionar}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-1.5 opacity-70 transition-opacity hover:opacity-100',
          emFoco ? 'border-[var(--wb-accent)]' : 'border-[var(--wb-border)]',
          'bg-[var(--wb-bg-inset)]',
        )}
      >
        <span className="font-code text-[11px] tabular-nums text-[var(--wb-text-mute)]">
          {notaVisivel(short)}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[12px] text-[var(--wb-text-dim)] line-through"
          title={short.titulo}
        >
          {short.titulo}
        </span>
        <span className="flex-none font-code text-[10px] tabular-nums text-[var(--wb-text-mute)]">
          {mmss(short.inicio_seg)} · {Math.round(short.duracao_seg)}s
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={ocupado}
          onClick={(e) => {
            e.stopPropagation();
            onStatus('sugerido');
          }}
        >
          <Undo2 />
          Voltar
        </Button>
      </article>
    );
  }

  return (
    <article
      onClick={onSelecionar}
      onFocusCapture={onSelecionar}
      className={cn(
        'cursor-pointer rounded-[12px] border bg-[var(--wb-bg-card)] transition-shadow',
        emFoco
          ? 'border-[var(--wb-accent)] shadow-[var(--wb-shadow)]'
          : 'border-[var(--wb-border)] hover:border-[var(--wb-text-dim)]',
      )}
    >
      {/* ── Identidade ─────────────────────────────────────────────── */}
      <header className="flex items-start gap-2.5 p-3 pb-2">
        <span
          title={short.origem === 'manual' ? 'Trecho seu — sem nota da IA' : 'Nota da IA'}
          className={cn(
            'grid h-9 w-9 flex-none place-items-center rounded-[9px] font-code text-[14px] font-bold tabular-nums',
            tomDaNota(short) === 'success' && 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok-ink)]',
            tomDaNota(short) === 'accent' && 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent-strong)]',
            tomDaNota(short) === 'neutral' && 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)]',
          )}
        >
          {notaVisivel(short)}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13.5px] font-bold leading-tight" title={short.titulo}>
            {short.titulo}
          </h3>
          {short.gancho && (
            <p className="mt-0.5 line-clamp-2 text-[12px] italic leading-snug text-[var(--wb-text-dim)]">
              “{short.gancho}”
            </p>
          )}
        </div>

        <div className="flex flex-none flex-col items-end gap-1">
          <StatusChip label={aparencia.rotulo} tone={aparencia.tom} />
          {short.origem === 'manual' && (
            <span
              className="font-code text-[9.5px] uppercase tracking-wide text-[var(--wb-text-mute)]"
              title="Marcado por você — a regeração não apaga"
            >
              seu
            </span>
          )}
        </div>
      </header>

      {/* ── Números que decidem, numa linha só ─────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 font-code text-[11.5px] tabular-nums text-[var(--wb-text-mute)]">
        <span className="font-semibold text-[var(--wb-text-dim)]">
          {mmss(short.inicio_seg)} → {mmss(short.fim_seg)}
        </span>
        <span>{Math.round(short.duracao_seg)}s</span>
        <span className="inline-flex items-center gap-1" title="Centro da janela 9:16">
          <Crop size={11} aria-hidden />
          {Math.round(short.foco_efetivo * 100)}%
          {short.foco_x !== null && <span className="text-[var(--wb-accent)]">·ajustado</span>}
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onAlternarAjuste();
          }}
        >
          <MoveHorizontal />
          {aberto ? 'ocultar ajustes' : 'ajustar'}
        </Button>
      </div>

      {short.justificativa && !aberto && (
        <p className="px-3 pb-2 text-[12px] leading-relaxed text-[var(--wb-text-mute)]">
          {short.justificativa}
        </p>
      )}

      {/* ── Ajuste: recolhido, porque é refino ─────────────────────── */}
      {aberto && (
        <LinhaDeAjuste
          short={short}
          corteId={corteId}
          temRegiao={temRegiao}
          ocupado={ocupado}
          onBorda={onBorda}
          onFoco={onFoco}
          onEnquadrarPeloRosto={onEnquadrarPeloRosto}
          enquadrando={enquadrando}
          vereditoDoRosto={vereditoDoRosto}
          onModelo={onModelo}
          onPreset={onPreset}
          onMoldura={onMoldura}
          onTocar={onTocar}
        />
      )}

      {/* ── Produção: uma ação em destaque ─────────────────────────── */}
      <footer className="flex flex-wrap items-center gap-1.5 border-t border-[var(--wb-border-soft)] p-3">
        <Button
          variant="outline"
          size="sm"
          disabled={ocupado}
          onClick={(e) => {
            e.stopPropagation();
            onTocar();
          }}
        >
          <Play />
          Assistir
        </Button>

        <div className="flex-1" />

        {plano.secundarias.map((id) => (
          <Button
            key={id}
            variant="secondary"
            size="sm"
            disabled={ocupado}
            onClick={(e) => {
              e.stopPropagation();
              acoes[id].ao();
            }}
          >
            {acoes[id].icone}
            {acoes[id].rotulo}
          </Button>
        ))}

        {plano.principal && (
          <Button
            size="sm"
            disabled={ocupado}
            onClick={(e) => {
              e.stopPropagation();
              acoes[plano.principal as AcaoId].ao();
            }}
          >
            {acoes[plano.principal].icone}
            {acoes[plano.principal].rotulo}
          </Button>
        )}

        {plano.noMenu.length > 0 && (
          <OverflowMenu
            label="Mais ações deste candidato"
            align="right"
            compact
            items={plano.noMenu.map((id) => ({
              label: acoes[id].rotulo,
              onClick: acoes[id].ao,
              danger: id === 'rejeitar',
            }))}
          />
        )}
      </footer>

      {progresso && <ProgressoRenderPanel progresso={progresso} />}

      {short.arquivo_previa_path && short.status !== 'renderizado' && !renderizando && (
        <PlayerDoArquivo
          titulo="prévia · sem filtro"
          src={shortVideoUrl(short.id, 'previa')}
          nota="O filtro entra só no finalizar, junto com o recorte — se viesse depois, mexeria na cor da legenda."
        />
      )}

      {short.status === 'renderizado' && (
        <PlayerDoArquivo
          titulo="final · pronto para publicar"
          src={shortVideoUrl(short.id, 'final')}
        />
      )}

      {short.status === 'renderizado' && <PainelPublicacao shortId={short.id} />}
    </article>
  );
}

/** O MP4 do short, no formato em que ele vai sair. */
function PlayerDoArquivo({
  titulo,
  src,
  nota,
}: {
  titulo: string;
  src: string;
  nota?: string;
}) {
  return (
    <div className="border-t border-[var(--wb-border-soft)] p-3">
      <p className="mb-1.5 font-code text-[10.5px] uppercase tracking-wide text-[var(--wb-text-mute)]">
        {titulo}
      </p>
      <video
        src={src}
        controls
        preload="metadata"
        className="mx-auto max-h-[300px] w-auto rounded-[9px] bg-black"
      />
      {nota && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--wb-text-mute)]">{nota}</p>
      )}
    </div>
  );
}
