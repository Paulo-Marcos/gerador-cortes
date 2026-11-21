// D-154 + D-394 (design Workbench 1c, validação 1): página de Configurações
// no formato do protótipo — abas "Canal ativo" e "Aplicação"; no canal, as
// áreas editoriais (skills/scaffolds/prompts/pesos) viram BLOCOS-portal que
// abrem cada seção; na aplicação, Aparência (tema+paleta) + settings globais.
// Container: orquestra o I/O (hooks em useChannels) e delega às seções.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import type { Canal, IdentidadeCanal } from '@/features/channels/api/canais';
import { AppSettingsControls, ModelosDeIa, NomeDoOperador } from '@/features/settings';
import { CapaChatgptSection } from '@/features/capa-chatgpt/CapaChatgptSection';
import { EstiloDaCapaSection } from '@/features/capa-chatgpt/EstiloDaCapaSection';
import { ChannelCard } from './ChannelCard';
import { ChannelThemeSection } from './ChannelThemeSection';
import { PalcoComponentesSection } from './EdicaoDoPalco';
import { ChannelForm, type ChannelFormValues } from './ChannelForm';
import { EditorialScaffoldsSection } from './EditorialScaffoldsSection';
import { EditorialSkillsSection } from './EditorialSkillsSection';
import { EscalonamentoSection } from './EscalonamentoSection';
import { FaixaDoShortSection } from './FaixaDoShortSection';
import { MotivosDeExclusaoSection } from './MotivosDeExclusaoSection';
import { PreRequisitosSection } from './PreRequisitosSection';
import { PromptsUtilitariosSection } from './PromptsUtilitariosSection';
import { RankingPesosSection } from './RankingPesosSection';
import { SituacaoDosCanais } from './SituacaoDosCanais';
import { AparenciaDaCasca } from '@/upgrade/AparenciaDaCasca';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';
import {
  useCanais,
  useConectarYoutube,
  useCriarCanal,
  useDesconectarYoutube,
  useEditarCanal,
  useSelecionarCanal,
  useYoutubeAuthStatus,
} from './useChannels';
import { mensagemErro } from '@/lib/mensagemErro';
import { Icon, type IconName } from '@/upgrade/Icon';

type Dialogo = { tipo: 'criar' } | { tipo: 'editar'; canal: Canal } | null;
type Aba = 'canal' | 'aplicacao';

/** D-1072: `?aba=aplicacao` abre direto na Aplicação, onde mora o filtro do canal. */
export function abaDaBusca(busca: URLSearchParams): Aba {
  return busca.get('aba') === 'aplicacao' ? 'aplicacao' : 'canal';
}

function useAbaInicial(): Aba {
  return abaDaBusca(useSearchParams()[0]);
}
type SecaoCanal = null | 'skills' | 'scaffolds' | 'prompts' | 'pesos' | 'horarios';

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
  icone,
  titulo,
  descricao,
  onClick,
}: {
  icone: IconName;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-sala=""
      className="rounded-bloco border border-fio bg-vidro p-3.5 text-left shadow-topo transition-colors hover:border-fio-2 hover:bg-vidro-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      <div className="flex items-center gap-2">
        <Icon name={icone} size={16} />
        <span className="text-linha text-fg">{titulo}</span>
        <span className="ml-auto text-fg-3" aria-hidden>
          →
        </span>
      </div>
      <p className="mt-1.5 text-pequeno text-fg-2">{descricao}</p>
    </button>
  );
}

/** Os blocos-portal da aba do canal, na ordem da tela; o título vira o cabeçalho da seção. */
const PORTAIS: {
  secao: Exclude<SecaoCanal, null>;
  icone: IconName;
  titulo: string;
  descricao: string;
}[] = [
  {
    secao: 'skills',
    icone: 'brain',
    titulo: 'Skills editoriais',
    descricao:
      'Prompts por etapa (análise, títulos, cenas…) com histórico de versões e reset por campo.',
  },
  {
    secao: 'scaffolds',
    icone: 'puzzle',
    titulo: 'Scaffolds',
    descricao: 'Contrato de saída de cada skill: placeholders validados e texto do invólucro.',
  },
  {
    secao: 'prompts',
    icone: 'wrench',
    titulo: 'Prompts utilitários',
    descricao: 'Prompts avulsos (desvios, thumbnail, sentimento…) editáveis com validação.',
  },
  {
    secao: 'pesos',
    icone: 'scale',
    titulo: 'Pesos do ranking',
    descricao: 'Pesos usados no score do ranking de lives do canal.',
  },
  {
    secao: 'horarios',
    icone: 'calendar-days',
    titulo: 'Horários de publicação',
    descricao: 'Quando o público está lá e os blocos por rede que distribuem o lote de shorts.',
  },
];

const SECOES_CANAL: Record<Exclude<SecaoCanal, null>, { titulo: string }> = {
  skills: { titulo: 'Skills editoriais' },
  scaffolds: { titulo: 'Scaffolds' },
  prompts: { titulo: 'Prompts utilitários' },
  pesos: { titulo: 'Pesos do ranking' },
  horarios: { titulo: 'Horários de publicação' },
};

