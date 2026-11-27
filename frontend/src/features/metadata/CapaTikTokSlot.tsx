import { useRef, useState, type ComponentProps } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Textarea } from '@/components/ui/textarea';
import { ImagemAmpliavel } from '@/components/ui/imagem-ampliavel';
import { resolveThumbUrl } from '@/lib/api';
import { shortsApi } from '@/features/shorts/shortsApi';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { SeloDeProvider } from '@/components/ui/selo-provider';
import { providerEmVoo, type ProviderIA } from '@/lib/providerIa';
import { useUltimaGeracao } from '@/features/ia';
import { lerImagemColada, SemImagemColada } from '@/features/shorts/imagemDaAreaDeTransferencia';
import { exportStatusKey } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { GerarNoChatGPT } from '@/features/capa-chatgpt/GerarNoChatGPT';
import { metadadosApi } from './api/metadados';
import { EstiloDaCapaModal } from './EstiloDaCapaModal';
import { MaisDaCapa, type GrupoDoMais } from './MaisDaCapa';
import { metadataKey } from './useMetadataCard';

// D-521: a capa VERTICAL, ao lado da thumbnail do YouTube.
//
// As duas ficam no mesmo card de propósito. São imagens diferentes para
// trabalhos diferentes — 16:9 é o cartaz que disputa o clique numa lista; 9:16 é
// a vitrine do perfil do TikTok, onde nove capas são vistas juntas — e é
// justamente por serem parecidas no nome que precisam estar lado a lado: separá-
// las de tela esconderia do operador que existem duas, e a errada acabaria
// subindo.
//
// D-523/D-524: a faixa central leva ARTE, e não um frame do vídeo. O frame
// parecia a escolha honesta — a capa citaria o que vai tocar —, mas o vídeo é
// deitado e costuma ter texto na tela, e nada disso sobrevive à miniatura da
// grade.
//
// ## O fluxo é manual, igual ao do horizontal
//
// O app escreve o prompt; quem desenha é o operador, no agente capista dele. É
// o mesmo caminho que a D-413 consolidou na thumbnail do YouTube — copiar o
// prompt, gerar a imagem, trazer de volta —, e a razão é a mesma: capa é peça
// editorial, e ninguém publica a primeira que sai sem olhar.
//
// Daí a ordem dos botões ser a ordem do trabalho: prompt, arte, capa.
//
// ## Por que COLAR é botão, e não Ctrl+V
//
// A thumbnail do YouTube aceita Ctrl+V porque o card inteiro escuta `paste`.
// Herdar isso aqui poria dois ouvintes do mesmo evento na mesma árvore, e a
// imagem cairia no slot errado — o de cima, que é 16:9. O botão não tem essa
// ambiguidade: o alvo é onde se clicou.

interface Props {
  projetoId: string;
  corteId: string;
  /** `thumbnail_tiktok_path` do metadado, relativo ao projeto. */
  capaPath?: string;
  /** O prompt da arte, quando já foi escrito. */
  promptArte?: string;
  /** A etiqueta gravada na última montagem. */
  etiqueta?: string;
  /**
   * O texto de capa COMO ESTÁ NA TELA (D-534).
   *
   * Não é redundante com o que o backend leria do metadado: o campo salva no
   * `blur`, e o clique neste bloco dispara o blur e a montagem quase juntos.
   * Duas requisições independentes, sem ordem garantida — a capa saía com o
   * texto ANTERIOR, e o operador via o botão "funcionar" sem mudar nada.
   */
  textoCapa?: string;
  /** Recarrega o metadado depois de cada passo. */
  onAtualizou: () => void;
}

