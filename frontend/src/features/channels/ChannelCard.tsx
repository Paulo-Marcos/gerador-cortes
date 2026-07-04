// D-154: card "burro" de um canal na lista. Destaca o canal ativo e expõe as
// ações (selecionar / editar) via callbacks — sem I/O próprio.
// D-169: o bloco de conexão do YouTube aparece só no canal ATIVO (o token é
// gravado na pasta do canal ativo); estado e callbacks vêm por props.
import { CheckCircle2, Loader2, Pencil, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Canal, YoutubeAuthStatus } from '@/lib/channelsApi';

interface ChannelCardProps {
  canal: Canal;
  selecionando: boolean;
  onSelecionar: () => void;
  onEditar: () => void;
  /** Status do YouTube — passado apenas para o canal ativo (senão omitido). */
  youtube?: YoutubeAuthStatus;
  youtubeBusy?: boolean;
  onConectarYoutube?: () => void;
  onDesconectarYoutube?: () => void;
}

export function ChannelCard({
  canal,
  selecionando,
  onSelecionar,
  onEditar,
  youtube,
  youtubeBusy = false,
  onConectarYoutube,
  onDesconectarYoutube,
}: ChannelCardProps) {
  return (
    <li
      className={`grid gap-3 rounded-[var(--radius)] border p-4 ${
        canal.ativo
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
          : 'border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-[var(--wb-text)]">
              {canal.nome || canal.id}
            </h3>
            {canal.ativo && (
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--wb-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                <CheckCircle2 size={11} aria-hidden />
                Ativo
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-[var(--wb-text-mute)]">
            {canal.handle || '—'}
            <span className="mx-1.5 text-[var(--wb-text-dim)]">·</span>
            <code className="text-xs text-[var(--wb-text-dim)]">{canal.id}</code>
          </p>
          {canal.youtube_channel_id && (
            <p className="mt-0.5 truncate text-xs text-[var(--wb-text-dim)]">
              Canal-fonte: {canal.youtube_channel_id}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEditar}>
            <Pencil aria-hidden />
            Editar
          </Button>
          <Button
            type="button"
            size="sm"
            variant={canal.ativo ? 'ghost' : 'default'}
            onClick={onSelecionar}
            disabled={canal.ativo || selecionando}
          >
            {selecionando && <Loader2 className="animate-spin" aria-hidden />}
            {canal.ativo ? 'Selecionado' : 'Selecionar'}
          </Button>
        </div>
      </div>

      {(canal.paleta.primaria || canal.paleta.secundaria || canal.paleta.acento) && (
        <div className="flex items-center gap-1.5" aria-hidden>
          {[canal.paleta.primaria, canal.paleta.secundaria, canal.paleta.acento]
            .filter(Boolean)
            .map((cor, i) => (
              <span
                key={`${cor}-${i}`}
                className="h-4 w-4 rounded-full border border-[var(--wb-border)]"
                style={{ backgroundColor: cor }}
                title={cor}
              />
            ))}
        </div>
      )}

      {canal.ativo && youtube && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--wb-border-soft)] pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <Youtube
              size={16}
              aria-hidden
              className={youtube.conectado ? 'text-[var(--wb-err)]' : 'text-[var(--wb-text-dim)]'}
            />
            {youtube.fluxo_em_andamento ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-[var(--wb-text-mute)]">
                <Loader2 size={13} className="animate-spin" aria-hidden />
                Aguardando login no navegador…
              </span>
            ) : youtube.conectado ? (
              <span className="truncate text-sm text-[var(--wb-text)]">
                YouTube conectado
                {youtube.canal_titulo && (
                  <span className="text-[var(--wb-text-mute)]"> · {youtube.canal_titulo}</span>
                )}
              </span>
            ) : (
              <span className="text-sm text-[var(--wb-text-mute)]">YouTube desconectado</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {youtube.conectado ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDesconectarYoutube}
                disabled={youtubeBusy || youtube.fluxo_em_andamento}
              >
                Desconectar
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={onConectarYoutube}
                disabled={youtubeBusy || youtube.fluxo_em_andamento || !youtube.cliente_configurado}
                title={
                  youtube.cliente_configurado
                    ? undefined
                    : 'Falta o client_secrets.json na raiz do backend (crachá do app)'
                }
              >
                {(youtubeBusy || youtube.fluxo_em_andamento) && (
                  <Loader2 className="animate-spin" aria-hidden />
                )}
                Conectar YouTube
              </Button>
            )}
          </div>
        </div>
      )}

      {canal.ativo && youtube && !youtube.cliente_configurado && (
        <p className="text-xs text-[var(--wb-text-dim)]">
          Falta o <code>client_secrets.json</code> (crachá do app OAuth) na raiz do backend.
        </p>
      )}

      {canal.ativo && youtube?.erro && !youtube.fluxo_em_andamento && (
        <p className="text-xs text-[var(--wb-err)]">Erro no login: {youtube.erro}</p>
      )}
    </li>
  );
}
