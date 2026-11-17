import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, type TamanhoDoDialogo } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Icon } from '@/components/ui/icon';
import { Menu, MenuContent, MenuItem, MenuRotulo, MenuSeparador, MenuTrigger } from '@/components/ui/menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Segmented } from '@/components/ui/segmented';
import { useToast, type ToastTone } from '@/components/ui/toaster';
import { Tooltip } from '@/components/ui/tooltip';
import { aplicarTemaNoDocumento } from './KitEstado';

// D-1122 (E-069 H-11b) · seção "Flutua" do Kit: menu, popover, tooltip, diálogo, gaveta
// e toast na Sala escura (DIRECAO §3.5, §5, §6). Tudo aqui abre de verdade — teclado,
// Esc, foco preso e foco de volta ao botão que abriu. A montagem da página inteira é
// a H-12; esta seção é autônoma para isso.

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-micro text-fg-3">{titulo}</h3>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

function MenuEPopover() {
  return (
    <Bloco titulo="Menu · setas, Home/End, digitar salta, Esc fecha · item desligado mostra o motivo">
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secundario">
            <Icon name="more-horizontal" />
            Mais ações
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuRotulo>Corte</MenuRotulo>
          <MenuItem icone="edit-3" atalho="E">
            Editar corte
          </MenuItem>
          <MenuItem icone="copy">Duplicar</MenuItem>
          <MenuItem icone="download" desligado title="O corte ainda não foi renderizado">
            Baixar vídeo
          </MenuItem>
          <MenuSeparador />
          <MenuItem icone="trash-2" perigo>
            Riscar corte
          </MenuItem>
        </MenuContent>
      </Menu>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secundario">Etapas do corte</Button>
        </PopoverTrigger>
        <PopoverContent>
          <p className="text-linha text-fg">7 de 8 etapas</p>
          <p className="mt-1 text-pequeno text-fg-2">Falta só o YouTube. Esc ou um clique fora fecham.</p>
        </PopoverContent>
      </Popover>
      <Tooltip label="Fechar a live" side="bottom">
        <IconButton variant="vidro" aria-label="Fechar a live">
          <Icon name="x" />
        </IconButton>
      </Tooltip>
    </Bloco>
  );
}

const TONS: ReadonlyArray<{ tom: ToastTone; titulo: string; mensagem: string }> = [
  { tom: 'success', titulo: 'Publicado.', mensagem: '6 cortes no YouTube.' },
  { tom: 'info', titulo: 'Corte riscado.', mensagem: '#3 · O começo da conversa' },
  { tom: 'warning', titulo: 'Sem cenas.', mensagem: 'O render vai usar o palco padrão.' },
  { tom: 'error', titulo: 'Falhou.', mensagem: 'O render do corte #4 parou.' },
];

function Avisos() {
  const { notify } = useToast();
  return (
    <Bloco titulo="Toast · aria-live, o erro é anunciado já · some sozinho em segundos">
      {TONS.map(({ tom, titulo, mensagem }) => (
        <Button key={tom} variant="secundario" onClick={() => notify(mensagem, { title: titulo, tone: tom })}>
          {tom}
        </Button>
      ))}
    </Bloco>
  );
}

function Dialogos() {
  const [aberto, setAberto] = useState<TamanhoDoDialogo | 'perigo' | null>(null);
  const fechar = () => setAberto(null);
  return (
    <Bloco titulo="Diálogo e gaveta · foco preso, Esc e véu fecham, o foco volta ao botão que abriu">
      <Button variant="secundario" onClick={() => setAberto('sm')}>
        Diálogo
      </Button>
      <Button variant="secundario" onClick={() => setAberto('perigo')}>
        Diálogo destrutivo
      </Button>
      <Button variant="secundario" onClick={() => setAberto('lateral')}>
        Gaveta (432 px)
      </Button>

      <Dialog
        open={aberto === 'sm'}
        onClose={fechar}
        title="Publicar 6 cortes?"
        description="Os cortes sobem para o YouTube com os metadados já revisados."
        footer={
          <>
            <Button variant="secundario" onClick={fechar}>
              Voltar
            </Button>
            <Button variant="primario" onClick={fechar}>
              Publicar 6 cortes
            </Button>
          </>
        }
      >
        <p className="text-corpo text-fg-2">Dá para acompanhar cada upload na fila de render.</p>
      </Dialog>

      <Dialog
        open={aberto === 'perigo'}
        onClose={fechar}
        title="Excluir a live?"
        footer={
          <>
            <Button variant="secundario" data-autofocus onClick={fechar}>
              Cancelar
            </Button>
            <Button variant="destrutivo-cheio" onClick={fechar}>
              Excluir live
            </Button>
          </>
        }
      >
        <p className="text-corpo text-fg-2">Isto não se desfaz: a mídia e os cortes saem da máquina.</p>
      </Dialog>

      <Dialog
        open={aberto === 'lateral'}
        onClose={fechar}
        tamanho="lateral"
        title="Fila de render"
        description="1 renderizando · 2 esperando · 1 pronto"
        footer={
          <Button variant="secundario" onClick={fechar}>
            Pausar a fila
          </Button>
        }
      >
        <p className="text-corpo text-fg-2">Os renders seguem com a gaveta fechada.</p>
      </Dialog>
    </Bloco>
  );
}

export function KitFlutua() {
  const [tema, setTema] = useState<'dark' | 'light'>('dark');
  useEffect(() => aplicarTemaNoDocumento(document.documentElement, tema), [tema]);

  return (
    <section
      aria-label="Flutua"
      className="mt-6 flex flex-col gap-8 rounded-painel border border-fio bg-app p-6 font-sans text-corpo text-fg"
    >
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-secao">Flutua · Sala escura</h2>
        <Segmented
          aria-label="Tema do kit"
          value={tema}
          onValueChange={(v) => setTema(v as 'dark' | 'light')}
          opcoes={[
            { valor: 'dark', rotulo: 'Escuro' },
            { valor: 'light', rotulo: 'Claro' },
          ]}
        />
      </header>
      <MenuEPopover />
      <Dialogos />
      <Avisos />
    </section>
  );
}
