// D-804: camada de I/O (react-query) da capa gerada no ChatGPT.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capaChatgptApi, type ConfiguracaoCapaChatgpt, type ProporcaoDaCapa } from './api';

const CONFIGURACAO_KEY = ['capa-chatgpt', 'configuracao'] as const;

export function useConfiguracaoCapaChatgpt() {
  return useQuery<ConfiguracaoCapaChatgpt>({
    queryKey: CONFIGURACAO_KEY,
    queryFn: capaChatgptApi.configuracao,
    staleTime: 30_000,
  });
}

function useAlterarConfiguracao<T>(alterar: (valor: T) => Promise<ConfiguracaoCapaChatgpt>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: alterar,
    // A resposta já É a configuração nova: gravar direto evita um GET a mais.
    onSuccess: (config) => qc.setQueryData(CONFIGURACAO_KEY, config),
  });
}

export const useGravarProjetoChatgpt = () => useAlterarConfiguracao(capaChatgptApi.gravarProjeto);
export const useSubirFichaChatgpt = () => useAlterarConfiguracao(capaChatgptApi.subirFicha);
export const useRemoverFichaChatgpt = () => useAlterarConfiguracao(capaChatgptApi.removerFicha);

/**
 * Gera no ChatGPT e entrega a imagem a `entregar` — o mesmo upload que o
 * Ctrl+V daquela capa usa. O robô não salva nada: quem sabe o que fazer com a
 * imagem é a capa que pediu.
 */
export function useGerarNoChatGPT(
  proporcao: ProporcaoDaCapa,
  entregar: (arquivo: File) => Promise<unknown>,
) {
  return useMutation({
    mutationFn: async (prompt: string) => entregar(await capaChatgptApi.gerar(prompt, proporcao)),
  });
}
