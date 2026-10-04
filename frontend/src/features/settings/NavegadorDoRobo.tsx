// D-832: em que navegador o robô do TikTok e do Instagram abre. Salva sozinho,
// com a própria mutation, como o layout da capa do TikTok logo acima.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toaster';
import { settingsApi, type Navegador } from './api';

export const CHAVE_NAVEGADOR_DO_ROBO = ['navegador-do-robo'];

const NAVEGADORES: Array<{ value: Navegador; label: string }> = [
  { value: 'edge', label: 'Microsoft Edge' },
  { value: 'chrome', label: 'Google Chrome' },
];

export function NavegadorDoRobo() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const query = useQuery({
    queryKey: CHAVE_NAVEGADOR_DO_ROBO,
    queryFn: settingsApi.obterNavegadorDoRobo,
  });
  const mutation = useMutation({
    mutationFn: settingsApi.escolherNavegadorDoRobo,
    onSuccess: (escolha) => {
      queryClient.setQueryData(CHAVE_NAVEGADOR_DO_ROBO, escolha);
      notify('Navegador do robô atualizado.', { tone: 'success', title: 'Ajustes' });
    },
    onError: () =>
      notify('Não foi possível salvar o navegador do robô.', { tone: 'error', title: 'Ajustes' }),
  });

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--wb-text-mute)]">
        Navegador do robô (TikTok e Instagram)
      </span>
      <select
        value={query.data?.navegador ?? 'edge'}
        disabled={query.isLoading || mutation.isPending}
        onChange={(event) => mutation.mutate(event.target.value as Navegador)}
        className="h-10 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-3 text-sm font-semibold text-[var(--wb-text)] outline-none transition-colors focus:border-[var(--wb-accent)] disabled:cursor-wait disabled:opacity-60"
      >
        {NAVEGADORES.map((navegador) => (
          <option key={navegador.value} value={navegador.value}>
            {navegador.label}
          </option>
        ))}
      </select>
      <span className="text-xs font-normal text-[var(--wb-text-mute)]">
        Onde o robô abre o upload assistido. Cada navegador guarda a própria sessão: na primeira
        vez em um deles, faça login na janela que o robô abrir.
      </span>
    </label>
  );
}
