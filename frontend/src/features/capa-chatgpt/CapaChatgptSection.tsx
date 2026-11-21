import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
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
import { ReferenciaGuardada } from './EstiloDaCapaSection';
import { useEstiloDaCapa } from './useEstiloDaCapa';

// D-804: onde o robô gera as capas — o projeto do ChatGPT do canal e as fichas
// do mascote que vão anexas em todo pedido. Por canal, porque cada canal tem o
// seu personagem (e pode ter a sua conta). As fichas só aparecem com o mascote
// de protagonista (D-939): com o apresentador, elas não vão para a capa.

export function CapaChatgptSection() {
  const config = useConfiguracaoCapaChatgpt();
  const protagonista = useEstiloDaCapa().data?.protagonista;

  return (
    <section data-sala=""
      className="grid gap-3 rounded-cartao border border-fio bg-vidro p-5">
      <h2 className="text-secao text-fg">Capas no ChatGPT</h2>
      <p className="text-corpo text-fg-2">
        O botão “Gerar no ChatGPT” das capas abre este projeto no Edge, anexa as fichas abaixo,
        cola o prompt e traz a imagem de volta — pela sua assinatura, sem API. Na primeira vez,
        entre na sua conta na janela que o robô abrir; ela fica guardada.
      </p>
      <LinkDoProjeto salvo={config.data?.projeto_url ?? ''} />
      {protagonista === 'mascote' && <FichasDoPersonagem config={config.data} />}
      {protagonista === 'apresentador' && (
        <ReferenciaGuardada
          quantas={config.data?.fichas.length ?? 0}
          singular="ficha do mascote guardada"
          plural="fichas do mascote guardadas"
          protagonista="Mascote"
        />
      )}
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
    <Field rotulo="Link do projeto" ajuda="Abra o projeto no ChatGPT e copie a barra de endereço. Vazio desliga o botão.">
      <div className="flex flex-wrap gap-2">
        <Input
          aparencia="sala"
          value={projeto}
          onChange={(e) => setProjeto(e.target.value)}
          placeholder="https://chatgpt.com/g/g-p-…/project"
          className="min-w-[280px] flex-1"
        />
        <Button
          type="button"
          variant="secundario"
          carregando={gravar.isPending}
          onClick={aoSalvar}
          disabled={projeto.trim() === salvo}
        >
          Salvar
        </Button>
      </div>
    </Field>
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
        <span className="text-linha text-fg">
          Fichas do personagem ({fichas.length})
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
        <p className="text-pequeno text-fg-3">
          Nenhuma ficha. Sem elas o ChatGPT desenha o personagem só pelo que está no projeto.
        </p>
      ) : (
        <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {fichas.map((nome) => (
            <li
              key={nome}
              className="grid grid-cols-1 gap-1 rounded-ladrilho border border-fio bg-poco p-1.5"
            >
              <ImagemAmpliavel
                src={fichaUrl(nome, versao)}
                alt={nome}
                className="w-full"
                imgClassName="aspect-[3/2] w-full rounded-etiqueta object-contain"
              />
              <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate font-mono text-micro text-fg-2">
                  {nome}
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${nome}`}
                  disabled={remover.isPending}
                  onClick={() => aoRemover(nome)}
                  data-sala=""
                  className="rounded-etiqueta p-1 text-fg-3 transition-colors hover:text-erro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco disabled:text-fg-off motion-reduce:transition-none"
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
