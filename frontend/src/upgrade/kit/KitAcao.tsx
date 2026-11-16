import { useState } from 'react';
import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Icon } from '@/components/ui/icon';
import { Kbd } from '@/components/ui/kbd';
import { LinkDeAcao } from '@/components/ui/link-de-acao';
import type { ProviderIA } from '@/lib/providerIa';

// D-1114 (E-069 H-07): a seção "Ação" do Kit — o botão da Sala escura em todos os
// estados. A página Kit inteira é montada na H-12; esta seção é autônoma para isso.
//
// Os estados forçados (hover, ativo, foco) só existem aqui, para a captura: o botão real
// responde a :hover/:active/:focus-visible. Por isso `forcar` troca as classes que o
// próprio estado acionaria, em vez de inventar um estilo paralelo.

const FORCA = {
  hover: 'brightness-[1.07] saturate-[1.08]',
  ativo: 'scale-[.97] brightness-[.94]',
  foco: 'outline outline-2 outline-offset-2 outline-foco',
} as const;

const VARIANTES = [
  { variant: 'primario', rotulo: 'Publicar 6 cortes' },
  { variant: 'secundario', rotulo: 'Salvar rascunho' },
  { variant: 'fantasma', rotulo: 'Voltar' },
  { variant: 'destrutivo', rotulo: 'Excluir corte' },
  { variant: 'destrutivo-cheio', rotulo: 'Excluir de vez' },
] as const;

function Linha({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-28 shrink-0 text-pequeno text-fg-3">{titulo}</span>
      {children}
    </div>
  );
}

export function KitAcao() {
  const [emVoo, setEmVoo] = useState<ProviderIA | null>(null);
  const [carregando, setCarregando] = useState(true);

  return (
    <section
      aria-labelledby="kit-acao"
      className="flex flex-col gap-5 rounded-cartao border border-fio bg-app p-6 text-fg"
    >
      <h2 id="kit-acao" className="text-secao">
        Ação
      </h2>

      {VARIANTES.map(({ variant, rotulo }) => (
        <div key={variant} className="flex flex-col gap-3">
          <Linha titulo={variant}>
            <Button variant={variant}>{rotulo}</Button>
            <Button variant={variant} className={FORCA.hover}>
              hover
            </Button>
            <Button variant={variant} className={FORCA.ativo}>
              ativo
            </Button>
            <Button variant={variant} className={FORCA.foco}>
              foco
            </Button>
            <Button variant={variant} disabled>
              desabilitado
            </Button>
            <Button variant={variant} carregando>
              Gravando…
            </Button>
          </Linha>
        </div>
      ))}

      <Linha titulo="tamanhos">
        <Button variant="primario" size="pq">
          Pequeno 30
        </Button>
        <Button variant="primario" size="md">
          Médio 38
        </Button>
        <Button variant="primario" size="gd">
          Grande 46
        </Button>
        <Button variant="secundario" size="pq">
          <Icon name="plus" size={14} />
          Com ícone
        </Button>
      </Linha>

      <Linha titulo="ligado">
        <Button variant="secundario" aria-pressed="true">
          Só os prontos
        </Button>
        <Button variant="secundario" aria-pressed="false">
          Todos
        </Button>
      </Linha>

      <Linha titulo="só ícone">
        <IconButton variant="vidro" size="pq" aria-label="Mais ações">
          <Icon name="more-horizontal" size={16} />
        </IconButton>
        <IconButton variant="vidro" aria-label="Tocar">
          <Icon name="play" size={16} />
        </IconButton>
        <IconButton variant="fantasma" aria-label="Copiar">
          <Icon name="copy" size={16} />
        </IconButton>
        <IconButton variant="destrutivo" size="gd" aria-label="Apagar">
          <Icon name="trash-2" size={20} />
        </IconButton>
      </Linha>

      <Linha titulo="ação de linha">
        <LinkDeAcao>Editar</LinkDeAcao>
        <LinkDeAcao>Trazer de volta</LinkDeAcao>
        <LinkDeAcao disabled>Indisponível</LinkDeAcao>
      </Linha>

      <Linha titulo="teclas">
        <span className="flex items-center gap-1 text-corpo text-fg-2">
          Paleta de comandos <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </Linha>

      <Linha titulo="ação de IA">
        <AcaoDeIa
          aparencia="sala-escura"
          rotulo="Gerar trechos"
          emVoo={emVoo}
          onGerar={(p) => setEmVoo(p)}
          tamanho="md"
        />
        <AcaoDeIa
          aparencia="sala-escura"
          rotulo="Gerar metadados"
          emVoo={null}
          onGerar={() => undefined}
          comNome
        />
        <AcaoDeIa
          aparencia="sala-escura"
          rotulo="Gerar trechos"
          emVoo="gemini"
          rotuloEmVoo="Gerando…"
          onGerar={() => undefined}
        />
        {emVoo && (
          <LinkDeAcao onClick={() => setEmVoo(null)}>Parar a demonstração</LinkDeAcao>
        )}
      </Linha>

      <Linha titulo="carregando">
        <Button variant="primario" carregando={carregando} onClick={() => undefined}>
          {carregando ? 'Renderizando…' : 'Renderizar'}
        </Button>
        <Button variant="secundario" size="pq" onClick={() => setCarregando((c) => !c)}>
          Alternar
        </Button>
      </Linha>
    </section>
  );
}
