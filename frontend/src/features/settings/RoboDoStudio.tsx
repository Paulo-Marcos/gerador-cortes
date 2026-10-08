// D-895: o que o robô do YouTube Studio faz depois do upload pela API — que não
// liga a monetização nem o vídeo relacionado do short. Salva sozinho, como o
// navegador do robô logo acima.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toaster';
import { settingsApi, type RoboDoStudio as Config } from './api';

export const CHAVE_ROBO_DO_STUDIO = ['robo-do-studio'];

const DESLIGADO: Config = { monetizar: false, relacionar_short: false };

const OPCOES: Array<{ chave: keyof Config; label: string }> = [
  { chave: 'monetizar', label: 'Ligar a monetização de cada vídeo enviado' },
  { chave: 'relacionar_short', label: 'Ligar cada short ao corte de onde ele saiu' },
];

export function RoboDoStudio() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const query = useQuery({
    queryKey: CHAVE_ROBO_DO_STUDIO,
    queryFn: settingsApi.obterRoboDoStudio,
  });
  const mutation = useMutation({
    mutationFn: settingsApi.gravarRoboDoStudio,
    onSuccess: (gravado) => {
      queryClient.setQueryData(CHAVE_ROBO_DO_STUDIO, gravado);
      notify('Robô do YouTube Studio atualizado.', { tone: 'success', title: 'Ajustes' });
    },
    onError: () =>
      notify('Não foi possível salvar o robô do YouTube Studio.', {
        tone: 'error',
        title: 'Ajustes',
      }),
  });
  const atual = query.data ?? DESLIGADO;

  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--wb-text-mute)]">
        Robô do YouTube Studio
      </legend>
      {OPCOES.map((opcao) => (
        <label
          key={opcao.chave}
          className="flex items-center gap-2 text-sm font-semibold text-[var(--wb-text)]"
        >
          <input
            type="checkbox"
            checked={atual[opcao.chave]}
            disabled={query.isLoading || mutation.isPending}
            onChange={(event) => mutation.mutate({ ...atual, [opcao.chave]: event.target.checked })}
          />
          {opcao.label}
        </label>
      ))}
      <span className="text-xs font-normal text-[var(--wb-text-mute)]">
        A API do YouTube não faz nenhum dos dois. Depois dos envios, o robô abre o Studio uma vez
        e ajusta todos. Na primeira vez, faça login na conta do canal na janela que ele abrir. A
        monetização só existe para canal do Programa de Parcerias.
      </span>
    </fieldset>
  );
}
