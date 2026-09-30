// D-804: camada de I/O (react-query) da capa gerada no ChatGPT.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  capaChatgptApi,
  elencoDaCapa,
  fotoDaPessoa,
  subirFotoDaPessoa,
  type ConfiguracaoCapaChatgpt,
  type ProporcaoDaCapa,
} from './api';

const CONFIGURACAO_KEY = ['capa-chatgpt', 'configuracao'] as const;
const ELENCO_KEY = ['capa-chatgpt', 'elenco'] as const;

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
    mutationFn: async ({ prompt, pessoas }: { prompt: string; pessoas?: string[] }) =>
      entregar(await capaChatgptApi.gerar(prompt, proporcao, pessoas)),
  });
}

/**
 * D-840: as pessoas reais do prompt e a foto de cada uma. Busca sozinha, ao
 * aparecer o prompt: o operador confere o elenco antes de clicar, sem pedir.
 * O prompt é a chave: o mesmo texto dá o mesmo elenco.
 */
export function useElencoDaCapa(prompt: string, ligado: boolean) {
  return useQuery({
    queryKey: [...ELENCO_KEY, prompt],
    queryFn: () => elencoDaCapa(prompt),
    enabled: ligado && Boolean(prompt),
    staleTime: Infinity,
  });
}

export const useFotoDaPessoa = () => useMutation({ mutationFn: fotoDaPessoa });

/** A foto nova vale para toda capa com essa pessoa: os elencos em cache releem. */
export function useSubirFotoDaPessoa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nome, arquivo }: { nome: string; arquivo: File }) =>
      subirFotoDaPessoa(nome, arquivo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ELENCO_KEY }),
  });
}
