import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type AtualizarPostBody, shortsApi, type AtualizarShortBody, type CenaShort } from './shortsApi';
import { FIRES_KEY } from './useFires';

export const shortsDoCorteKey = (corteId: string) => ['shorts', 'corte', corteId] as const;

/** D-565 (onda 3): o texto de publicacao de UM short. */
export const postDoShortKey = (shortId: string) => ['shorts', 'post', shortId] as const;

/** Prefixo de tudo que descreve palco — invalidar aqui atinge o corte E os shorts. */
export const PALCO_KEY = ['shorts', 'palco'] as const;

export function useShortsDoCorte(corteId: string) {
  return useQuery({
    queryKey: shortsDoCorteKey(corteId),
    queryFn: () => shortsApi.listarDoCorte(corteId),
    enabled: Boolean(corteId),
  });
}

interface AtualizarArgs extends AtualizarShortBody {
  shortId: string;
}

export function useAtualizarShort(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shortId, ...body }: AtualizarArgs) => shortsApi.atualizar(shortId, body),
    // A lista de Fires mostra a contagem por status, entao aprovar/rejeitar aqui
    // muda o card la tambem — invalidar as duas evita a tela mentir.
    //
    // O PLANO DESENHAVEL tambem entra, e essa foi a licao da D-490 se repetindo
    // na D-493: bordas, foco, modelo e ajustes mudam o desenho, mas a chave dele
    // nao carrega nenhum desses. Sem invalidar, o operador arrasta um bloco, o
    // banco grava, e a tela continua mostrando o slot antigo.
    //
    // A regra que fica: TODA view derivada precisa ser invalidada por quem muda
    // a origem dela — nao basta a chave carregar parte dos insumos.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
      void qc.invalidateQueries({ queryKey: FIRES_KEY });
      void qc.invalidateQueries({ queryKey: [...PALCO_KEY, 'desenho'] });
    },
  });
}

// D-460: descartar o bruto encerra a fabrica de shorts daquele corte, entao o
// Fire some da lista — invalidar FIRES_KEY e o que faz a tela contar a verdade.
export function useDescartarBruto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corteId: string) => shortsApi.descartarBruto(corteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: FIRES_KEY }),
  });
}

// D-466: o render e sincrono e demora (ffmpeg + Remotion + composicao). A tela
// segura o botao pelo isPending em vez de fingir que terminou.
export function useRenderizarShort(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shortId: string) => shortsApi.renderizar(shortId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
      void qc.invalidateQueries({ queryKey: FIRES_KEY });
    },
  });
}

// D-485: o disparo volta na hora; quem acompanha e o `useProgressoRender`.
export function useRenderizarPrevia(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shortId: string) => shortsApi.renderizarPrevia(shortId),
    onSuccess: () => qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) }),
  });
}

/**
 * D-485: acompanha o render de UM short enquanto ele corre.
 *
 * O polling so existe enquanto ha algo rodando — sem isso a tela bateria no
 * backend de dois em dois segundos para sempre, por candidato, mesmo com todos
 * parados. `refetchInterval` devolvendo `false` desliga sozinho.
 *
 * Quando termina, invalida a lista: e la que o caminho do arquivo aparece.
 */
export function useProgressoRender(shortId: string, corteId: string, ativo: boolean) {
  const qc = useQueryClient();
  const jaInvalidou = useRef(false);

  const query = useQuery({
    queryKey: ['shorts', 'progresso', shortId],
    queryFn: () => shortsApi.progresso(shortId),
    enabled: ativo,
    refetchInterval: (q) => (q.state.data?.render?.concluido === false ? 2000 : false),
  });

  const concluido = query.data?.render?.concluido;
  useEffect(() => {
    if (concluido && !jaInvalidou.current) {
      jaInvalidou.current = true;
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
    }
    if (concluido === false) jaInvalidou.current = false;
  }, [concluido, corteId, qc]);

  return query.data?.render ?? null;
}

export function usePreviaPublicacao(shortId: string | null) {
  return useQuery({
    queryKey: ['shorts', 'publicacao', shortId],
    queryFn: () => shortsApi.previaPublicacao(shortId as string),
    enabled: Boolean(shortId),
  });
}

// D-468/469/470: um mutate so para os dois modos. Quem decide se e upload por
// API ou pasta pronta e o destino, no backend — a tela nao precisa saber.
export function usePublicarShort() {
  return useMutation({
    mutationFn: ({ shortId, plataforma }: { shortId: string; plataforma: string }) =>
      shortsApi.publicar(shortId, plataforma),
  });
}

// D-479: as palavras do bruto mudam so quando a transcricao muda — nunca por
// causa de uma aprovacao ou de um arraste de borda. Fica fora do
// `shortsDoCorteKey` de proposito: senao cada PATCH refaria um download de
// milhares de palavras para redesenhar a mesma legenda.
export function useTranscricaoDoCorte(corteId: string) {
  return useQuery({
    queryKey: ['shorts', 'transcricao', corteId],
    queryFn: () => shortsApi.transcricaoDoCorte(corteId),
    enabled: Boolean(corteId),
    staleTime: Infinity,
  });
}

/**
 * D-541: a onda do bruto. Cache eterno — o arquivo não muda enquanto está lá, e
 * quando é regerado o backend troca a chave do cache dele sozinho (o hash
 * inclui mtime e tamanho), então um refetch traria o mesmo JSON.
 *
 * `retry: false` porque as duas falhas possíveis são definitivas até o operador
 * agir: não há bruto (404) ou o arquivo está quebrado (422). Insistir três
 * vezes só atrasaria a régua lisa que a tela já sabe mostrar.
 */
