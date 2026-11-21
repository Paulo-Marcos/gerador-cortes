import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ImagemAmpliavel } from '@/components/ui/imagem-ampliavel';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  fotoDoApresentadorUrl,
  mensagemDoRobo as texto,
  type EstiloDaCapa,
  type Protagonista,
} from './api';
import {
  useEstiloDaCapa,
  useGravarEstiloDaCapa,
  useRemoverFotoDoApresentador,
  useSubirFotoDoApresentador,
} from './useEstiloDaCapa';
import { Icon } from '@/upgrade/Icon';

// D-909: como as capas do canal saem — quem protagoniza (o mascote OU o
// apresentador, nunca os dois), as fotos do apresentador que o robô anexa e a
// meta de claridade do aviso de capa escura. Trocar o protagonista não apaga
// nada: fichas e fotos ficam guardadas para a volta.

export const PROTAGONISTAS: { valor: Protagonista; rotulo: string; dica: string }[] = [
  { valor: 'mascote', rotulo: 'Mascote', dica: 'O personagem do canal no centro, com as fichas dele.' },
  {
    valor: 'apresentador',
    rotulo: 'Apresentador',
    dica: 'O apresentador da live no centro, com as fotos abaixo. O mascote sai da capa.',
  },
];

export function EstiloDaCapaSection() {
  const estilo = useEstiloDaCapa();

  return (
    <section data-sala=""
      className="grid gap-3 rounded-cartao border border-fio bg-vidro p-5">
      <h2 className="text-secao text-fg">Estilo das capas</h2>
      <p className="text-corpo text-fg-2">
        Vale para as três capas: a thumbnail do YouTube, a arte do TikTok/Reels e a capa do short.
      </p>
      {estilo.data && (
        <>
          <EscolhaDoProtagonista estilo={estilo.data} />
          {estilo.data.protagonista === 'apresentador' ? (
            <FotosDoApresentador estilo={estilo.data} />
          ) : (
            <ReferenciaGuardada
              quantas={estilo.data.fotos_do_apresentador.length}
              singular="foto do apresentador guardada"
              plural="fotos do apresentador guardadas"
              protagonista="Apresentador"
            />
          )}
          <MetaDeClaridade estilo={estilo.data} />
        </>
      )}
    </section>
  );
}

/**
 * D-939: a referência do protagonista que NÃO foi escolhido sai da tela, mas
 * não do disco — esta linha diz quantas ficam guardadas e como trazê-las.
 */
export function ReferenciaGuardada({
  quantas,
  singular,
  plural,
  protagonista,
}: {
  quantas: number;
  singular: string;
  plural: string;
  protagonista: string;
}) {
  if (quantas === 0) return null;
  return (
    <p className="text-micro text-fg-3">
      {quantas} {quantas === 1 ? singular : plural}. Para voltar a usar, escolha {protagonista}{' '}
      como protagonista.
    </p>
  );
}

