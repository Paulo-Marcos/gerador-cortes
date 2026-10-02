import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mensagemDoRobo, retratoUrl, type PessoaDaCapa, type ProporcaoDaCapa } from './api';
import {
  useConfiguracaoCapaChatgpt,
  useElencoDaCapa,
  useFotoDaPessoa,
  useGerarNoChatGPT,
  useSubirFotoDaPessoa,
} from './useCapaNoChatGPT';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';

// D-804: o botão que troca o copiar-colar-no-ChatGPT por um clique.
//
// O robô abre o projeto do ChatGPT no Edge do operador, anexa as fichas, cola o
// prompt, espera e traz a imagem. Quem recebe a imagem é `entregar` — o mesmo
// upload do Ctrl+V desta capa —, então moldura, montagem e o que mais a capa
// fizer continuam onde sempre estiveram.
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
  proporcao: ProporcaoDaCapa;
  entregar: (arquivo: File) => Promise<unknown>;
  /** A capa está ocupada com outra coisa (subindo, montando). */
  desabilitado?: boolean;
  className?: string;
}

export function GerarNoChatGPT({
  prompt,
  promptDoElenco,
  proporcao,
  entregar,
  desabilitado,
  className,
}: Props) {
  const config = useConfiguracaoCapaChatgpt();
  const gerar = useGerarNoChatGPT(proporcao, entregar);
  const configurado = Boolean(config.data?.projeto_url);
  const texto = prompt?.trim() ?? '';
  const elenco = useElencoConferido((promptDoElenco ?? prompt)?.trim() ?? '', configurado);

  const motivo = !configurado
    ? 'Configure o projeto do ChatGPT em Canais → Capas no ChatGPT.'
    : !texto
      ? 'Gere o prompt da capa primeiro.'
      : `Abre o projeto no Edge, anexa as fichas e as fotos das pessoas, cola o prompt e traz a imagem ${proporcao}.`;

  return (
    <div className={cn('grid gap-1', className)}>
      <Button
        type="button"
        size="sm"
        disabled={desabilitado || gerar.isPending || !configurado || !texto}
        onClick={() => gerar.mutate({ prompt: texto, pessoas: fotosQueVao(elenco.pessoas) })}
        title={motivo}
      >
        {gerar.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name={ICONE_DO_CONCEITO.iaGera} />}
        {gerar.isPending ? 'Gerando no ChatGPT…' : 'Gerar no ChatGPT'}
      </Button>
      {gerar.isPending && (
        <span aria-live="polite" className="text-[10.5px] leading-snug text-[var(--wb-text-mute)]">
          cerca de 1 minuto — acompanhe na janela do Edge
        </span>
      )}
      {gerar.isError && (
        <span role="alert" className="text-[10.5px] leading-snug text-error">
          {mensagemDoRobo(gerar.error, 'Não consegui gerar no ChatGPT.')}
        </span>
      )}
      {configurado && texto && <ElencoDaCapa elenco={elenco} ocupado={gerar.isPending} />}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// O elenco da capa (D-840)
// --------------------------------------------------------------------------- //

type Pessoa = PessoaDaCapa & { versao?: number };

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
function useElencoConferido(origem: string, ligado: boolean): ElencoConferido {
  const sugerido = useElencoDaCapa(origem, ligado);
  // Guardado com a origem: prompt refeito é outra capa, e o sugerido volta.
  const [editado, setEditado] = useState<{ origem: string; pessoas: Pessoa[] } | null>(null);
  const pessoas = editado?.origem === origem ? editado.pessoas : sugerido.data;
  return {
    pessoas,
    buscando: sugerido.isFetching,
    versao: sugerido.dataUpdatedAt,
    editar: (mudar) => setEditado({ origem, pessoas: mudar(pessoas ?? []) }),
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
      <span className="text-[10.5px] leading-snug text-[var(--wb-text-mute)]">
        Pessoas na capa{elenco.buscando || buscar.isPending || subir.isPending ? ' · buscando fotos…' : ''}
      </span>
      <ul aria-label="Pessoas na capa" className="flex flex-wrap items-center gap-1">
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
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setNovo('')}
              title="Acrescentar alguém: a foto vem do banco de retratos ou da Wikipédia"
              className="flex items-center gap-1 rounded-full border border-dashed border-[var(--wb-border-soft)] px-2 py-1 text-[11px] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
            >
              <Icon name="user-plus" />
              pessoa
            </button>
          ) : (
            <input
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
              className="h-7 w-52 rounded-full border border-[var(--wb-border-soft)] bg-transparent px-2 text-[11px]"
            />
          )}
        </li>
      </ul>
      {erro && (
        <span role="alert" className="text-[10.5px] leading-snug text-error">
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
    <li className="flex items-center gap-1 rounded-full border border-[var(--wb-border-soft)] py-0.5 pl-0.5 pr-1.5 text-[11px] text-[var(--wb-text)]">
      <label
        title={slug ? `Trocar a foto de ${nome}` : `Subir uma foto de ${nome}`}
        className={cn('cursor-pointer', desabilitado && 'pointer-events-none opacity-60')}
      >
        {slug ? (
          <img
            src={retratoUrl(slug, versao)}
            alt={`Foto de ${nome}`}
            className="size-8 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-[var(--wb-warn-ink)] text-[var(--wb-warn-ink)]">
            <Icon name="image-plus" size={16} />
          </span>
        )}
        <input
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
      {!slug && <span className="text-[var(--wb-warn-ink)]">· sem foto</span>}
      <button
        type="button"
        onClick={onTirar}
        disabled={desabilitado}
        aria-label={`Tirar ${nome} da capa`}
        title={`Tirar ${nome} da capa`}
        className="rounded-full p-0.5 text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
      >
        <Icon name="x" />
      </button>
    </li>
  );
}
