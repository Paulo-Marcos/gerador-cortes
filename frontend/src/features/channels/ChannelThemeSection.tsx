// D-174: seletor de TEMA de render do canal ativo. Um tema amarra a paleta
// COMPLETA das cenas Remotion (17 cores) + o preset tipográfico. É por-canal
// (settings.db) e opt-in: sem escolha, o canal renderiza o default "atual".
// Componente "burro" quanto a I/O — consome os hooks de useChannels.
import { Check, Loader2, Palette } from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import type { Tema } from '@/features/channels/api/canais';
import { useCanais, useSelecionarTema, useTemaDoCanal, useTemas } from './useChannels';

// Cores representativas para o swatch de preview (subconjunto legível das 17).
const CHAVES_PREVIEW = [
  'fundoPalco',
  'verdeMoldura',
  'verdeCard1',
  'azulAcento',
  'marromQuente',
  'branco',
] as const;

function mensagemErro(erro: unknown, fallback: string): string {
  return erro instanceof Error ? erro.message : fallback;
}

function TemaCard({
  tema,
  atual,
  pendente,
  onSelecionar,
}: {
  tema: Tema;
  atual: boolean;
  pendente: boolean;
  onSelecionar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      disabled={pendente}
      aria-pressed={atual}
      className={`grid gap-3 rounded-[var(--radius)] border p-4 text-left transition disabled:opacity-60 ${
        atual
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
          : 'border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] hover:border-[var(--wb-border)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-[var(--wb-text)]">{tema.nome}</span>
        {atual && (
          <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--wb-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
            <Check size={11} aria-hidden />
            Selecionado
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5" aria-hidden>
        {CHAVES_PREVIEW.map((chave) => (
          <span
            key={chave}
            className="h-6 w-6 rounded-[var(--radius-sm)] border border-[var(--wb-border)]"
            style={{ backgroundColor: tema.paleta[chave] }}
            title={`${chave}: ${tema.paleta[chave]}`}
          />
        ))}
      </div>

      <span className="text-xs text-[var(--wb-text-dim)]">
        Tipografia: <code>{tema.fonte_preset}</code>
      </span>
    </button>
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
        onError: (erro) =>
          notify(mensagemErro(erro, 'Erro ao aplicar o tema.'), { tone: 'error' }),
      },
    );
  };

  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <div className="flex items-center gap-2">
        <Palette size={18} aria-hidden className="text-[var(--wb-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--wb-text)]">Tema de aparência</h2>
      </div>
      <p className="text-sm text-[var(--wb-text-mute)]">
        Cada tema define a <strong>paleta das cenas do render</strong> (fundo, moldura, cards,
        acento) e o <strong>preset tipográfico</strong>. Aplica-se ao <strong>canal ativo</strong> e
        vale no próximo render. Não confunda com a <em>paleta de identidade</em> (3 cores de
        branding, editada no card do canal abaixo) — são coisas separadas.
      </p>

      {canaisQuery.isSuccess && !canalAtivo && (
        <p className="text-sm text-[var(--wb-text-dim)]">
          Nenhum canal ativo. Selecione um canal para escolher o tema.
        </p>
      )}

      {(canaisQuery.isLoading || temasQuery.isLoading) && (
        <p className="flex items-center gap-2 text-sm text-[var(--wb-text-mute)]">
          <Loader2 className="animate-spin" size={16} aria-hidden />
          Carregando temas…
        </p>
      )}

      {temasQuery.isError && (
        <p className="text-sm text-[var(--wb-err)]">
          {mensagemErro(temasQuery.error, 'Não foi possível carregar os temas.')}
        </p>
      )}

      {canalAtivo && temasQuery.data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {temasQuery.data.temas.map((tema) => (
            <TemaCard
              key={tema.id}
              tema={tema}
              atual={tema.id === temaAtualId}
              pendente={selecionar.isPending}
              onSelecionar={() => aoSelecionar(tema)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
