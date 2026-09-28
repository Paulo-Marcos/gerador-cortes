import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';
import { fichaUrl, mensagemDoRobo as texto } from './api';
import {
  useConfiguracaoCapaChatgpt,
  useGravarProjetoChatgpt,
  useRemoverFichaChatgpt,
  useSubirFichaChatgpt,
} from './useCapaNoChatGPT';

// D-804: onde o robô gera as capas — o projeto do ChatGPT do canal e as fichas
// do mascote que vão anexas em todo pedido. Por canal, porque cada canal tem o
// seu personagem (e pode ter a sua conta).

export function CapaChatgptSection() {
  const { notify } = useToast();
  const config = useConfiguracaoCapaChatgpt();
  const gravar = useGravarProjetoChatgpt();
  const subir = useSubirFichaChatgpt();
  const remover = useRemoverFichaChatgpt();
  const seletor = useRef<HTMLInputElement>(null);
  const [projeto, setProjeto] = useState('');
  // Fura o cache das miniaturas: subir uma ficha com o mesmo nome a substitui.
  const [versao, setVersao] = useState(0);

  const salvo = config.data?.projeto_url ?? '';
  useEffect(() => setProjeto(salvo), [salvo]);

  const fichas = config.data?.fichas ?? [];
  const cheio = fichas.length >= (config.data?.maximo_de_fichas ?? 10);

  const aoSalvar = () =>
    gravar.mutate(projeto.trim(), {
      onSuccess: () => notify('Projeto do ChatGPT salvo.', { tone: 'success' }),
      onError: (erro) => notify(texto(erro, 'Erro ao salvar o projeto.'), { tone: 'error' }),
    });

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
    <section className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-5">
      <h2 className="text-lg font-semibold text-[var(--wb-text)]">Capas no ChatGPT</h2>
      <p className="text-sm text-[var(--wb-text-mute)]">
        O botão “Gerar no ChatGPT” das capas abre este projeto no Edge, anexa as fichas abaixo,
        cola o prompt e traz a imagem de volta — pela sua assinatura, sem API. Na primeira vez,
        entre na sua conta na janela que o robô abrir; ela fica guardada.
      </p>

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
            {gravar.isPending && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </div>
        <span className="text-[11px] text-[var(--wb-text-dim)]">
          Abra o projeto no ChatGPT e copie a barra de endereço. Vazio desliga o botão.
        </span>
      </label>

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
            {subir.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
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
                <img
                  src={fichaUrl(nome, versao)}
                  alt={nome}
                  className="aspect-[3/2] w-full rounded-[6px] object-contain"
                />
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate font-code text-[10.5px] text-[var(--wb-text-mute)]">
                    {nome}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remover ${nome}`}
                    disabled={remover.isPending}
                    onClick={() =>
                      remover.mutate(nome, {
                        onError: (erro) =>
                          notify(texto(erro, 'Erro ao remover a ficha.'), { tone: 'error' }),
                      })
                    }
                    className="rounded p-1 text-[var(--wb-text-dim)] hover:text-error disabled:opacity-50"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
