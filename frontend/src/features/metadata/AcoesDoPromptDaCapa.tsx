import { Button } from '@/components/ui/button';
import { GerarNoChatGPT } from '@/features/capa-chatgpt/GerarNoChatGPT';
import { Icon } from '@/upgrade/Icon';

// O que se faz com o prompt da capa do YouTube: levar ao ChatGPT.
//
// D-746: copiar o prompt é o passo que se repete dez vezes por live (cola no
// agente capista, a imagem volta por Ctrl+V). Ele tinha ido parar no ⋯ do
// cabeçalho junto com o raro. Frequência de uso, não quantidade de botões,
// decide o que fica à vista.
//
// D-804: o robô faz o mesmo caminho sem sair do app, e a imagem volta pelo
// upload do Ctrl+V (`entregar`) — moldura inclusa. Os dois moram juntos porque
// são duas formas do mesmo passo, e saíram do MetadataCard para ele não crescer.

interface Props {
  corteId: string;
  prompt?: string;
  promptReady: boolean;
  promptCopiado: boolean;
  onCopiar: () => void;
  entregar: (arquivo: File) => Promise<unknown>;
}

export function AcoesDoPromptDaCapa({
  corteId,
  prompt,
  promptReady,
  promptCopiado,
  onCopiar,
  entregar,
}: Props) {
  const motivoId = `motivo-prompt-${corteId}`;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={onCopiar}
        disabled={!promptReady}
        aria-describedby={promptReady ? undefined : motivoId}
        title="Copiar o prompt para colar no agente capista"
      >
        {promptCopiado ? <Icon name="check" /> : <Icon name="clipboard" />}
        {promptCopiado ? 'Copiado' : 'Copiar prompt da capa'}
      </Button>
      <GerarNoChatGPT prompt={prompt} proporcao="16:9" entregar={entregar} />
      {!promptReady && (
        <p id={motivoId} className="-mt-1 text-[11px] leading-snug text-[var(--wb-warn-ink)]">
          Gere o prompt da capa primeiro — ainda não há o que copiar.
        </p>
      )}
    </>
  );
}
