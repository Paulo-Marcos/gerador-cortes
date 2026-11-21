// D-174: seletor de TEMA de render do canal ativo. Um tema amarra a paleta
// COMPLETA das cenas Remotion (17 cores) + o preset tipográfico. É por-canal
// (settings.db) e opt-in: sem escolha, o canal renderiza o default "atual".
// Componente "burro" quanto a I/O — consome os hooks de useChannels.
import { CartaoDeOpcao } from '@/components/ui/cartao-de-opcao';
import { GrupoDeRadio } from '@/components/ui/radio';
import { useToast } from '@/components/ui/toaster';
import type { Tema } from '@/features/channels/api/canais';
import { useCanais, useSelecionarTema, useTemaDoCanal, useTemas } from './useChannels';
import { mensagemErro } from '@/lib/mensagemErro';
import { Icon } from '@/upgrade/Icon';

// Cores representativas para o swatch de preview (subconjunto legível das 17).
const CHAVES_PREVIEW = [
  'fundoPalco',
  'verdeMoldura',
  'verdeCard1',
  'azulAcento',
  'marromQuente',
  'branco',
] as const;

function TemaCard({ tema, pendente }: { tema: Tema; pendente: boolean }) {
  return (
    <CartaoDeOpcao
      value={tema.id}
      titulo={tema.nome}
      descricao={`Tipografia: ${tema.fonte_preset}`}
      disabled={pendente}
    >
      <div className="flex items-center gap-1.5" aria-hidden>
        {CHAVES_PREVIEW.map((chave) => (
          <span
            key={chave}
            className="size-6 rounded-etiqueta border border-fio-2"
            style={{ backgroundColor: tema.paleta[chave] }}
            title={`${chave}: ${tema.paleta[chave]}`}
          />
        ))}
      </div>
    </CartaoDeOpcao>
  );
}

export function ChannelThemeSection() {
  const { notify } = useToast();
  const canaisQuery = useCanais();
  const temasQuery = useTemas();

  const canalAtivo = canaisQuery.data?.canais.find((c) => c.ativo);
  const temaDoCanal = useTemaDoCanal(canalAtivo?.id);
  const selecionar = useSelecionarTema();

  const temaAtualId = temaDoCanal.data?.tema_id;

  const aoSelecionar = (tema: Tema) => {
    if (!canalAtivo || tema.id === temaAtualId) return;
    selecionar.mutate(
      { canalId: canalAtivo.id, temaId: tema.id },
      {
        onSuccess: () =>
          notify(`Tema “${tema.nome}” aplicado ao canal ativo.`, {
            tone: 'success',
            title: 'Tema atualizado',
          }),
        onError: (erro) => notify(mensagemErro(erro, 'Erro ao aplicar o tema.'), { tone: 'error' }),
      },
    );
  };

  return (
    <section
      id="tema-do-render"
      data-sala=""
      className="grid gap-3 rounded-painel border border-fio bg-vidro p-5 shadow-topo"
    >
      <div className="flex items-center gap-2">
        <Icon name="palette" size={20} className="text-iris" />
        <h2 className="text-secao text-fg">Tema de aparência</h2>
      </div>
      <p className="text-corpo text-fg-2">
        Cada tema define a <strong>paleta das cenas do render</strong> (fundo, moldura, cards,
        acento) e o <strong>preset tipográfico</strong>. Aplica-se ao <strong>canal ativo</strong> e
        vale no próximo render. Não confunda com a <em>paleta de identidade</em> (3 cores de
        branding, editada no card do canal abaixo) — são coisas separadas.
      </p>

      {canaisQuery.isSuccess && !canalAtivo && (
        <p className="text-corpo text-fg-3">
          Nenhum canal ativo. Selecione um canal para escolher o tema.
        </p>
      )}

      {(canaisQuery.isLoading || temasQuery.isLoading) && (
        <p className="flex items-center gap-2 text-corpo text-fg-2">
          <Icon name="loader-2" size={16} className="animate-spin" />
          Carregando temas…
        </p>
      )}

      {temasQuery.isError && (
        <p className="text-corpo text-erro">
          {mensagemErro(temasQuery.error, 'Não foi possível carregar os temas.')}
        </p>
      )}

      {canalAtivo && temasQuery.data && (
        <GrupoDeRadio
          value={temaAtualId}
          onValueChange={(id) => {
            const tema = temasQuery.data.temas.find((t) => t.id === id);
            if (tema) aoSelecionar(tema);
          }}
          aria-label="Tema de aparência do render"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {temasQuery.data.temas.map((tema) => (
            <TemaCard key={tema.id} tema={tema} pendente={selecionar.isPending} />
          ))}
        </GrupoDeRadio>
      )}
    </section>
  );
}
