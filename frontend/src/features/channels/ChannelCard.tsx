// D-154: card "burro" de um canal na lista. Destaca o canal ativo e expõe as
// ações (selecionar / editar) via callbacks — sem I/O próprio.
// D-1172 (E-069 H-21; DIRECAO §7.7): o cartão de IDENTIDADE da Sala escura. O canal ativo leva o
// fio de luz (`cc-fio`, lugar marcado do §3.1) e o avatar no anel da luz do canal; os outros
// canais são cartões de vidro sem fio. Nenhum botão aqui é primário: Configurações não tem (§5).
// D-169: o bloco de conexão do YouTube aparece só no canal ATIVO (o token é
// gravado na pasta do canal ativo); estado e callbacks vêm por props.
import { AvatarDoCanal } from '@/components/ui/avatar-do-canal';
import { Button } from '@/components/ui/button';
import { Selo } from '@/components/ui/selo';
import { luzDoCanalDe } from '@/lib/luzDoCanal';
import { cn } from '@/lib/utils';
import { useUpgradeTheme } from '@/lib/tema';
import type { Canal, YoutubeAuthStatus } from '@/features/channels/api/canais';
import { ConectarYoutubeTutorial } from './ConectarYoutubeTutorial';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';

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
  onChecarYoutube?: () => void;
}

/** A conexão do YouTube do canal ativo: o estado, e conectar ou desconectar. */
function LinhaDoYoutube({
  youtube,
  busy,
  onConectar,
  onDesconectar,
}: {
  youtube: YoutubeAuthStatus;
  busy: boolean;
  onConectar?: () => void;
  onDesconectar?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-fio pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon name="youtube" size={16} className={youtube.conectado ? 'text-erro' : 'text-fg-3'} />
        {youtube.fluxo_em_andamento ? (
          <span className="inline-flex items-center gap-1.5 text-corpo text-fg-2">
            <Icon name="loader-2" className="animate-spin" />
            Aguardando login no navegador…
          </span>
        ) : youtube.conectado ? (
          <span className="truncate text-corpo text-fg">
            YouTube conectado
            {youtube.canal_titulo && <span className="text-fg-2"> · {youtube.canal_titulo}</span>}
          </span>
        ) : (
          <span className="text-corpo text-fg-2">YouTube desconectado</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {youtube.conectado ? (
          <Button
            type="button"
            variant="secundario"
            size="pq"
            onClick={onDesconectar}
            disabled={busy || youtube.fluxo_em_andamento}
          >
            Desconectar
          </Button>
        ) : (
          <Button
            type="button"
            variant="secundario"
            size="pq"
            onClick={onConectar}
            disabled={busy || youtube.fluxo_em_andamento || !youtube.cliente_configurado}
            title={
              youtube.cliente_configurado
                ? undefined
                : 'Falta o client_secrets.json: veja "Como conectar o YouTube" abaixo'
            }
          >
            {(busy || youtube.fluxo_em_andamento) && (
              <Icon name="loader-2" className="animate-spin" />
            )}
            Conectar YouTube
          </Button>
        )}
      </div>
    </div>
  );
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
  onChecarYoutube = () => {},
}: ChannelCardProps) {
  const { theme } = useUpgradeTheme();
  const luz = luzDoCanalDe(canal, theme === 'dark' ? 'escuro' : 'claro');
  const nome = canal.nome || canal.id;
  return (
    <li
      data-sala=""
      data-fio-de-luz={canal.ativo ? '' : undefined}
      className={cn(
        'grid gap-4 rounded-painel border bg-vidro p-5 shadow-topo',
        // O fio de luz é lugar marcado (§3.1): só o cartão do canal ativo o leva.
        canal.ativo ? 'cc-fio' : 'border-fio',
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <AvatarDoCanal nome={nome} luz={luz} tamanho={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-secao text-fg">{nome}</h3>
            {canal.ativo && <Selo tom="ok">Canal ativo</Selo>}
          </div>
          <p className="mt-0.5 truncate text-corpo text-fg-2">
            {canal.handle || '—'}
            <span className="mx-1.5 text-fg-3">·</span>
            <code className="font-mono text-pequeno text-fg-3">{canal.id}</code>
          </p>
          {canal.youtube_channel_id && (
            <p className="mt-0.5 truncate text-pequeno text-fg-3">
              Canal-fonte: {canal.youtube_channel_id}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="secundario" size="pq" onClick={onEditar}>
            <Icon name={ICONE_DO_CONCEITO.editar} />
            Editar
          </Button>
          <Button
            type="button"
            size="pq"
            variant={canal.ativo ? 'fantasma' : 'secundario'}
            onClick={onSelecionar}
            disabled={canal.ativo || selecionando}
          >
            {selecionando && <Icon name="loader-2" className="animate-spin" />}
            {canal.ativo ? 'Selecionado' : 'Selecionar'}
          </Button>
        </div>
      </div>

      <p
        className="flex flex-wrap items-center gap-2 text-pequeno text-fg-3"
        data-luz-do-canal={luz ? 'canal' : 'neutra'}
      >
        <span aria-hidden className="inline-flex gap-1.5">
          {[canal.paleta.primaria, canal.paleta.secundaria, canal.paleta.acento]
            .filter(Boolean)
            .map((cor, i) => (
              <span
                key={`${cor}-${i}`}
                className="size-4 rounded-full border border-fio-2"
                style={{ backgroundColor: cor ?? undefined }}
                title={cor ?? undefined}
              />
            ))}
        </span>
        {canal.paleta.primaria || canal.paleta.secundaria || canal.paleta.acento
          ? 'A luz do canal vem da paleta de identidade.'
          : luz
            ? 'A luz do canal é amostrada das capas; a paleta de identidade está vazia.'
            : 'Sem luz ainda: a paleta de identidade está vazia e nenhuma capa foi amostrada.'}
        <Button type="button" variant="fantasma" size="pq" onClick={onEditar}>
          {canal.paleta.primaria || canal.paleta.secundaria || canal.paleta.acento
            ? 'Editar paleta'
            : 'Cadastrar paleta'}
        </Button>
      </p>

      {canal.ativo && youtube && (
        <LinhaDoYoutube
          youtube={youtube}
          busy={youtubeBusy}
          onConectar={onConectarYoutube}
          onDesconectar={onDesconectarYoutube}
        />
      )}

      {canal.ativo && youtube && !youtube.conectado && (
        <ConectarYoutubeTutorial
          destino={youtube.client_secrets_destino}
          abertoDeInicio={!youtube.cliente_configurado}
          onChecarDeNovo={onChecarYoutube}
        />
      )}

      {canal.ativo && youtube?.erro && !youtube.fluxo_em_andamento && (
        <p className="text-pequeno text-erro">Erro no login: {youtube.erro}</p>
      )}
    </li>
  );
}