export function useOndaDoBruto(corteId: string) {
  return useQuery({
    queryKey: ['shorts', 'onda-bruto', corteId],
    queryFn: () => shortsApi.picosDoBruto(corteId),
    enabled: Boolean(corteId),
    staleTime: Infinity,
    retry: false,
  });
}

// D-507: o catalogo passou a depender do CORTE, e nao so do sistema: o que ele
// devolve inclui o que as regioes daquele corte permitem montar. Cache eterno
// por corte — as regioes so mudam quando o operador troca o preset, e isso ja
// invalida a chave do palco.
export function useArranjosDePalco(corteId: string) {
  return useQuery({
    queryKey: [...PALCO_KEY, 'arranjos', corteId],
    queryFn: () => shortsApi.arranjosDePalco(corteId),
    enabled: Boolean(corteId),
    staleTime: Infinity,
  });
}

export function usePalcoDoCorte(corteId: string) {
  return useQuery({
    queryKey: [...PALCO_KEY, 'corte', corteId],
    queryFn: () => shortsApi.palcoDoCorte(corteId),
    enabled: Boolean(corteId),
  });
}

// Trocar o preset muda as regioes, e as regioes mudam o modelo sugerido de TODO
// candidato do corte — dai invalidar a lista tambem.
export function useEscolherPreset(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (presetId: string) => shortsApi.escolherPreset(corteId, presetId),
    // D-490: trocar o preset muda TAMBEM o plano desenhavel de cada short, e
    // essa query nao era invalidada. A chave dela carrega o modelo, nao o
    // preset, entao permanecia identica e o React Query servia o plano em cache
    // — o operador escolhia o palco e a tela nao mudava nada.
    //
    // O catalogo de modelos fica de fora de proposito: ele e do sistema e nao
    // muda com o preset (e tem staleTime infinito justamente por isso).
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...PALCO_KEY, 'corte'] });
      void qc.invalidateQueries({ queryKey: [...PALCO_KEY, 'desenho'] });
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
    },
  });
}

// D-489/D-490: o palco desenhavel do candidato em foco.
//
// A chave carrega o modelo porque trocar o arranjo do short muda o desenho. O
// PRESET do corte tambem muda, e esse nao aparece na chave — quem cuida dele e
// a invalidacao por prefixo em `useEscolherPreset`. Foi confiar so na chave que
// deixou a previa presa num plano vazio (D-490).
export function usePalcoDoShort(shortId: string | null, modelo: string) {
  return useQuery({
    queryKey: [...PALCO_KEY, 'desenho', shortId, modelo],
    queryFn: () => shortsApi.palcoDoShort(shortId as string),
    enabled: Boolean(shortId),
  });
}

// D-484: o candidato manual entra na mesma lista e nas mesmas contagens, entao
// invalida as duas — a tela de Fires mostra o total por status.
export function useCriarShortManual(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { inicio_seg: number; fim_seg: number; titulo?: string }) =>
      shortsApi.criarManual(corteId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
      void qc.invalidateQueries({ queryKey: FIRES_KEY });
    },
  });
}

// D-494: as cenas mudam o que o render desenha por cima, entao invalidam a lista
// (de onde vem `cenas`) — nao o plano do palco, que so descreve o recorte.
/**
 * D-497: pede o palpite da IA para as cenas de um trecho.
 *
 * Sincrono e sem otimismo: a resposta traz o short JA gravado, entao invalidar
 * a lista basta. Os `descartes` ficam no resultado da mutation e a tela os
 * mostra — sao eles que explicam por que a IA propos cinco e a lista tem tres.
 */
export function useSugerirCenas(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shortId: string) => shortsApi.sugerirCenas(shortId),
    onSuccess: () => qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) }),
  });
}

/**
 * D-565: pede as variacoes do gancho da abertura.
 *
 * NAO invalida a lista de shorts, porque nada foi gravado — as variacoes vivem
 * no resultado da mutation ate o operador clicar numa. Invalidar aqui seria
 * pedir de volta um dado que nao mudou, e piscaria a tela sem motivo.
 */
export function useSugerirGanchos() {
  return useMutation({
    mutationFn: (shortId: string) => shortsApi.sugerirGanchos(shortId),
  });
}

/** D-565 (onda 3): o texto de publicacao gravado deste short. */
export function usePostDoShort(shortId: string, habilitado = true) {
  return useQuery({
    queryKey: postDoShortKey(shortId),
    queryFn: () => shortsApi.obterPost(shortId),
    enabled: habilitado,
  });
}

/**
 * Pede o post a IA. Diferente do gerador de ganchos, este GRAVA — entao a
 * resposta substitui o cache em vez de viver so no resultado da mutation.
 */
export function useGerarPost(shortId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => shortsApi.gerarPost(shortId),
    onSuccess: (post) => qc.setQueryData(postDoShortKey(shortId), post),
  });
}

/** A edicao manual do operador. */
export function useAtualizarPost(shortId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AtualizarPostBody) => shortsApi.atualizarPost(shortId, body),
    onSuccess: (post) => qc.setQueryData(postDoShortKey(shortId), post),
  });
}

/**
 * D-477: pede ao detector para enquadrar o trecho pelo rosto.
 *
 * O foco volta JA gravado, entao invalidar a lista basta. O veredito fica no
 * resultado da mutation e a tela o mostra — inclusive o "nao achei", que sem
 * texto na tela seria indistinguivel de um botao quebrado.
 */
export function useEnquadrarPeloRosto(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shortId: string) => shortsApi.enquadrarPeloRosto(shortId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
      void qc.invalidateQueries({ queryKey: [...PALCO_KEY, 'desenho'] });
    },
  });
}

export function useDefinirCenas(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shortId, cenas }: { shortId: string; cenas: CenaShort[] }) =>
      shortsApi.definirCenas(shortId, cenas),
    onSuccess: () => qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) }),
  });
}
