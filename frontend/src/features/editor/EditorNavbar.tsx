import {
  ArrowLeft,
  FolderOpen,
  Keyboard,
  Loader2,
  RefreshCcw,
  Save,
  Scissors,
  Tags,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Corte, Projeto } from '@/types/models';

interface Props {
  projeto?: Projeto;
  corte: Corte;
  fase: 1 | 2;
  brutoPronto: boolean;
  podeRender: boolean;
  isDirty: boolean;
  onSalvar: () => void;
  onAprovar: () => void;
  onRejeitar: () => void;
  onToggleFire: () => void;
  onToggleLeitura: () => void;
  onAtualizarPosProducao: () => void;
  onAbrirPasta: () => void;
  onRenderFinal: () => void;
  onToggleFase: () => void;
  onAbrirAtalhos: () => void;
  onAbrirMetadados: () => void;
  onGerarBruto: () => void;
  brutoStatus: 'idle' | 'processando' | 'concluido' | 'erro';
  modoVideo?: 'bruto' | 'final';
  finalDisponivel?: boolean;
  onToggleModoVideo?: () => void;
  pendingFlags: {
    salvando?: boolean;
    aprovando?: boolean;
    rejeitando?: boolean;
    fire?: boolean;
    leitura?: boolean;
    posProducao?: boolean;
    abrindoPasta?: boolean;
    renderizando?: boolean;
    gerandoBruto?: boolean;
  };
}

