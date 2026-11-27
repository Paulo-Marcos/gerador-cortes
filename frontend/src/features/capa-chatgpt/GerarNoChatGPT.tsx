import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  mensagemDoRobo,
  PROPORCAO_DO_DESTINO,
  retratoUrl,
  type DestinoDaCapa,
  type PedidoCapaChatgpt,
} from './api';
import {
  pedidoEmVoo,
  useConfiguracaoCapaChatgpt,
  useElencoDaCapa,
  useElencoEditado,
  useFotoDaPessoa,
  usePedidoDaCapa,
  usePedirNoChatGPT,
  useSubirFotoDaPessoa,
  type PessoaDoElenco,
} from './useCapaNoChatGPT';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';

// D-804: o botão que troca o copiar-colar-no-ChatGPT por um clique.
//
// O robô abre o projeto do ChatGPT no Edge do operador, anexa as fichas, cola o
// prompt, espera e traz a imagem.
//
// D-898: o clique põe a capa na FILA do backend, que salva a imagem pelo mesmo
// caminho do Ctrl+V desta capa (moldura, montagem) e guarda o passo e o motivo
// de uma parada. Antes o modal esperava a imagem e era ele quem a salvava:
// fechou o modal, o erro sumia — e a aba do robô ficava aberta sem explicação.
// O andamento também aparece na Fila global.
//
// D-899: "Gerar prompt" já põe a imagem na fila pelo backend; este botão fica
// para pedir outra versão. Por isso a leitura do pedido segue o prompt.
//
// A janela do Edge fica aberta de propósito: se a imagem não agradar, o
// operador pede outra versão ali mesmo e cola do jeito antigo.
//
// D-840: junto das fichas do mascote vai a foto de cada pessoa real da capa, do
// banco de retratos. O elenco aparece embaixo do botão, já com as fotos, para
// o operador ver ANTES de gerar se a foto é mesmo da pessoa ("Lula" sozinho, na
// Wikipédia, é o molusco), trocá-la, tirar quem não é gente ou pôr quem faltou.

interface Props {
  /** O prompt da capa; sem ele não há o que mandar. */
  prompt?: string;
  /**
   * De onde sai o elenco, quando não é o próprio `prompt`: a arte do TikTok e a
   * capa do short nascem do prompt da thumbnail, que é quem traz as tags.
   */
  promptDoElenco?: string;
  destino: DestinoDaCapa;
  /** O corte (youtube, tiktok) ou o short que recebe a imagem. */
  alvoId: string;
  /** A imagem chegou à capa: hora de reler o que a tela mostra dela. */
  aoConcluir?: () => void;
  /** A capa está ocupada com outra coisa (subindo, montando). */
  desabilitado?: boolean;
  className?: string;
}

export function GerarNoChatGPT({
  prompt,
  promptDoElenco,
  destino,
  alvoId,
  aoConcluir,
  desabilitado,
  className,
}: Props) {
  const config = useConfiguracaoCapaChatgpt();
  const pedir = usePedirNoChatGPT(destino, alvoId);
  const configurado = Boolean(config.data?.projeto_url);
  const texto = prompt?.trim() ?? '';
  const pedido = usePedidoDaCapa(destino, alvoId, texto, aoConcluir).data;
  const ocupado = pedir.isPending || pedidoEmVoo(pedido);
  const elenco = useElencoConferido(destino, alvoId, (promptDoElenco ?? prompt)?.trim() ?? '', configurado);

  const motivo = !configurado
    ? 'Configure o projeto do ChatGPT em Canais → Capas no ChatGPT.'
    : !texto
      ? 'Gere o prompt da capa primeiro.'
      : `Abre o projeto no Edge, anexa as fichas e as fotos das pessoas, cola o prompt e salva a imagem ${PROPORCAO_DO_DESTINO[destino]} nesta capa.`;

  return (
    <div className={cn('grid gap-1', className)}>
      <Button
        type="button"
        variant="secundario"
        size="pq"
        carregando={ocupado}
        disabled={desabilitado || !configurado || !texto}
        onClick={() => pedir.mutate({ prompt: texto, pessoas: fotosQueVao(elenco.pessoas) })}
        title={motivo}
      >
        {!ocupado && <Icon name={ICONE_DO_CONCEITO.iaGera} />}
        {ocupado ? 'Gerando no ChatGPT…' : 'Gerar no ChatGPT'}
      </Button>
      {pedir.isError ? (
        <span role="alert" className="text-micro text-erro">
          {mensagemDoRobo(pedir.error, 'Não consegui pedir ao ChatGPT.')}
        </span>
      ) : (
        <AndamentoDoPedido pedido={pedido} />
      )}
      {configurado && texto && <ElencoDaCapa elenco={elenco} ocupado={ocupado} />}
    </div>
  );
}

