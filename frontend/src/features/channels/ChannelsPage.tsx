// D-154: página de gerenciamento de canais (épico Multi-canal — Opção X). Lista
// os canais destacando o ativo, permite criar, selecionar (com aviso de restart
// quando a API sinaliza) e editar a identidade básica. Container: orquestra o
// I/O (hooks em useChannels) e delega a renderização aos componentes burros.
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, Plus, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import type { Canal, IdentidadeCanal } from '@/lib/channelsApi';
import { AppSettingsControls } from '@/features/settings/AppSettingsControls';
import { ChannelCard } from './ChannelCard';
import { ChannelForm, type ChannelFormValues } from './ChannelForm';
import {
  useCanais,
  useConectarYoutube,
  useCriarCanal,
  useDesconectarYoutube,
  useEditarCanal,
  useSelecionarCanal,
  useYoutubeAuthStatus,
} from './useChannels';

type Dialogo = { tipo: 'criar' } | { tipo: 'editar'; canal: Canal } | null;

function mensagemErro(erro: unknown, fallback: string): string {
  return erro instanceof Error ? erro.message : fallback;
}

/** Converte os campos do form em payload de identidade (sem o `id`). */
function paraIdentidade(values: ChannelFormValues): IdentidadeCanal {
  return {
    handle: values.handle,
    nome: values.nome,
    credito: values.credito,
    youtube_channel_id: values.youtube_channel_id,
    paleta: values.paleta,
  };
}