export function ChannelsPage() {
  const { notify } = useToast();
  const canaisQuery = useCanais();

  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const totalCanais = canaisQuery.data?.canais.length ?? 0;
  const nomeDoAtivo = canaisQuery.data?.canais.find((c) => c.ativo)?.nome;
  useDefinirChrome(
    {
      sub: nomeDoAtivo
        ? `${totalCanais} ${totalCanais === 1 ? 'canal' : 'canais'} · ativo: ${nomeDoAtivo}`
        : `${totalCanais} ${totalCanais === 1 ? 'canal' : 'canais'} · nenhum ativo`,
      // D-1172 (§7.7): "Novo canal" é secundária (a tela não tem primária, §5). Sai do corpo
      // para o cabeçalho, onde ficam as ações da tela.
      acoes: [{ icone: 'plus', texto: 'Novo canal', onClick: () => setDialogo({ tipo: 'criar' }) }],
    },
    [totalCanais, nomeDoAtivo],
  );
  const criar = useCriarCanal();
  const editar = useEditarCanal();
  const selecionar = useSelecionarCanal();
  const youtubeStatus = useYoutubeAuthStatus();
  const conectarYoutube = useConectarYoutube();
  const desconectarYoutube = useDesconectarYoutube();

  const [selecionandoId, setSelecionandoId] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>(useAbaInicial());
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
            `Canal “${canal.nome || canal.id}” escolhido. Feche e abra o app para a troca valer. ` +
              'Até lá, não processe nada: o banco ainda é o do canal anterior.',
            { tone: 'warning', title: 'Feche e abra o app' },
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
        'flex min-h-0 flex-col overflow-hidden text-fg',
        // Dentro da casca a tela mora num miolo que ja rola; 100vh ali
        // empurrava o fim da pagina para baixo da barra de acoes.
        'h-full',
      )}
    >
      <Tabs
        value={aba}
        onValueChange={(v) => {
          setAba(v as Aba);
          setSecao(null);
        }}
        className="flex-none px-6"
      >
        <TabsList aria-label="Configurações">
          <TabsTrigger value="canal">Canal ativo</TabsTrigger>
          <TabsTrigger value="aplicacao">Aplicação</TabsTrigger>
        </TabsList>
      </Tabs>

      <main className="grid flex-1 content-start gap-4 overflow-auto px-6 py-5">
        {aba === 'aplicacao' && <AbaAplicacao />}

        {aba === 'canal' && secao !== null && (
          <>
            <button
              type="button"
              onClick={() => setSecao(null)}
              className="inline-flex w-fit items-center gap-1.5 text-pequeno font-semibold text-fg-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
            >
              <Icon name="chevron-left" />
              Canal ativo · {SECOES_CANAL[secao].titulo}
            </button>
            {secao === 'skills' && <EditorialSkillsSection />}
            {secao === 'scaffolds' && <EditorialScaffoldsSection />}
            {secao === 'prompts' && <PromptsUtilitariosSection />}
            {secao === 'pesos' && <RankingPesosSection />}
            {secao === 'horarios' && <EscalonamentoSection />}
          </>
        )}

        {aba === 'canal' && secao === null && (
          <>
            <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
              <IndiceDasSecoes />
              <div className="grid min-w-0 gap-4">
                <SituacaoDosCanais
                  carregando={canaisQuery.isLoading}
                  erro={canaisQuery.isError ? canaisQuery.error : null}
                  vazio={canaisQuery.isSuccess && canais.length === 0}
                  onTentarDeNovo={() => void canaisQuery.refetch()}
                  onCriar={() => setDialogo({ tipo: 'criar' })}
                />

                {canais.length > 0 && (
                  <ul id="identidade" className="grid gap-3">
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
                        onChecarYoutube={() => void youtubeStatus.refetch()}
                      />
                    ))}
                  </ul>
                )}

                <AparenciaECapasDoCanal />

                {/* Blocos-portal do design: cada área editorial abre em sub-view. */}
                <div
                  id="areas-editoriais"
                  className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]"
                >
                  {PORTAIS.map((portal) => (
                    <BlocoPortal
                      key={portal.secao}
                      {...portal}
                      onClick={() => setSecao(portal.secao)}
                    />
                  ))}
                </div>
              </div>
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

/** As seções de aparência do canal: tema, capas no ChatGPT e estilo das capas (D-909). */
function AbaAplicacao() {
  return (
    <>
      {/* D-599: com a casca nova a aparencia que vale e a DELA (tema e
          superficie). A secao antiga controla o tema das cascas
          anteriores e seria um controle que nao muda nada na tela. */}
      <AparenciaDaCasca />
      <NomeDoOperador />
      <PreRequisitosSection />
      <section
        className="grid gap-3 rounded-painel border border-fio bg-vidro p-5 shadow-topo"
        data-sala=""
      >
        <h2 className="text-secao text-fg">Configurações globais</h2>
        <p className="text-corpo text-fg-2">
          Preferências de processamento aplicadas às renderizações do canal ativo.
        </p>
        <AppSettingsControls />
      </section>
      <ModelosDeIa />
    </>
  );
}

const INDICE: { id: string; rotulo: string }[] = [
  { id: 'identidade', rotulo: 'Identidade' },
  { id: 'tema-do-render', rotulo: 'Tema do render' },
  { id: 'palco-do-canal', rotulo: 'Palco do canal' },
  { id: 'areas-editoriais', rotulo: 'Skills editoriais e mais' },
];

/** O índice das seções (§7.7): leva até a seção sem trocar de tela. */
function IndiceDasSecoes() {
  return (
    <nav aria-label="Seções do canal" className="hidden flex-col gap-1 lg:flex">
      {INDICE.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() =>
            document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          className="rounded-etiqueta px-2.5 py-1.5 text-left text-corpo font-semibold text-fg-2 hover:bg-vidro-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
        >
          {item.rotulo}
        </button>
      ))}
    </nav>
  );
}

function AparenciaECapasDoCanal() {
  return (
    <>
      <ChannelThemeSection />
      <div id="palco-do-canal">
        <PalcoComponentesSection />
      </div>
      <CapaChatgptSection />
      <EstiloDaCapaSection />
      <FaixaDoShortSection />
      <MotivosDeExclusaoSection />
    </>
  );
}