export function EditorNavbar({
  projeto,
  corte,
  fase,
  brutoPronto,
  podeRender,
  isDirty,
  onSalvar,
  onAprovar,
  onRejeitar,
  onToggleFire,
  onToggleLeitura,
  onAtualizarPosProducao,
  onAbrirPasta,
  onRenderFinal,
  onToggleFase,
  onAbrirAtalhos,
  onAbrirMetadados,
  onGerarBruto,
  brutoStatus,
  modoVideo,
  finalDisponivel,
  onToggleModoVideo,
  pendingFlags,
}: Props) {
  const aprovado = ['aprovado', 'editado', 'processado'].includes(corte.status);
  const rejeitado = corte.status === 'rejeitado';

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-bg-950/80 px-4 py-2.5 backdrop-blur-md">
      {/* Esquerda: breadcrumb + título + chips */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          to={`/projetos/${corte.projeto_id}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-400 hover:bg-bg-800 hover:text-text-200"
        >
          <ArrowLeft size={14} /> Estúdio
        </Link>

        <div className="flex min-w-0 flex-col">
          <h1
            className="line-clamp-1 text-sm font-semibold text-text-100"
            title={projeto?.titulo_live}
          >
            <span className="mr-2 font-mono text-text-400">#{corte.numero}</span>
            {corte.titulo_proposto || projeto?.titulo_live || 'Corte'}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            {aprovado && <Badge variant="success">✅ Aprovado</Badge>}
            {rejeitado && <Badge variant="error">❌ Rejeitado</Badge>}
            {!aprovado && !rejeitado && <Badge variant="warning">⏳ {corte.status}</Badge>}
            {corte.is_fire && <Badge variant="warning">🔥 Fire</Badge>}
            {corte.is_leitura && <Badge variant="info">📖 Leitura</Badge>}
            {fase === 2 && <Badge variant="accent">🎬 Pós-produção</Badge>}
            {isDirty && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-warning">
                · não salvo
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Direita: ações */}
      <div className="flex flex-wrap items-center gap-1">
        {/* Avaliação */}
        <Tooltip label="Aprovar (A)" side="bottom">
          <Button
            variant={aprovado ? 'default' : 'ghost'}
            size="icon"
            onClick={onAprovar}
            disabled={pendingFlags.aprovando}
            aria-label="Aprovar corte"
            className={cn(aprovado && 'bg-emerald-600 hover:bg-emerald-500')}
          >
            <span aria-hidden>✅</span>
          </Button>
        </Tooltip>
        <Tooltip label="Rejeitar (R)" side="bottom">
          <Button
            variant={rejeitado ? 'default' : 'ghost'}
            size="icon"
            onClick={onRejeitar}
            disabled={pendingFlags.rejeitando}
            aria-label="Rejeitar corte"
            className={cn(rejeitado && 'bg-error hover:bg-error/80')}
          >
            <span aria-hidden>❌</span>
          </Button>
        </Tooltip>
        <Tooltip label="Fire (F)" side="bottom">
          <Button
            variant={corte.is_fire ? 'default' : 'ghost'}
            size="icon"
            onClick={onToggleFire}
            disabled={pendingFlags.fire}
            aria-label="Marcar fire"
            className={cn(corte.is_fire && 'bg-orange-500 hover:bg-orange-400')}
          >
            <span aria-hidden>🔥</span>
          </Button>
        </Tooltip>
        <Tooltip label="Leitura (L)" side="bottom">
          <Button
            variant={corte.is_leitura ? 'default' : 'ghost'}
            size="icon"
            onClick={onToggleLeitura}
            disabled={pendingFlags.leitura}
            aria-label="Marcar leitura"
            className={cn(corte.is_leitura && 'bg-cyan-600 hover:bg-cyan-500')}
          >
            <span aria-hidden>📖</span>
          </Button>
        </Tooltip>

        <span className="mx-1 h-6 w-px bg-[var(--border)]" aria-hidden />

        {/* Gerar bruto (sempre visível) */}
        <Tooltip
          label={brutoPronto ? 'Regerar vídeo bruto (Ctrl+G)' : 'Gerar vídeo bruto (Ctrl+G)'}
          side="bottom"
        >
          <Button
            variant={brutoPronto ? 'outline' : 'default'}
            size="sm"
            onClick={onGerarBruto}
            disabled={brutoStatus === 'processando' || pendingFlags.gerandoBruto}
          >
            {brutoStatus === 'processando' || pendingFlags.gerandoBruto ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Scissors size={14} />
            )}
            {brutoPronto ? 'Regerar bruto' : 'Gerar bruto'}
          </Button>
        </Tooltip>

        {/* Toggle de fase (só após bruto pronto) */}
        {brutoPronto && (
          <Tooltip
            label={fase === 1 ? 'Ir pra pós-produção' : 'Voltar pra edição (Fase 1)'}
            side="bottom"
          >
            <Button variant="outline" size="sm" onClick={onToggleFase}>
              {fase === 1 ? '🎬 Pós-produção' : '✂️ Edição'}
            </Button>
          </Tooltip>
        )}

        {/* Toggle modo do vídeo (Fase 2) */}
        {fase === 2 && onToggleModoVideo && (
          <Tooltip
            label={
              !finalDisponivel
                ? 'Render final ainda não foi gerado'
                : modoVideo === 'bruto'
                  ? 'Trocar pro vídeo final renderizado'
                  : 'Trocar pro bruto'
            }
            side="bottom"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleModoVideo}
              disabled={!finalDisponivel}
              aria-pressed={modoVideo === 'final'}
            >
              {modoVideo === 'final' ? '🎞️ Final' : '✂️ Bruto'}
            </Button>
          </Tooltip>
        )}

        {aprovado && (
          <Tooltip label="Adicionar metadados" side="bottom">
            <Button variant="outline" size="icon" onClick={onAbrirMetadados} aria-label="Metadados">
              <Tags size={16} />
            </Button>
          </Tooltip>
        )}

        <Tooltip label="Atualizar pós-produção (Ctrl+R)" side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={onAtualizarPosProducao}
            disabled={pendingFlags.posProducao}
            aria-label="Atualizar pós-produção"
          >
            {pendingFlags.posProducao ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCcw size={16} />
            )}
          </Button>
        </Tooltip>

        <Tooltip label="Abrir pasta (Ctrl+O)" side="bottom">
          <Button
            variant="ghost"
            size="icon"
            onClick={onAbrirPasta}
            disabled={pendingFlags.abrindoPasta}
            aria-label="Abrir pasta"
          >
            <FolderOpen size={16} />
          </Button>
        </Tooltip>

        {podeRender && (
          <Tooltip label="Render final (Ctrl+Enter)" side="bottom">
            <Button
              variant="default"
              size="sm"
              onClick={onRenderFinal}
              disabled={pendingFlags.renderizando}
            >
              {pendingFlags.renderizando ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <span aria-hidden>▶️</span>
              )}
              Render final
            </Button>
          </Tooltip>
        )}

        <Tooltip label="Salvar (Ctrl+S)" side="bottom">
          <Button
            variant={isDirty ? 'default' : 'ghost'}
            size="icon"
            onClick={onSalvar}
            disabled={pendingFlags.salvando || !isDirty}
            aria-label="Salvar"
          >
            {pendingFlags.salvando ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
          </Button>
        </Tooltip>

        <Tooltip label="Atalhos (?)" side="bottom">
          <Button variant="ghost" size="icon" onClick={onAbrirAtalhos} aria-label="Atalhos">
            <Keyboard size={16} />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