export function CapaTikTokSlot({
  projetoId,
  corteId,
  capaPath,
  promptArte,
  etiqueta,
  textoCapa,
  onAtualizou,
}: Props) {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [estilizando, setEstilizando] = useState(false);
  const arteRef = useRef<HTMLInputElement>(null);
  const prontaRef = useRef<HTMLInputElement>(null);
  // D-534: o caminho da capa nao muda quando ela e refeita — mesmo arquivo,
  // mesma URL —, entao o navegador servia a imagem do cache e o preview ficava
  // na versao velha. D-968: a hora da leitura do metadado (só assina a do card,
  // sem buscar), e não um contador, que zerava ao reabrir o modal ou trocar de aba.
  const versao = useQuery({ queryKey: metadataKey(corteId), enabled: false }).dataUpdatedAt;
  const base = resolveThumbUrl(projetoId, capaPath);
  const capaUrl = base ? `${base}${base.includes('?') ? '&' : '?'}v=${versao}` : base;

  const aoTerminar = () => {
    setErro('');
    onAtualizou();
    // D-658: a chave real é ['projeto', id, 'export-status'] — `['export-status']`
    // não é prefixo dela, e a invalidação não atingia nada (o polling de 8 s
    // escondia o defeito).
    void queryClient.invalidateQueries({ queryKey: exportStatusKey(projetoId) });
  };

  const escreverPrompt = useMutation({
    mutationFn: (provider: ProviderIA = 'claude') =>
      shortsApi.gerarPromptCapaTiktok(corteId, provider),
    onSuccess: aoTerminar,
    onError: (e: Error) => setErro(e.message),
  });

  const promptEmVoo = providerEmVoo(escreverPrompt);
  const ultimaArte = useUltimaGeracao('capa-tiktok-imagem-expert', { corteId });
  const arteGeradaPor = escreverPrompt.variables ?? ultimaArte.data?.provider ?? null;

  const subirArte = useMutation({
    mutationFn: (arquivo: File) => shortsApi.subirArteCapaTiktok(corteId, arquivo),
    onSuccess: aoTerminar,
    onError: (e: Error) => setErro(e.message),
  });

  const colar = useMutation({
    mutationFn: async () => {
      const arquivo = await lerImagemColada();
      return shortsApi.subirArteCapaTiktok(corteId, arquivo);
    },
    onSuccess: aoTerminar,
    onError: (e: Error) => {
      // Sem imagem e permissão negada pedem coisas diferentes do operador:
      // copiar de novo, ou liberar o acesso no navegador.
      setErro(
        e instanceof SemImagemColada
          ? e.message
          : `Não consegui ler a área de transferência: ${e.message}`,
      );
    },
  });

  const subirCapaPronta = useMutation({
    mutationFn: (arquivo: File) => shortsApi.subirCapaTiktok(corteId, arquivo),
    onSuccess: aoTerminar,
    onError: (e: Error) => setErro(e.message),
  });

  const montar = useMutation({
    // O texto vai EXPLICITO: manda o que esta na tela em vez de deixar o
    // backend reler o metadado, que pode nao ter sido gravado ainda.
    mutationFn: (opcoes: { origem?: 'ia' | 'frame' } = {}) =>
      shortsApi.gerarCapaTiktok(corteId, { etiqueta: textoCapa?.trim() || '', ...opcoes }),
    onSuccess: aoTerminar,
    onError: (e: Error) => setErro(e.message),
  });

  const ocupado =
    escreverPrompt.isPending ||
    subirArte.isPending ||
    colar.isPending ||
    subirCapaPronta.isPending ||
    montar.isPending;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(promptArte ?? '');
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1400);
    } catch {
      // Área de transferência negada (foco, permissão). O prompt continua na
      // tela para seleção manual — o operador não fica sem ele.
      setErro('Não consegui copiar. Selecione o prompt abaixo e copie à mão.');
    }
  };

  // D-1167 (§7.5): o "Mais" em dois grupos. Arte mexe na imagem; Prompt, no texto que a gera.
  const semCapa = 'Ainda não há capa para atualizar.';
  const semPrompt = 'Gere o prompt da arte primeiro.';
  const grupos: GrupoDoMais[] = [
    {
      rotulo: 'Arte',
      itens: [
        { icone: 'clipboard', rotulo: 'Colar arte', dica: 'Sobe a imagem que está na área de transferência e monta a capa.', onSelect: () => colar.mutate() },
        { icone: 'film', rotulo: 'Usar quadro do vídeo', dica: 'Sem arte: usa um quadro do próprio vídeo. Costuma ficar pior.', onSelect: () => montar.mutate({ origem: 'frame' }) },
        { icone: 'palette', rotulo: 'Estilizar capa', dica: 'Escolhe o estilo da capa do canal, o que aparece e onde cada componente fica.', onSelect: () => setEstilizando(true) },
        { icone: 'refresh-cw', rotulo: 'Atualizar texto', desligado: !capaPath, dica: capaPath ? 'Refaz a capa com o texto de capa atual, reusando a mesma arte.' : semCapa, onSelect: () => montar.mutate({}) },
        { icone: 'image-plus', rotulo: 'Subir capa pronta 9:16', dica: 'Sobe a capa 1080x1920 inteira, já com texto — o sistema não desenha nada por cima.', onSelect: () => prontaRef.current?.click() },
      ],
    },
    {
      rotulo: 'Prompt',
      itens: [
        { icone: copiado ? 'check' : 'copy', rotulo: copiado ? 'Copiado' : 'Copiar', desligado: !promptArte, dica: promptArte ? 'Copiar para colar no agente capista.' : semPrompt, onSelect: () => void copiar() },
        { icone: 'sparkle', rotulo: 'Refazer com o Claude', onSelect: () => escreverPrompt.mutate('claude') },
        { icone: 'sparkle', rotulo: 'Refazer com o Gemini', onSelect: () => escreverPrompt.mutate('gemini') },
      ],
    },
  ];

  return (
    <section aria-label="Capa do TikTok" className="grid gap-3 rounded-bloco border border-fio bg-vidro p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="text-linha text-fg">Capa do TikTok</h4>
        <span className="num text-fg-3">9:16</span>
      </header>

      <div className="flex items-start gap-3">
        <div className="aspect-[9/16] w-[112px] shrink-0 overflow-hidden rounded-capa border border-fio-2 bg-vidro-3">
          {capaUrl ? (
            <ImagemAmpliavel src={capaUrl} alt="Capa do TikTok" className="h-full w-full" imgClassName="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center px-1 text-center text-micro text-fg-3">sem capa</div>
          )}
        </div>

        <div className="grid min-w-0 flex-1 content-start gap-2">
          {/* A geração por IA vem primeiro quando ainda não há prompt; depois o "Mais" a leva
              ("Refazer com o Claude/Gemini"). O rótulo vivo diz o que está rodando. */}
          {!promptArte && (
            <div className="grid gap-1">
              <span aria-live="polite" className="text-pequeno text-fg-3">
                {promptEmVoo ? 'escrevendo…' : 'Gerar prompt'}
              </span>
              <AcaoDeIa
                rotulo="Gerar prompt"
                descricao="Gerar o prompt da arte da capa"
                emVoo={promptEmVoo}
                desabilitado={ocupado}
                onGerar={(provider) => escreverPrompt.mutate(provider)}
                apenasProvedores
                aparencia="sala-escura"
                className="w-full"
              />
            </div>
          )}
          {!promptEmVoo && promptArte && (
            <SeloDeProvider provider={arteGeradaPor} modelo={ultimaArte.data?.model} />
          )}
          <GerarArteNoChatGPT
            corteId={corteId}
            prompt={promptArte}
            aoConcluir={aoTerminar}
            desabilitado={ocupado}
          />
          <div className="flex flex-wrap items-center gap-2">
            {/* Subir já monta a capa — quem acabou de trazer a imagem quer ver o resultado,
                não um segundo botão. */}
            <Button
              type="button"
              size="pq"
              variant="secundario"
              disabled={ocupado}
              carregando={subirArte.isPending}
              onClick={() => arteRef.current?.click()}
              title="A ilustração 4:5 gerada no agente. O sistema desenha a etiqueta por cima."
            >
              <Icon name="image-plus" />
              Subir arte
            </Button>
            <MaisDaCapa rotulo="Mais da capa do TikTok" grupos={grupos} desabilitado={ocupado} />
          </div>
          {etiqueta && <p className="truncate text-micro text-fg-3">{etiqueta}</p>}
        </div>
      </div>

      {/* Inputs próprios, disparados por clique, e não um `<label>` embrulhando o botão: a
          tela captura Ctrl+V para a thumbnail do YouTube, e um segundo alvo de arquivo no
          fluxo de foco disputaria o mesmo evento. */}
      <input name="arquivo"
        ref={arteRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const arquivo = event.target.files?.[0];
          if (arquivo) subirArte.mutate(arquivo);
          event.currentTarget.value = '';
        }}
      />
      <input name="arquivo"
        ref={prontaRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const arquivo = event.target.files?.[0];
          if (arquivo) subirCapaPronta.mutate(arquivo);
          event.currentTarget.value = '';
        }}
      />

      {promptArte && (
        <Textarea name="prompt_arte"
          readOnly
          value={promptArte}
          rows={3}
          aria-label="Prompt da arte da capa"
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-0 font-mono text-micro"
        />
      )}

      {erro && (
        <p role="alert" className="text-pequeno text-aviso">
          {erro}
        </p>
      )}

      {/* Montado só aberto: fechado, o painel (que traz a arte inteira) nem é pedido. */}
      {estilizando && (
        <EstiloDaCapaModal
          open
          onClose={() => setEstilizando(false)}
          corteId={corteId}
          etiqueta={textoCapa?.trim() || etiqueta || ''}
          refazCapa={Boolean(capaPath)}
          onSalvou={() => capaPath && montar.mutate({})}
        />
      )}
    </section>
  );
}

/**
 * A arte 4:5 gerada no ChatGPT (D-804). O elenco vem do prompt da thumbnail
 * (D-840): é ele que traz as pessoas reais, e a arte nasce dele. A chave é a do
 * card, então o metadado já está em cache.
 */
function GerarArteNoChatGPT({
  corteId,
  ...props
}: { corteId: string } & Omit<ComponentProps<typeof GerarNoChatGPT>, 'destino' | 'alvoId'>) {
  const metadado = useQuery({
    queryKey: metadataKey(corteId),
    queryFn: () => metadadosApi.obterMetadado(corteId),
  });
  return (
    <GerarNoChatGPT
      {...props}
      destino="tiktok"
      alvoId={corteId}
      promptDoElenco={metadado.data?.prompt_thumbnail ?? ''}
    />
  );
}
