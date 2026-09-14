import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type AtualizarPostBody, type CapaDoShortApi, type GerarCapaBody, shortsApi, type AtualizarShortBody, type CenaShort } from './shortsApi';
import { FIRES_KEY } from './useFires';

export const shortsDoCorteKey = (corteId: string) => ['shorts', 'corte', corteId] as const;

/** D-565 (onda 3): o texto de publicacao de UM short. */
export const postDoShortKey = (shortId: string) => ['shorts', 'post', shortId] as const;

/** D-565 (onda 4): o quadro de capa de UM short. */
export const capaDoShortKey = (shortId: string) => ['shorts', 'capa', shortId] as const;
export const promptDaCapaKey = (shortId: string) =>
  ['shorts', 'capa', 'prompt', shortId] as const;

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

// D-593: finalizar tira o corte da fila e reabrir o devolve. O estado mora na
// lista de Fires — de onde a fila E o cabeçalho do corte leem —, então é ela
// que precisa ser invalidada.
export function useMarcarFinalizado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ corteId, finalizado }: { corteId: string; finalizado: boolean }) =>
      shortsApi.marcarFinalizado(corteId, finalizado),
    onSuccess: () => qc.invalidateQueries({ queryKey: FIRES_KEY }),
  });
}

// D-466: o render e sincrono e demora (ffmpeg + Remotion + composicao). A tela
// segura o botao pelo isPending em vez de fingir que terminou.
/** D-568: a chave do progresso de um short — o disparo precisa alcançá-la. */
export const progressoKey = (shortId: string) => ['shorts', 'progresso', shortId] as const;

export function useRenderizarShort(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shortId: string) => shortsApi.renderizar(shortId),
    onSuccess: (_dados, shortId) => {
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
      void qc.invalidateQueries({ queryKey: FIRES_KEY });
      void qc.invalidateQueries({ queryKey: progressoKey(shortId) });
    },
  });
}

// D-485: o disparo volta na hora; quem acompanha e o `useProgressoRender`.
export function useRenderizarPrevia(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shortId: string) => shortsApi.renderizarPrevia(shortId),
    onSuccess: (_dados, shortId) => {
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
      void qc.invalidateQueries({ queryKey: progressoKey(shortId) });
    },
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
 *
 * ## D-568: por que clicar em "Gerar previa" nao mostrava nada
 *
 * Este desligar-sozinho era o problema. Ao montar, o card consulta uma vez, nao
 * ha render em curso, `concluido` vem indefinido — e o `refetchInterval` decide
 * `false` PARA SEMPRE. O disparo comecava no backend (que registra o progresso
 * de forma sincrona, em `render_short.disparar`), e a tela nunca mais
 * perguntava. Dai os tres sintomas de um defeito so: o clique parecia nao fazer
 * nada, o painel de passos nunca aparecia, e o arquivo pronto so surgia com F5.
 *
 * A correcao nao e polling eterno — e o DISPARO avisar. As duas mutations
 * invalidam esta chave, o que forca uma releitura; ela volta com
 * `concluido: false` e o intervalo religa sozinho.
 */
export function useProgressoRender(shortId: string, corteId: string, ativo: boolean) {
  const qc = useQueryClient();
  const jaInvalidou = useRef(false);

  const query = useQuery({
    queryKey: progressoKey(shortId),
    queryFn: () => shortsApi.progresso(shortId),
    enabled: ativo,
    refetchInterval: (q) => (q.state.data?.render?.concluido === false ? 2000 : false),
    // D-568: continuar perguntando mesmo com a aba em segundo plano.
    //
    // Por padrao o react-query PAUSA o intervalo quando `document.hidden` e
    // verdadeiro — e o proprio painel convida o operador a sair ("Pode sair
    // desta tela: o render continua"). Com a pausa, ele saia, voltava e via o
    // cronometro parado no instante em que virou as costas; o arquivo pronto so
    // aparecia com F5.
    //
    // O custo e limitado por construcao: este intervalo so existe enquanto
    // `concluido === false`, ou seja, enquanto ha de fato um render em curso.
    refetchIntervalInBackground: true,
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

/**
 * D-568: o log do worker, enquanto o render corre.
 *
 * Acompanha o mesmo ritmo do progresso e pela mesma razão: o arquivo cresce
 * durante a execução, e olhar uma vez mostraria só o começo. Depois que termina
 * ele para de mudar, então o polling se desliga junto — a última leitura já traz
 * a linha de `Fim` com a duração, que é o que se quer ver no fim.
 */
export function useLogDoRender(shortId: string, ativo: boolean) {
  return useQuery({
    queryKey: ['shorts', 'log', shortId],
    queryFn: () => shortsApi.logDoRender(shortId),
    enabled: ativo,
    refetchInterval: ativo ? 3000 : false,
    refetchIntervalInBackground: true,
  });
}

/** D-570: o palco padrão do corte — o que todos os shorts herdam. */
export function usePalcoPadrao(corteId: string) {
  return useQuery({
    queryKey: ['shorts', 'palco-padrao', corteId],
    queryFn: () => shortsApi.palcoPadrao(corteId),
    enabled: Boolean(corteId),
  });
}

export function useDefinirPalcoPadrao(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (presetId: string) => shortsApi.definirPalcoPadrao(corteId, presetId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shorts', 'palco-padrao', corteId] });
      // A herança é resolvida na LEITURA, então trocar o padrão muda o plano de
      // todo short que não customizou — e é a lista e os palcos que os mostram.
      void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
      void qc.invalidateQueries({ queryKey: PALCO_KEY });
    },
  });
}

/** D-594: o gancho padrão do corte — a aparência que todos os trechos herdam. */
export const ganchoPadraoKey = (corteId: string) => ['shorts', 'gancho-padrao', corteId] as const;

export function useGanchoPadrao(corteId: string) {
  return useQuery({
    queryKey: ganchoPadraoKey(corteId),
    queryFn: () => shortsApi.ganchoPadrao(corteId),
    enabled: Boolean(corteId),
  });
}

/**
 * Tudo que muda a aparência RESOLVIDA do gancho: o padrão, a lista (o contador
 * de customizados) e os planos, que carregam a aparência já herdada.
 */
function invalidarGancho(qc: ReturnType<typeof useQueryClient>, corteId: string) {
  void qc.invalidateQueries({ queryKey: ganchoPadraoKey(corteId) });
  void qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) });
  void qc.invalidateQueries({ queryKey: PALCO_KEY });
}

