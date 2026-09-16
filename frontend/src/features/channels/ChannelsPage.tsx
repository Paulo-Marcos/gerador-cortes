// D-154 + D-394 (design Workbench 1c, validação 1): página de Configurações
// no formato do protótipo — abas "Canal ativo" e "Aplicação"; no canal, as
// áreas editoriais (skills/scaffolds/prompts/pesos) viram BLOCOS-portal que
// abrem cada seção; na aplicação, Aparência (tema+paleta) + settings globais.
// Container: orquestra o I/O (hooks em useChannels) e delega às seções.
import { useState } from 'react';
import { AlertTriangle, ChevronLeft, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import type { Canal, IdentidadeCanal } from '@/lib/channelsApi';
import { AppSettingsControls } from '@/features/settings/AppSettingsControls';
import { useTheme } from '@/hooks/useTheme';
import { PALETTES, usePalette } from '@/hooks/usePalette';
import { isWorkbenchEnabled } from '@/components/workbench/workbenchFlag';
import { ChannelCard } from './ChannelCard';
import { ChannelForm, type ChannelFormValues } from './ChannelForm';
import { ChannelThemeSection } from './ChannelThemeSection';
import { EditorialScaffoldsSection } from './EditorialScaffoldsSection';
import { EditorialSkillsSection } from './EditorialSkillsSection';
import { PromptsUtilitariosSection } from './PromptsUtilitariosSection';
import { RankingPesosSection } from './RankingPesosSection';
import { AparenciaDaCasca } from '@/upgrade/AparenciaDaCasca';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';
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
type Aba = 'canal' | 'aplicacao';
type SecaoCanal = null | 'skills' | 'scaffolds' | 'prompts' | 'pesos';

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

/** Bloco-portal do protótipo: card clicável que abre uma área editorial. */
function BlocoPortal({
  emoji,
  titulo,
  descricao,
  onClick,
}: {
  emoji: string;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-3.5 text-left shadow-[shadow:var(--wb-shadow)] transition-colors hover:border-[var(--wb-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
    >
      <div className="flex items-center gap-2">
        <span className="text-[16px]" aria-hidden>
          {emoji}
        </span>
        <span className="text-[12.5px] font-bold text-[var(--wb-text)]">{titulo}</span>
        <span className="ml-auto text-[var(--wb-text-dim)]" aria-hidden>
          →
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--wb-text-mute)]">{descricao}</p>
    </button>
  );
}

/** Aparência (design §Aplicação): tema claro/escuro + paleta de acento. */
function AparenciaSection() {
  const { theme, setTheme } = useTheme();
  const { palette, setPalette } = usePalette();

  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <h2 className="text-lg font-semibold text-[var(--wb-text)]">Aparência</h2>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-code text-[9px] font-extrabold tracking-[0.14em] text-[var(--wb-text-dim)]">
          TEMA
        </span>
        {(
          [
            { id: 'light', rotulo: '☀️ Claro' },
            { id: 'dark', rotulo: '🌙 Escuro' },
          ] as const
        ).map(({ id, rotulo }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            aria-pressed={theme === id}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-[11px] font-bold',
              theme === id
                ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                : 'border-[var(--wb-border)] bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-code text-[9px] font-extrabold tracking-[0.14em] text-[var(--wb-text-dim)]">
          PALETA DE ACENTO
        </span>
        {PALETTES.map((opcao) => (
          <button
            key={opcao.id}
            type="button"
            onClick={() => setPalette(opcao.id)}
            aria-pressed={palette === opcao.id}
            title={opcao.descricao}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-bold',
              palette === opcao.id
                ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-text)]'
                : 'border-[var(--wb-border)] bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
            )}
          >
            <span
              aria-hidden
              className="h-3.5 w-3.5 rounded-full"
              style={{ background: opcao.swatch }}
            />
            {opcao.nome}
          </button>
        ))}
      </div>
    </section>
  );
}

const SECOES_CANAL: Record<Exclude<SecaoCanal, null>, { titulo: string }> = {
  skills: { titulo: 'Skills editoriais' },
  scaffolds: { titulo: 'Scaffolds' },
  prompts: { titulo: 'Prompts utilitários' },
  pesos: { titulo: 'Pesos do ranking' },
};

const CASCA_NOVA = isUpgradeShellEnabled();