/** Em que passo o robô está nesta capa — ou por que parou, até o próximo pedido. */
export function AndamentoDoPedido({ pedido }: { pedido?: PedidoCapaChatgpt | null }) {
  if (!pedido) return null;
  if (pedido.estado === 'erro') {
    return (
      <span role="alert" className="text-micro text-erro">
        Parou em “{pedido.etapa}”: {pedido.erro}
      </span>
    );
  }
  const texto =
    pedido.estado === 'concluido'
      ? 'Capa pronta, salva pelo robô.'
      : pedido.estado === 'cancelado'
        ? 'Cancelado na fila — peça de novo quando quiser.'
        : pedido.estado === 'aguardando'
          ? 'Na fila do ChatGPT — a Fila mostra a ordem.'
          : `${pedido.etapa} — acompanhe na janela do Edge.`;
  return (
    <span aria-live="polite" className="text-micro text-fg-2">
      {texto}
    </span>
  );
}

// --------------------------------------------------------------------------- //
// O elenco da capa (D-840)
// --------------------------------------------------------------------------- //

type Pessoa = PessoaDoElenco;

/** A lista com `pessoa` no lugar de quem tem o mesmo nome, ou no fim. */
export function comPessoa(lista: Pessoa[], pessoa: Pessoa): Pessoa[] {
  const mesma = (p: Pessoa) => p.nome.toLocaleLowerCase() === pessoa.nome.toLocaleLowerCase();
  return lista.some(mesma) ? lista.map((p) => (mesma(p) ? pessoa : p)) : [...lista, pessoa];
}

export const semPessoa = (lista: Pessoa[], nome: string) => lista.filter((p) => p.nome !== nome);

/**
 * Os nomes que o robô anexa: só quem tem foto. `undefined` enquanto o elenco não
 * chegou — o backend então o lê do prompt, e o clique não espera a Wikipédia.
 */
export const fotosQueVao = (pessoas?: Pessoa[]) =>
  pessoas?.filter((p) => p.slug).map((p) => p.nome);

interface ElencoConferido {
  pessoas?: Pessoa[];
  buscando: boolean;
  /** Quando o elenco sugerido chegou: fura o cache da foto trocada noutra capa. */
  versao: number;
  editar: (mudar: (atual: Pessoa[]) => Pessoa[]) => void;
}

/** O elenco sugerido pelo backend até o operador mexer; depois, o dele. */
export function useElencoConferido(
  destino: DestinoDaCapa,
  alvoId: string,
  origem: string,
  ligado: boolean,
): ElencoConferido {
  const sugerido = useElencoDaCapa(origem, ligado);
  // Guardado com a origem: prompt refeito é outra capa, e o sugerido volta.
  const [editado, guardar] = useElencoEditado(destino, alvoId, origem);
  const pessoas = editado ?? sugerido.data;
  return {
    pessoas,
    buscando: sugerido.isFetching,
    versao: sugerido.dataUpdatedAt,
    editar: (mudar) => guardar(mudar(pessoas ?? [])),
  };
}