export function useDefinirGanchoPadrao(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (presetId: string) => shortsApi.definirGanchoPadrao(corteId, presetId),
    onSuccess: () => invalidarGancho(qc, corteId),
  });
}

export function useSeguirGanchoPadrao(corteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => shortsApi.seguirGanchoPadrao(corteId),
    onSuccess: () => invalidarGancho(qc, corteId),
  });
}

/** Regravar um preset muda o que os trechos herdam — sem trocar o id escolhido. */
export function useInvalidarPadroes(corteId: string) {
  const qc = useQueryClient();
  return () => {
    invalidarGancho(qc, corteId);
    void qc.invalidateQueries({ queryKey: ['shorts', 'palco-padrao', corteId] });
  };
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

/** D-565 (onda 4): o quadro de capa gravado, e o instante sugerido. */
export function useCapaDoShort(shortId: string, habilitado = true) {
  return useQuery({
    queryKey: capaDoShortKey(shortId),
    queryFn: () => shortsApi.obterCapa(shortId),
    enabled: habilitado,
  });
}

/**
 * Tira o quadro e grava. A resposta NAO substitui o cache inteiro: ela traz so
 * o que mudou (caminho e instante), e sobrescrever apagaria `duracao_seg` e
 * `gancho_ate_seg`, que a regua usa — a tela ficaria sem escala depois do
 * primeiro clique.
 */
export function useGerarCapa(shortId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GerarCapaBody) => shortsApi.gerarCapa(shortId, body),
    onSuccess: (parcial) =>
      qc.setQueryData(capaDoShortKey(shortId), (antigo: CapaDoShortApi | undefined) =>
        antigo ? { ...antigo, ...parcial } : antigo,
      ),
  });
}

/**
 * D-581: o prompt da arte da capa que ja esta gravado.
 *
 * Query separada da mutation, e GET separado do POST no backend, pelo mesmo
 * motivo: escrever custa uma chamada de IA de minutos, e abrir o modal nao pode
 * dispara-la. A tela le o gravado ao abrir; escrever e um clique.
 */
export function usePromptDaCapa(shortId: string, habilitado = true) {
  return useQuery({
    queryKey: promptDaCapaKey(shortId),
    queryFn: () => shortsApi.obterPromptDaCapa(shortId),
    enabled: habilitado,
  });
}

/**
 * D-581: pede o prompt ao capista.
 *
 * O resultado entra no cache na hora — igual as variacoes do gancho depois da
 * D-573. A chamada leva minutos, e esperar o refetch para o texto aparecer
 * faria o operador achar que o botao nao fez nada.
 */
export function useGerarPromptDaCapa(shortId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => shortsApi.gerarPromptDaCapa(shortId),
    onSuccess: (dados) => qc.setQueryData(promptDaCapaKey(shortId), dados),
  });
}

/** D-581: sobe a arte desenhada como capa. Ela substitui o quadro do video. */
export function useSubirArteDaCapa(shortId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arquivo: File) => shortsApi.subirArteDaCapa(shortId, arquivo),
    onSuccess: (parcial) =>
      qc.setQueryData(capaDoShortKey(shortId), (antigo: CapaDoShortApi | undefined) =>
        antigo ? { ...antigo, ...parcial } : antigo,
      ),
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