export function ChannelsPage() {
  const { notify } = useToast();
  const canaisQuery = useCanais();
  const criar = useCriarCanal();
  const editar = useEditarCanal();
  const selecionar = useSelecionarCanal();
  const youtubeStatus = useYoutubeAuthStatus();
  const conectarYoutube = useConectarYoutube();
  const desconectarYoutube = useDesconectarYoutube();

  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [selecionandoId, setSelecionandoId] = useState<string | null>(null);

  const fecharDialogo = () => setDialogo(null);

  const aoConectarYoutube = () => {
    conectarYoutube.mutate(undefined, {
      onSuccess: (res) =>
        notify(res.mensagem, { tone: 'info', title: 'Login do YouTube' }),
      onError: (erro) =>
        notify(mensagemErro(erro, 'Erro ao iniciar login do YouTube.'), { tone: 'error' }),
    });
  };

  const aoDesconectarYoutube = () => {
    desconectarYoutube.mutate(undefined, {
      onSuccess: () => notify('YouTube desconectado.', { tone: 'success' }),
      onError: (erro) =>
        notify(mensagemErro(erro, 'Erro ao desconectar o YouTube.'), { tone: 'error' }),
    });
  };

  const aoSelecionar = (canal: Canal) => {
    setSelecionandoId(canal.id);
    selecionar.mutate(canal.id, {
      onSuccess: (res) => {
        if (res.requer_restart) {
          notify(
            `Canal “${canal.nome || canal.id}” selecionado. Reinicie o backend para aplicar a troca.`,
            { tone: 'warning', title: 'Requer restart' },
          );
        } else {
          notify(`Canal “${canal.nome || canal.id}” ativado.`, { tone: 'success' });
        }
      },
      onError: (erro) =>
        notify(mensagemErro(erro, 'Erro ao selecionar canal.'), { tone: 'error' }),
      onSettled: () => setSelecionandoId(null),
    });
  };

  const aoCriar = (values: ChannelFormValues) => {
    criar.mutate(
      { id: values.id, ...paraIdentidade(values) },
      {
        onSuccess: () => {
          notify('Canal criado.', { tone: 'success' });
          fecharDialogo();
        },
        onError: (erro) => notify(mensagemErro(erro, 'Erro ao criar canal.'), { tone: 'error' }),
      },
    );
  };

  const aoEditar = (canal: Canal, values: ChannelFormValues) => {
    editar.mutate(
      { id: canal.id, identidade: paraIdentidade(values) },
      {
        onSuccess: () => {
          notify('Identidade atualizada.', { tone: 'success' });
          fecharDialogo();
        },
        onError: (erro) => notify(mensagemErro(erro, 'Erro ao editar canal.'), { tone: 'error' }),
      },
    );
  };

  const canais = canaisQuery.data?.canais ?? [];

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]">
      <header className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] px-7 py-5">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]">
            <Radio size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <Link
              to="/projetos"
              className="mb-1.5 inline-flex items-center gap-1.5 text-sm text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
            >
              <ArrowLeft size={14} aria-hidden />
              Voltar
            </Link>
            <h1 className="font-editorial text-[48px] font-medium leading-[0.96] tracking-[-0.01em] text-[var(--wb-text)]">
              Configurações
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] text-[var(--wb-text-mute)]">
              Todas as configurações do app num só lugar: as <strong>globais</strong> (processamento,
              logs, render) e as de <strong>cada canal</strong> (identidade). Tudo é editável aqui e
              persiste no banco. A troca de canal ativo só efetiva após reiniciar o backend.
            </p>
          </div>
          <Button type="button" onClick={() => setDialogo({ tipo: 'criar' })}>
            <Plus aria-hidden />
            Novo canal
          </Button>
        </div>
      </header>

      <main className="grid flex-1 content-start gap-5 overflow-auto p-6">
        <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
          <h2 className="text-lg font-semibold text-[var(--wb-text)]">Configurações globais</h2>
          <p className="text-sm text-[var(--wb-text-mute)]">
            Preferências de processamento aplicadas às renderizações do canal ativo.
          </p>
          <AppSettingsControls />
        </section>

        <div className="mt-2">
          <h2 className="text-lg font-semibold text-[var(--wb-text)]">Canais</h2>
          <p className="text-sm text-[var(--wb-text-mute)]">
            Identidade de cada canal (nome, handle, crédito, canal-fonte das lives e paleta).
          </p>
        </div>

        {canaisQuery.isLoading && (
          <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text-mute)]">
            <Loader2 className="animate-spin" size={16} aria-hidden />
            Carregando canais…
          </p>
        )}

        {canaisQuery.isError && (
          <div className="grid gap-3 rounded-[var(--radius)] border border-error/30 bg-[color-mix(in_oklch,var(--error)_10%,var(--wb-bg-card))] p-5">
            <p className="flex items-center gap-2 text-[15px] text-[var(--wb-text)]">
              <AlertTriangle size={16} aria-hidden className="text-error" />
              {mensagemErro(canaisQuery.error, 'Não foi possível carregar os canais.')}
            </p>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => canaisQuery.refetch()}>
                Tentar de novo
              </Button>
            </div>
          </div>
        )}

        {canaisQuery.isSuccess && canais.length === 0 && (
          <div className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-6 text-center">
            <p className="text-[15px] text-[var(--wb-text-mute)]">
              Nenhum canal cadastrado ainda. Crie o primeiro para começar.
            </p>
            <div className="flex justify-center">
              <Button type="button" onClick={() => setDialogo({ tipo: 'criar' })}>
                <Plus aria-hidden />
                Criar primeiro canal
              </Button>
            </div>
          </div>
        )}

        {canais.length > 0 && (
          <ul className="grid gap-3">
            {canais.map((canal) => (
              <ChannelCard
                key={canal.id}
                canal={canal}
                selecionando={selecionandoId === canal.id}
                onSelecionar={() => aoSelecionar(canal)}
                onEditar={() => setDialogo({ tipo: 'editar', canal })}
                youtube={canal.ativo ? youtubeStatus.data : undefined}
                youtubeBusy={conectarYoutube.isPending || desconectarYoutube.isPending}
                onConectarYoutube={aoConectarYoutube}
                onDesconectarYoutube={aoDesconectarYoutube}
              />
            ))}
          </ul>
        )}
      </main>

      <Modal
        open={dialogo?.tipo === 'criar'}
        onClose={fecharDialogo}
        title="Novo canal"
        description="Crie um canal a partir do template. O id (slug) vira a pasta e não muda depois."
      >
        <ChannelForm mode="criar" pending={criar.isPending} onSubmit={aoCriar} onCancel={fecharDialogo} />
      </Modal>

      <Modal
        open={dialogo?.tipo === 'editar'}
        onClose={fecharDialogo}
        title="Editar identidade"
        description={dialogo?.tipo === 'editar' ? dialogo.canal.id : undefined}
      >
        {dialogo?.tipo === 'editar' && (
          <ChannelForm
            mode="editar"
            initial={dialogo.canal}
            pending={editar.isPending}
            onSubmit={(values) => aoEditar(dialogo.canal, values)}
            onCancel={fecharDialogo}
          />
        )}
      </Modal>
    </div>
  );
}