export function ChannelsPage() {
  const { notify } = useToast();
  const canaisQuery = useCanais();

  const totalCanais = canaisQuery.data?.canais.length ?? 0;
  const nomeDoAtivo = canaisQuery.data?.canais.find((c) => c.ativo)?.nome;
  useDefinirChrome(
    {
      sub: nomeDoAtivo
        ? `${totalCanais} ${totalCanais === 1 ? 'canal' : 'canais'} · ativo: ${nomeDoAtivo}`
        : `${totalCanais} ${totalCanais === 1 ? 'canal' : 'canais'} · nenhum ativo`,
    },
    [totalCanais, nomeDoAtivo],
  );
  const criar = useCriarCanal();
  const editar = useEditarCanal();
  const selecionar = useSelecionarCanal();
  const youtubeStatus = useYoutubeAuthStatus();
  const conectarYoutube = useConectarYoutube();
  const desconectarYoutube = useDesconectarYoutube();

  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [selecionandoId, setSelecionandoId] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('canal');
  const [secao, setSecao] = useState<SecaoCanal>(null);

  const fecharDialogo = () => setDialogo(null);

  const aoConectarYoutube = () => {
    conectarYoutube.mutate(undefined, {
      onSuccess: (res) => notify(res.mensagem, { tone: 'info', title: 'Login do YouTube' }),
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
      onError: (erro) => notify(mensagemErro(erro, 'Erro ao selecionar canal.'), { tone: 'error' }),
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
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]',
        // Dentro da casca a tela mora num miolo que ja rola; 100vh ali
        // empurrava o fim da pagina para baixo da barra de acoes.
        CASCA_NOVA || isWorkbenchEnabled() ? 'h-full' : 'h-screen',
      )}
    >
      <header className="flex flex-none flex-wrap items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-4 py-2.5">
        {CASCA_NOVA ? null : (
          <>
            <span className="text-[16px]" aria-hidden>
              ⚙
            </span>
            <h1 className="text-[15px] font-extrabold">Configurações</h1>
          </>
        )}
        <div className="ml-3 flex gap-1.5">
          {(
            [
              { id: 'canal', rotulo: 'Canal ativo' },
              { id: 'aplicacao', rotulo: 'Aplicação' },
            ] as const
          ).map(({ id, rotulo }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setAba(id);
                setSecao(null);
              }}
              className={cn(
                'rounded-md px-2.5 py-1 text-[10px] font-semibold',
                aba === id && secao === null
                  ? 'bg-[var(--wb-accent)] font-bold text-[var(--wb-accent-fg)]'
                  : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {aba === 'canal' && secao === null && (
          <Button type="button" size="sm" onClick={() => setDialogo({ tipo: 'criar' })}>
            <Plus aria-hidden />
            Novo canal
          </Button>
        )}
      </header>

      <main className="grid flex-1 content-start gap-4 overflow-auto p-4">
        {aba === 'aplicacao' && (
          <>
            {/* D-599: com a casca nova a aparencia que vale e a DELA (tema e
                superficie). A secao antiga controla o tema das cascas
                anteriores e seria um controle que nao muda nada na tela. */}
            {CASCA_NOVA ? <AparenciaDaCasca /> : <AparenciaSection />}
            <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
              <h2 className="text-lg font-semibold text-[var(--wb-text)]">Configurações globais</h2>
              <p className="text-sm text-[var(--wb-text-mute)]">
                Preferências de processamento aplicadas às renderizações do canal ativo.
              </p>
              <AppSettingsControls />
            </section>
          </>
        )}

        {aba === 'canal' && secao !== null && (
          <>
            <button
              type="button"
              onClick={() => setSecao(null)}
              className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
            >
              <ChevronLeft size={14} aria-hidden />
              Canal ativo · {SECOES_CANAL[secao].titulo}
            </button>
            {secao === 'skills' && <EditorialSkillsSection />}
            {secao === 'scaffolds' && <EditorialScaffoldsSection />}
            {secao === 'prompts' && <PromptsUtilitariosSection />}
            {secao === 'pesos' && <RankingPesosSection />}
          </>
        )}

        {aba === 'canal' && secao === null && (
          <>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => canaisQuery.refetch()}
                  >
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

            <ChannelThemeSection />

            {/* Blocos-portal do design: cada área editorial abre em sub-view. */}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
              <BlocoPortal
                emoji="🧠"
                titulo="Skills editoriais"
                descricao="Prompts por etapa (análise, títulos, cenas…) com histórico de versões e reset por campo."
                onClick={() => setSecao('skills')}
              />
              <BlocoPortal
                emoji="🧩"
                titulo="Scaffolds"
                descricao="Contrato de saída de cada skill: placeholders validados e texto do invólucro."
                onClick={() => setSecao('scaffolds')}
              />
              <BlocoPortal
                emoji="🛠"
                titulo="Prompts utilitários"
                descricao="Prompts avulsos (desvios, thumbnail, sentimento…) editáveis com validação."
                onClick={() => setSecao('prompts')}
              />
              <BlocoPortal
                emoji="⚖"
                titulo="Pesos do ranking"
                descricao="Pesos usados no score do ranking de lives do canal."
                onClick={() => setSecao('pesos')}
              />
            </div>
          </>
        )}
      </main>

      <Modal
        open={dialogo?.tipo === 'criar'}
        onClose={fecharDialogo}
        title="Novo canal"
        description="Crie um canal a partir do template. O id (slug) vira a pasta e não muda depois."
      >
        <ChannelForm
          mode="criar"
          pending={criar.isPending}
          onSubmit={aoCriar}
          onCancel={fecharDialogo}
        />
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
