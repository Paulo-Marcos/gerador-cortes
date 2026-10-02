import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImagemAmpliavel } from '@/components/ui/imagem-ampliavel';
import { useToast } from '@/components/ui/toaster';
import { fichaUrl, mensagemDoRobo as texto, type ConfiguracaoCapaChatgpt } from './api';
import {
  useConfiguracaoCapaChatgpt,
  useGravarProjetoChatgpt,
  useRemoverFichaChatgpt,
  useSubirFichaChatgpt,
} from './useCapaNoChatGPT';
import { Icon } from '@/upgrade/Icon';

// D-804: onde o robô gera as capas — o projeto do ChatGPT do canal e as fichas
// do mascote que vão anexas em todo pedido. Por canal, porque cada canal tem o
// seu personagem (e pode ter a sua conta).

export function CapaChatgptSection() {
  const config = useConfiguracaoCapaChatgpt();

  return (
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <h2 className="text-lg font-semibold text-[var(--wb-text)]">Capas no ChatGPT</h2>
      <p className="text-sm text-[var(--wb-text-mute)]">
        O botão “Gerar no ChatGPT” das capas abre este projeto no Edge, anexa as fichas abaixo,
        cola o prompt e traz a imagem de volta — pela sua assinatura, sem API. Na primeira vez,
        entre na sua conta na janela que o robô abrir; ela fica guardada.
      </p>
      <LinkDoProjeto salvo={config.data?.projeto_url ?? ''} />
      <FichasDoPersonagem config={config.data} />
    </section>
  );
}

function LinkDoProjeto({ salvo }: { salvo: string }) {
  const { notify } = useToast();
  const gravar = useGravarProjetoChatgpt();
  const [projeto, setProjeto] = useState('');
  useEffect(() => setProjeto(salvo), [salvo]);

  const aoSalvar = () =>
    gravar.mutate(projeto.trim(), {
      onSuccess: () => notify('Projeto do ChatGPT salvo.', { tone: 'success' }),
      onError: (erro) => notify(texto(erro, 'Erro ao salvar o projeto.'), { tone: 'error' }),
    });

  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--wb-text)]">Link do projeto</span>
      <div className="flex flex-wrap gap-2">
        <Input
          value={projeto}
          onChange={(e) => setProjeto(e.target.value)}
          placeholder="https://chatgpt.com/g/g-p-…/project"
          className="min-w-[280px] flex-1"
        />
        <Button
          type="button"
          size="sm"
          onClick={aoSalvar}
          disabled={gravar.isPending || projeto.trim() === salvo}
        >
          {gravar.isPending && <Icon name="loader-2" className="animate-spin" />}
          Salvar
        </Button>
      </div>
      <span className="text-[11px] text-[var(--wb-text-dim)]">
        Abra o projeto no ChatGPT e copie a barra de endereço. Vazio desliga o botão.
      </span>
    </label>
  );
}

function FichasDoPersonagem({ config }: { config?: ConfiguracaoCapaChatgpt }) {
  const { notify } = useToast();
  const subir = useSubirFichaChatgpt();
  const remover = useRemoverFichaChatgpt();
  const seletor = useRef<HTMLInputElement>(null);
  // Fura o cache das miniaturas: subir uma ficha com o mesmo nome a substitui.
  const [versao, setVersao] = useState(0);

  const fichas = config?.fichas ?? [];
  const cheio = fichas.length >= (config?.maximo_de_fichas ?? 10);

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

  const aoRemover = (nome: string) =>
    remover.mutate(nome, {
      onError: (erro) => notify(texto(erro, 'Erro ao remover a ficha.'), { tone: 'error' }),
    });

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-[var(--wb-text)]">
          Fichas do personagem ({fichas.length})
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={subir.isPending || cheio}
          onClick={() => seletor.current?.click()}
        >
          {subir.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="image-plus" />}
          Adicionar fichas
        </Button>
      </div>
      <input
        ref={seletor}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        aria-label="Adicionar fichas"
        className="hidden"
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (arquivos.length) void aoSubir(arquivos);
        }}
      />
      {fichas.length === 0 ? (
        <p className="text-[12px] text-[var(--wb-text-dim)]">
          Nenhuma ficha. Sem elas o ChatGPT desenha o personagem só pelo que está no projeto.
        </p>
      ) : (
        <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {fichas.map((nome) => (
            <li
              key={nome}
              className="grid gap-1 rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-1.5"
            >
              <ImagemAmpliavel
                src={fichaUrl(nome, versao)}
                alt={nome}
                className="w-full"
                imgClassName="aspect-[3/2] w-full rounded-[6px] object-contain"
              />
              <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate font-code text-[10.5px] text-[var(--wb-text-mute)]">
                  {nome}
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${nome}`}
                  disabled={remover.isPending}
                  onClick={() => aoRemover(nome)}
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