function ElencoDaCapa({ elenco, ocupado }: { elenco: ElencoConferido; ocupado: boolean }) {
  const buscar = useFotoDaPessoa();
  const subir = useSubirFotoDaPessoa();
  const [novo, setNovo] = useState<string | null>(null);
  const erro = buscar.error ?? subir.error;

  const acrescentar = () => {
    const nome = novo?.trim();
    if (!nome) return setNovo(null);
    buscar.mutate(nome, {
      onSuccess: (pessoa) => {
        elenco.editar((lista) => comPessoa(lista, pessoa));
        setNovo(null);
      },
    });
  };
  const trocarFoto = (nome: string, arquivo: File) =>
    subir.mutate(
      { nome, arquivo },
      { onSuccess: (p) => elenco.editar((lista) => comPessoa(lista, { ...p, versao: Date.now() })) },
    );

  return (
    <div className="grid gap-1">
      <span className="text-micro text-fg-2">
        Pessoas na capa{elenco.buscando || buscar.isPending || subir.isPending ? ' · buscando fotos…' : ''}
      </span>
      <ul aria-label="Pessoas na capa" className="flex flex-wrap items-center gap-1.5">
        {(elenco.pessoas ?? []).map((pessoa) => (
          <ChipDaPessoa
            key={pessoa.nome}
            pessoa={pessoa}
            versao={pessoa.versao ?? elenco.versao}
            desabilitado={ocupado || subir.isPending}
            onFoto={(arquivo) => trocarFoto(pessoa.nome, arquivo)}
            onTirar={() => elenco.editar((lista) => semPessoa(lista, pessoa.nome))}
          />
        ))}
        <li>
          {novo === null ? (
            <Button
              type="button"
              variant="fantasma"
              size="pq"
              disabled={ocupado}
              onClick={() => setNovo('')}
              title="Acrescentar alguém: a foto vem do banco de retratos ou da Wikipédia"
            >
              <Icon name="user-plus" />
              pessoa
            </Button>
          ) : (
            <Input name="nome"
              aparencia="sala"
              autoFocus
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') acrescentar();
                if (e.key === 'Escape') setNovo(null);
              }}
              onBlur={() => !novo.trim() && setNovo(null)}
              disabled={buscar.isPending}
              placeholder="Nome completo, como na Wikipédia"
              aria-label="Nome da pessoa"
              className="h-[30px] w-60 rounded-pilula px-3 text-pequeno"
            />
          )}
        </li>
      </ul>
      {erro && (
        <span role="alert" className="text-micro text-erro">
          {mensagemDoRobo(erro, 'Não consegui buscar a foto.')}
        </span>
      )}
    </div>
  );
}

interface ChipProps {
  pessoa: Pessoa;
  versao: number;
  desabilitado: boolean;
  onFoto: (arquivo: File) => void;
  onTirar: () => void;
}

function ChipDaPessoa({ pessoa, versao, desabilitado, onFoto, onTirar }: ChipProps) {
  const { nome, slug } = pessoa;
  return (
    <li data-sala=""
      className="flex items-center gap-1.5 rounded-pilula border border-fio-2 bg-vidro py-0.5 pl-0.5 pr-1.5 text-pequeno text-fg">
      <label
        title={slug ? `Trocar a foto de ${nome}` : `Subir uma foto de ${nome}`}
        className={cn(
          'cursor-pointer rounded-full focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-foco',
          desabilitado && 'pointer-events-none opacity-60',
        )}
      >
        {slug ? (
          <img
            src={retratoUrl(slug, versao)}
            alt={`Foto de ${nome}`}
            className="size-8 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-aviso text-aviso">
            <Icon name="image-plus" size={16} />
          </span>
        )}
        <input name="arquivo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={desabilitado}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = '';
            if (arquivo) onFoto(arquivo);
          }}
        />
      </label>
      <span>{nome}</span>
      {!slug && <span className="text-aviso">· sem foto</span>}
      <button
        type="button"
        onClick={onTirar}
        disabled={desabilitado}
        aria-label={`Tirar ${nome} da capa`}
        title={`Tirar ${nome} da capa`}
        data-sala=""
        className="rounded-full p-0.5 text-fg-2 transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:text-fg-off motion-reduce:transition-none"
      >
        <Icon name="x" />
      </button>
    </li>
  );
}
