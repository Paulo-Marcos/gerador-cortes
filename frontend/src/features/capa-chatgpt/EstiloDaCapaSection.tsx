import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
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
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <h2 className="text-lg font-semibold text-[var(--wb-text)]">Estilo das capas</h2>
      <p className="text-sm text-[var(--wb-text-mute)]">
        Vale para as três capas: a thumbnail do YouTube, a arte do TikTok/Reels e a capa do short.
      </p>
      {estilo.data && (
        <>
          <EscolhaDoProtagonista estilo={estilo.data} />
          <FotosDoApresentador estilo={estilo.data} />
          <MetaDeClaridade estilo={estilo.data} />
        </>
      )}
    </section>
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
      <span className="text-[12px] font-semibold text-[var(--wb-text)]">Protagonista</span>
      <div role="radiogroup" aria-label="Protagonista das capas" className="grid gap-2 sm:grid-cols-2">
        {PROTAGONISTAS.map((opcao) => {
          const ativo = estilo.protagonista === opcao.valor;
          return (
            <button
              key={opcao.valor}
              type="button"
              role="radio"
              aria-checked={ativo}
              disabled={gravar.isPending}
              onClick={() => !ativo && escolher(opcao.valor)}
              className={cn(
                'grid gap-0.5 rounded-[8px] border p-2.5 text-left transition-colors disabled:opacity-60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
                ativo
                  ? 'border-[var(--sel-line)] bg-[var(--sel-bg)]'
                  : 'border-[var(--wb-border)] hover:bg-[var(--wb-bg-card-elev)]',
              )}
            >
              <span className="text-[13px] font-semibold text-[var(--wb-text)]">{opcao.rotulo}</span>
              <span className="text-[11px] text-[var(--wb-text-mute)]">{opcao.dica}</span>
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
        <span className="text-[12px] font-semibold text-[var(--wb-text)]">
          Fotos do apresentador ({fotos.length})
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={subir.isPending || cheio}
          onClick={() => seletor.current?.click()}
        >
          {subir.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="image-plus" />}
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
      <span className="text-[11px] text-[var(--wb-text-dim)]">
        O nome do arquivo é a expressão: <span className="font-code">pensativo.jpg</span>,{' '}
        <span className="font-code">indignado-2.png</span>. A IA escolhe até 3 que combinam com o
        corte; subir o mesmo nome troca a foto.
      </span>
      {estilo.expressoes.length > 0 && (
        <p className="text-[11px] text-[var(--wb-text-mute)]">
          Expressões: {estilo.expressoes.join(', ')}
        </p>
      )}
      {fotos.length > 0 && (
        <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
          {fotos.map((nome) => (
            <li
              key={nome}
              className="grid gap-1 rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-1.5"
            >
              <ImagemAmpliavel
                src={fotoDoApresentadorUrl(nome, versao)}
                alt={nome}
                className="w-full"
                imgClassName="aspect-square w-full rounded-[6px] object-cover"
              />
              <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate font-code text-[11px] text-[var(--wb-text-mute)]">
                  {nome}
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${nome}`}
                  disabled={remover.isPending}
                  onClick={() =>
                    remover.mutate(nome, {
                      onError: (erro) => notify(texto(erro, 'Erro ao remover a foto.'), { tone: 'error' }),
                    })
                  }
                  className="rounded p-1 text-[var(--wb-text-dim)] hover:text-error disabled:opacity-50"
                >
                  <Icon name="trash-2" />
                </button>
              </div>
            </li>
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
      <span className="text-[12px] font-semibold text-[var(--wb-text)]">Meta de claridade</span>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-[11px] text-[var(--wb-text-mute)]">
          Luz média mínima (0–255)
          <Input type="number" min={0} max={255} value={luz} onChange={(e) => setLuz(e.target.value)} className="w-28" />
        </label>
        <label className="grid gap-1 text-[11px] text-[var(--wb-text-mute)]">
          Pixels escuros no máximo (%)
          <Input type="number" min={0} max={100} value={escuros} onChange={(e) => setEscuros(e.target.value)} className="w-28" />
        </label>
        <Button type="button" size="sm" onClick={aoSalvar} disabled={gravar.isPending || !mudou}>
          {gravar.isPending && <Icon name="loader-2" className="animate-spin" />}
          Salvar
        </Button>
      </div>
      <span className="text-[11px] text-[var(--wb-text-dim)]">
        Abaixo dela, a capa do YouTube ganha um aviso. Escuro é pixel com luz abaixo de 50.
      </span>
    </div>
  );
}
