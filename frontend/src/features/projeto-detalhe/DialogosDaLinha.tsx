import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Miniatura } from '@/components/ui/miniatura';
import { GrupoDeRadio, Radio } from '@/components/ui/radio';
import type { DestinoPublicacao, StatusExportCorte } from '@/types/models';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { destinosPublicados } from './listasDePublicacao';
import { useCapaQueCarrega } from './PartesDaLinha';

// D-1149 (E-069 H-16) · Os três diálogos que a linha do corte abre na tela da live: enviar
// ao YouTube, informar o link já publicado e liberar a publicação. Saíram do `UpgradeModal`
// para o `Dialog` da Sala escura, que prende o foco, fecha no Esc e o devolve a quem abriu.
// O texto e a ordem dos botões são os de antes; só a roupa mudou.

/** O rodapé comum: o fechar e a confirmação. */
function Rodape({
  fechar,
  rotuloDoFechar = 'Cancelar',
  children,
}: {
  fechar: () => void;
  rotuloDoFechar?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Button variant="secundario" onClick={fechar}>
        {rotuloDoFechar}
      </Button>
      {children}
    </>
  );
}

/** D-746: publicar é público e irreversível — o clique na linha abre esta conferência, e só ela envia. */
export function EnviarAoYoutubeDialog({
  corte,
  canal,
  capa,
  agendarEm,
  setAgendarEm,
  aoFechar,
  aoEnviar,
}: {
  corte: StatusExportCorte | null;
  canal: { nome: string; handle: string } | undefined;
  capa: string | undefined;
  agendarEm: string;
  setAgendarEm: (valor: string) => void;
  aoFechar: () => void;
  aoEnviar: (corte: StatusExportCorte, agendarEm: string) => void;
}) {
  const capaVisivel = useCapaQueCarrega(capa);
  return (
    <Dialog
      open={corte !== null}
      onClose={aoFechar}
      tamanho="md"
      title={`Enviar o corte #${corte?.numero ?? ''} ao YouTube`}
      description={canal ? `canal de destino: ${canal.nome} (${canal.handle})` : 'canal de destino: o canal ativo'}
      footer={
        <Rodape fechar={aoFechar}>
          <Button variant="primario" onClick={() => corte && aoEnviar(corte, agendarEm)}>
            <Icon name={agendarEm ? 'clock' : ICONE_DO_CONCEITO.publicar} />
            {agendarEm ? 'Agendar no YouTube' : 'Enviar ao YouTube agora'}
          </Button>
        </Rodape>
      }
    >
      {corte ? (
        <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-4">
          <Miniatura src={capaVisivel.src} onError={capaVisivel.aoFalhar} />
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-linha text-fg">{corte.titulo_youtube || corte.titulo}</p>
            <Field rotulo="Agendar" ajuda="Sugerido: o próximo horário livre do canal. Vazio envia agora.">
              <Input
                aparencia="sala"
                type="datetime-local"
                name="agendar-em"
                value={agendarEm}
                onChange={(e) => setAgendarEm(e.target.value)}
              />
            </Field>
          </div>
        </div>
      ) : null}
      {/* A nota mora no corpo: no rodapé, ao lado dos dois botões, ela os empurrava para baixo. */}
      <p className="mt-3 text-pequeno text-fg-3">Público e sem desfazer pelo app.</p>
    </Dialog>
  );
}

/** Para quando o vídeo já subiu fora do app: o app só guarda a marca. */
export function InformarLinkDialog({
  corte,
  link,
  setLink,
  aoFechar,
  aoConfirmar,
}: {
  corte: StatusExportCorte | null;
  link: string;
  setLink: (valor: string) => void;
  aoFechar: () => void;
  aoConfirmar: () => void;
}) {
  return (
    <Dialog
      open={corte !== null}
      onClose={aoFechar}
      title={`Informar o link do corte #${corte?.numero ?? ''}`}
      description="para quando o vídeo já subiu fora do app"
      footer={
        <Rodape fechar={aoFechar}>
          <Button variant="primario" onClick={aoConfirmar}>
            <Icon name="check" />
            Confirmar publicação
          </Button>
        </Rodape>
      }
    >
      <Field rotulo="Link do vídeo no YouTube">
        <Input
          aparencia="sala"
          type="url"
          name="link-do-youtube"
          autoComplete="off"
          spellCheck={false}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://youtube.com/watch?v=…"
        />
      </Field>
      <p className="mt-3 text-pequeno text-fg-3">O app só guarda a marca — nada é enviado.</p>
    </Dialog>
  );
}

/** O corte volta para a fila e pode subir de novo. Com mais de um destino, o operador escolhe qual (D-746). */
export function LiberarPublicacaoDialog({
  corte,
  destino,
  setDestino,
  aoFechar,
  aoLiberar,
}: {
  corte: StatusExportCorte | null;
  destino: DestinoPublicacao | null;
  setDestino: (destino: DestinoPublicacao) => void;
  aoFechar: () => void;
  aoLiberar: (destino: DestinoPublicacao) => void;
}) {
  const destinos = corte ? destinosPublicados(corte) : [];
  const atual = destino ?? destinos[0]?.destino;
  return (
    <Dialog
      open={corte !== null}
      onClose={aoFechar}
      title={`Liberar a publicação do corte #${corte?.numero ?? ''}`}
      description="o corte volta para a fila e pode subir de novo"
      footer={
        <Rodape fechar={aoFechar} rotuloDoFechar="Fechar">
          <Button variant="primario" onClick={() => atual && aoLiberar(atual)}>
            <Icon name="rotate-ccw" />
            Liberar
          </Button>
        </Rodape>
      }
    >
      <p className="text-corpo text-fg-2">
        Isto não apaga nada lá fora: é o app aceitando ser informado de que o vídeo saiu do ar. Depois disso o
        botão de enviar reaparece sozinho.
      </p>
      {destinos.length <= 1 ? (
        <dl className="mt-3 grid gap-1">
          {destinos.map((d) => (
            <div key={d.destino} className="flex min-w-0 items-baseline gap-2">
              <dt className="text-pequeno text-fg-2">{d.rotulo}</dt>
              <dd className="m-0 min-w-0 truncate text-corpo text-fg">{d.detalhe}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <GrupoDeRadio
          value={atual}
          onValueChange={(v) => setDestino(v as DestinoPublicacao)}
          aria-label="Qual destino liberar"
          className="mt-3 grid gap-2"
        >
          {destinos.map((d) => (
            <label key={d.destino} className="flex min-w-0 cursor-pointer items-center gap-2.5">
              <Radio value={d.destino} aria-label={d.rotulo} />
              <span className="text-corpo font-semibold text-fg">{d.rotulo}</span>
              <span className="min-w-0 truncate text-pequeno text-fg-3">{d.detalhe}</span>
            </label>
          ))}
        </GrupoDeRadio>
      )}
    </Dialog>
  );
}
