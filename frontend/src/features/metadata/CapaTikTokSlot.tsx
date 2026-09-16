import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Clipboard, Copy, Film, ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveThumbUrl } from '@/lib/api';
import { shortsApi } from '@/features/shorts/shortsApi';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { SeloDeProvider } from '@/components/ui/selo-provider';
import { providerEmVoo, type ProviderIA } from '@/lib/providerIa';
import { useUltimaGeracao } from '@/lib/useUltimaGeracao';
import { lerImagemColada, SemImagemColada } from '@/features/shorts/imagemDaAreaDeTransferencia';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const inputCapaRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  // D-534: o caminho da capa nao muda quando ela e refeita — mesmo arquivo,
  // mesma URL —, entao o navegador servia a imagem do cache e o preview ficava
  // na versao velha. O contador quebra o cache a cada acao concluida.
  const [versao, setVersao] = useState(0);
  const base = resolveThumbUrl(projetoId, capaPath);
  const capaUrl = base ? `${base}${base.includes('?') ? '&' : '?'}v=${versao}` : base;

  const aoTerminar = () => {
    setErro('');
    setVersao((n) => n + 1);
    onAtualizou();
    void queryClient.invalidateQueries({ queryKey: ['export-status'] });
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
    } catch {
      // Área de transferência negada (foco, permissão). O prompt continua na
      // tela para seleção manual — o operador não fica sem ele.
      setErro('Não consegui copiar. Selecione o prompt abaixo e copie à mão.');
    }
  };

  return (
    <section className="grid gap-2 rounded-[10px] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2.5">
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-bold text-[var(--wb-text)]">Capa do TikTok</h4>
        <span className="font-code text-[10px] text-[var(--wb-text-dim)]">9:16</span>
      </header>

      <div className="flex items-start gap-2.5">
        <div className="aspect-[9/16] w-[76px] shrink-0 overflow-hidden rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)]">
          {capaUrl ? (
            <img src={capaUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center px-1 text-center text-[10px] leading-tight text-[var(--wb-text-dim)]">
              sem capa
            </div>
          )}
        </div>

        <div className="grid min-w-0 flex-1 content-start gap-1.5">
          {/* Passo 1: o prompt. */}
          {/* A coluna é estreita demais para rótulo e ícones na mesma linha: a
              legenda sobe e os dois provedores dividem a largura. */}
          <div className="grid gap-1">
            <span
              aria-live="polite"
              className="text-[10.5px] font-semibold text-[var(--wb-text-mute)]"
            >
              {promptEmVoo ? 'escrevendo…' : promptArte ? 'Refazer prompt' : 'Gerar prompt'}
            </span>
            <AcaoDeIa
              rotulo={promptArte ? 'Refazer prompt' : 'Gerar prompt'}
              descricao={
                promptArte ? 'Refazer o prompt da arte da capa' : 'Gerar o prompt da arte da capa'
              }
              emVoo={promptEmVoo}
              desabilitado={ocupado}
              onGerar={(provider) => escreverPrompt.mutate(provider)}
              apenasProvedores
              className="w-full"
            />
          </div>
          {!promptEmVoo && promptArte && (
            <SeloDeProvider provider={arteGeradaPor} modelo={ultimaArte.data?.model} />
          )}

          {promptArte && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => void copiar()}
              title="Copiar para colar no agente capista."
            >
              {copiado ? <Check /> : <Copy />}
              {copiado ? 'copiado' : 'Copiar prompt'}
            </Button>
          )}

          {/* Passo 2: a arte de volta. Subir já monta a capa — quem acabou de
              trazer a imagem quer ver o resultado, não um segundo botão. */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={ocupado}
            onClick={() => inputRef.current?.click()}
            title="A ilustração 16:9 gerada no agente. O sistema desenha a etiqueta por cima."
          >
            {subirArte.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            Subir arte 16:9
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={ocupado}
            onClick={() => colar.mutate()}
            title="Sobe a imagem que está na área de transferência e monta a capa."
          >
            {colar.isPending ? <Loader2 className="animate-spin" /> : <Clipboard />}
            Colar arte
          </Button>

          {/* Input próprio, disparado por clique, e não um `<label>` embrulhando
              o botão: o card em volta captura Ctrl+V para a thumbnail do
              YouTube, e um segundo alvo de arquivo no fluxo de foco disputaria
              o mesmo evento. */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const arquivo = event.target.files?.[0];
              if (arquivo) subirArte.mutate(arquivo);
              event.currentTarget.value = '';
            }}
          />

          {/* D-534: era um link chamado "remontar com a arte atual", e o nome
              escondia a única coisa que se faz com ele. Quem muda o texto de
              capa procura um botão de ATUALIZAR O TEXTO — e desistia de achar,
              porque o rótulo falava de arte. A ação é a mesma; o nome agora é o
              da intenção. */}
          {capaPath && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => montar.mutate({})}
              title="Refaz a capa com o texto de capa atual, reusando a mesma arte."
            >
              {montar.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Atualizar texto
            </Button>
          )}

          {/* A capa PRONTA, montada por fora. Escape hatch de quem quer controle
              total do quadro — some do fluxo normal porque, usada por engano no
              lugar da arte, entrega uma imagem sem a etiqueta e sem o selo. */}
          <button
            type="button"
            disabled={ocupado}
            onClick={() => inputCapaRef.current?.click()}
            className="text-left text-[10px] text-[var(--wb-text-dim)] underline-offset-2 hover:underline disabled:opacity-50"
            title="Sobe a capa 1080x1920 inteira, já com texto — o sistema não desenha nada por cima."
          >
            subir capa pronta 9:16
          </button>
          <input
            ref={inputCapaRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const arquivo = event.target.files?.[0];
              if (arquivo) subirCapaPronta.mutate(arquivo);
              event.currentTarget.value = '';
            }}
          />

          <button
            type="button"
            disabled={ocupado}
            onClick={() => montar.mutate({ origem: 'frame' })}
            className="inline-flex items-center gap-1 text-[10px] text-[var(--wb-text-dim)] underline-offset-2 hover:underline disabled:opacity-50"
            title="Sem arte: usa um quadro do próprio vídeo. Costuma ficar pior."
          >
            <Film size={10} aria-hidden />
            usar frame do vídeo
          </button>

          {etiqueta && (
            <p className="truncate font-code text-[10px] uppercase text-[var(--wb-text-mute)]">
              {etiqueta}
            </p>
          )}
        </div>
      </div>

      {promptArte && (
        <textarea
          readOnly
          value={promptArte}
          rows={3}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full resize-y rounded-[6px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 py-1.5 font-code text-[10px] leading-[1.5] text-[var(--wb-text-mute)] outline-none focus:border-[var(--wb-accent)]"
        />
      )}

      {erro && <p className="text-[11px] leading-snug text-[var(--wb-warn-ink)]">{erro}</p>}
    </section>
  );
}
