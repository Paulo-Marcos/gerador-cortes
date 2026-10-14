// D-924: que modelo atende cada faixa de IA. A skill escolhe só a faixa (pesado,
// médio, rápido); trocar de modelo é aqui, num lugar só. Cada escolha salva
// sozinha, como o navegador do robô.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toaster';
import { settingsApi, type ModelosDisponiveis, type PapelModelo } from './api';

export const CHAVE_MODELOS_IA = ['modelos-ia'];
const CHAVE_DISPONIVEIS = ['modelos-ia', 'disponiveis'];

const GRUPOS: ReadonlyArray<{ provedor: keyof ModelosDisponiveis; titulo: string; nota: string }> = [
  {
    provedor: 'claude',
    titulo: 'Claude (assinatura)',
    nota: 'Os nomes curtos acompanham sozinhos a versão mais nova da família.',
  },
  {
    provedor: 'gemini',
    titulo: 'Gemini (Antigravity)',
    nota: 'A lista vem do agy desta máquina.',
  },
  {
    provedor: 'gemini_api',
    titulo: 'Gemini (API)',
    nota: 'A lista vem da chave do Gemini; vazia sem a chave.',
  },
];

/** As opções do select: a lista do provedor, sem perder o modelo escolhido
 * nem o padrão quando a lista não os traz (CLI ausente, modelo aposentado).
 * A API do Gemini lista texto e imagem juntos: cada papel fica com os seus. */
export function opcoesDoPapel(
  papel: PapelModelo,
  disponiveis: ModelosDisponiveis['claude'],
): Array<{ id: string; nome: string }> {
  const deImagem = (id: string) => id.includes('image');
  const opcoes = disponiveis.filter(
    (m) => papel.provedor !== 'gemini_api' || deImagem(m.id) === deImagem(papel.key),
  );
  for (const id of [papel.padrao, papel.valor]) {
    if (!opcoes.some((m) => m.id === id)) opcoes.unshift({ id, nome: id });
  }
  return opcoes.map((m) => ({
    id: m.id,
    nome: m.id === papel.padrao ? `${m.nome} · padrão` : m.nome,
  }));
}

export function ModelosDeIa() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const query = useQuery({ queryKey: CHAVE_MODELOS_IA, queryFn: settingsApi.obterModelosIa });
  // Cada consulta roda um `agy models` no backend: uma vez por sessão basta.
  const disponiveis = useQuery({
    queryKey: CHAVE_DISPONIVEIS,
    queryFn: settingsApi.listarModelosDisponiveis,
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: settingsApi.gravarModelosIa,
    onSuccess: (gravado) => {
      queryClient.setQueryData(CHAVE_MODELOS_IA, gravado);
      notify('Modelo atualizado.', { tone: 'success', title: 'Modelos de IA' });
    },
    onError: () =>
      notify('Não foi possível salvar o modelo.', { tone: 'error', title: 'Modelos de IA' }),
  });
  const papeis = query.data?.papeis ?? [];

  return (
    <section className="grid gap-4 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-[var(--wb-text)]">Modelos de IA</h2>
        <p className="text-sm text-[var(--wb-text-mute)]">
          Cada skill do canal escolhe uma faixa: pesado, médio ou rápido. Aqui você diz qual
          modelo atende cada faixa. Quando um modelo sair de uso, basta trocar aqui.
        </p>
      </div>
      {GRUPOS.map((grupo) => (
        <fieldset key={grupo.provedor} className="grid gap-2">
          <legend className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--wb-text-mute)]">
            {grupo.titulo}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {papeis
              .filter((papel) => papel.provedor === grupo.provedor)
              .map((papel) => (
                <label key={papel.key} className="grid content-start gap-1">
                  <span className="text-sm font-semibold text-[var(--wb-text)]">{papel.rotulo}</span>
                  <select
                    aria-label={`${grupo.titulo} · ${papel.rotulo}`}
                    value={papel.valor}
                    disabled={mutation.isPending}
                    onChange={(e) => mutation.mutate({ [papel.key]: e.target.value })}
                    className="h-10 min-w-0 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-3 text-sm font-semibold text-[var(--wb-text)] outline-none transition-colors focus:border-[var(--wb-accent)] disabled:cursor-wait disabled:opacity-60"
                  >
                    {opcoesDoPapel(papel, disponiveis.data?.[grupo.provedor] ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-[var(--wb-text-mute)]">{papel.descricao}</span>
                </label>
              ))}
          </div>
          <span className="text-xs text-[var(--wb-text-dim)]">
            {disponiveis.isLoading ? 'Buscando os modelos disponíveis…' : grupo.nota}
          </span>
        </fieldset>
      ))}
    </section>
  );
}