export function EscolhaDoProtagonista({ estilo }: { estilo: EstiloDaCapa }) {
  const { notify } = useToast();
  const gravar = useGravarEstiloDaCapa();

  const escolher = (protagonista: Protagonista) =>
    gravar.mutate(
      { ...estilo, protagonista },
      {
        onSuccess: () => notify('Protagonista das capas salvo.', { tone: 'success' }),
        onError: (erro) => notify(texto(erro, 'Erro ao salvar o protagonista.'), { tone: 'error' }),
      },
    );

  return (
    <div className="grid gap-1.5">
      <span className="text-linha text-fg">Protagonista</span>
      <div role="radiogroup" aria-label="Protagonista das capas" className="grid gap-2 sm:grid-cols-2">
        {PROTAGONISTAS.map((opcao) => {
          const ativo = estilo.protagonista === opcao.valor;
          return (
            <button
              key={opcao.valor}
              type="button"
              role="radio"
              data-sala=""
              aria-checked={ativo}
              disabled={gravar.isPending}
              onClick={() => !ativo && escolher(opcao.valor)}
              className={cn(
                'grid gap-0.5 rounded-bloco border p-3 text-left transition-colors duration-150 motion-reduce:transition-none',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
                'disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-fg-off',
                ativo
                  ? 'border-iris-fio bg-iris-suave'
                  : 'border-fio bg-vidro hover:border-fio-2 hover:bg-vidro-2',
              )}
            >
              <span className="text-corpo font-semibold text-fg">{opcao.rotulo}</span>
              <span className="text-micro text-fg-2">{opcao.dica}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FotosDoApresentador({ estilo }: { estilo: EstiloDaCapa }) {
  const { notify } = useToast();
  const subir = useSubirFotoDoApresentador();
  const remover = useRemoverFotoDoApresentador();
  const seletor = useRef<HTMLInputElement>(null);
  // Fura o cache das miniaturas: subir uma foto com o mesmo nome a substitui.
  const [versao, setVersao] = useState(0);

  const fotos = estilo.fotos_do_apresentador;
  const cheio = fotos.length >= estilo.maximo_de_fotos;

  const aoSubir = async (arquivos: File[]) => {
    for (const arquivo of arquivos) {
      try {
        await subir.mutateAsync(arquivo);
      } catch (erro) {
        notify(texto(erro, `Erro ao subir ${arquivo.name}.`), { tone: 'error' });
      }
    }
    setVersao((v) => v + 1);
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-linha text-fg">
          Fotos do apresentador ({fotos.length})
        </span>
        <Button
          type="button"
          variant="secundario"
          size="pq"
          carregando={subir.isPending}
          disabled={cheio}
          onClick={() => seletor.current?.click()}
        >
          <Icon name="image-plus" />
          Adicionar fotos
        </Button>
      </div>
      <input
        ref={seletor}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        aria-label="Adicionar fotos do apresentador"
        className="hidden"
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (arquivos.length) void aoSubir(arquivos);
        }}
      />
      <span className="text-micro text-fg-3">
        O nome do arquivo é a expressão: <span className="font-mono">pensativo.jpg</span>,{' '}
        <span className="font-mono">indignado-2.png</span>. A IA escolhe até 3 que combinam com o
        corte; subir o mesmo nome troca a foto.
      </span>
      {estilo.expressoes.length > 0 && (
        <p className="text-micro text-fg-2">
          Expressões: {estilo.expressoes.join(', ')}
        </p>
      )}
      {fotos.length > 0 && (
        <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
          {fotos.map((nome) => (
            <FotoDoApresentador
              key={nome}
              nome={nome}
              versao={versao}
              desabilitado={remover.isPending}
              onRemover={() =>
                remover.mutate(nome, {
                  onError: (erro) => notify(texto(erro, 'Erro ao remover a foto.'), { tone: 'error' }),
                })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function MetaDeClaridade({ estilo }: { estilo: EstiloDaCapa }) {
  const { notify } = useToast();
  const gravar = useGravarEstiloDaCapa();
  const [luz, setLuz] = useState(String(estilo.luminancia_minima));
  const [escuros, setEscuros] = useState(String(estilo.escuros_maximo));
  useEffect(() => setLuz(String(estilo.luminancia_minima)), [estilo.luminancia_minima]);
  useEffect(() => setEscuros(String(estilo.escuros_maximo)), [estilo.escuros_maximo]);

  const mudou =
    Number(luz) !== estilo.luminancia_minima || Number(escuros) !== estilo.escuros_maximo;

  const aoSalvar = () =>
    gravar.mutate(
      { ...estilo, luminancia_minima: Number(luz), escuros_maximo: Number(escuros) },
      {
        onSuccess: () => notify('Meta de claridade salva.', { tone: 'success' }),
        onError: (erro) => notify(texto(erro, 'Erro ao salvar a meta.'), { tone: 'error' }),
      },
    );

  return (
    <div className="grid gap-1.5">
      <span className="text-linha text-fg">Meta de claridade</span>
      <div className="flex flex-wrap items-end gap-2">
        <Field rotulo="Luz média mínima (0–255)" className="w-36">
          <Input aparencia="sala" type="number" min={0} max={255} value={luz} onChange={(e) => setLuz(e.target.value)} />
        </Field>
        <Field rotulo="Pixels escuros no máximo (%)" className="w-44">
          <Input aparencia="sala" type="number" min={0} max={100} value={escuros} onChange={(e) => setEscuros(e.target.value)} />
        </Field>
        <Button type="button" variant="secundario" carregando={gravar.isPending} onClick={aoSalvar} disabled={!mudou}>
          Salvar
        </Button>
      </div>
      <span className="text-micro text-fg-3">
        Abaixo dela, a capa do YouTube ganha um aviso. Escuro é pixel com luz abaixo de 50.
      </span>
    </div>
  );
}

function FotoDoApresentador({
  nome,
  versao,
  desabilitado,
  onRemover,
}: {
  nome: string;
  versao: number;
  desabilitado: boolean;
  onRemover: () => void;
}) {
  return (
    <li
      className="grid grid-cols-1 gap-1 rounded-ladrilho border border-fio bg-poco p-1.5"
    >
      <ImagemAmpliavel
        src={fotoDoApresentadorUrl(nome, versao)}
        alt={nome}
        className="w-full"
        imgClassName="aspect-square w-full rounded-etiqueta object-cover"
      />
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate font-mono text-micro text-fg-2">{nome}</span>
        <button
          type="button"
          aria-label={`Remover ${nome}`}
          disabled={desabilitado}
          onClick={onRemover}
          data-sala=""
          className="rounded-etiqueta p-1 text-fg-3 transition-colors hover:text-erro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:text-fg-off motion-reduce:transition-none"
        >
          <Icon name="trash-2" />
        </button>
      </div>
    </li>
  );
}
