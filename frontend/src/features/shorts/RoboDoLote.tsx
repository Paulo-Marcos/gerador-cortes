// Os interruptores dos robôs do lote (TikTok, Instagram e "aperta o botão final").
// Saíram do modal porque o teto de tamanho de função dele não sobe (D-1011).
import { Interruptor } from './pecasDoLote';

interface Props {
  temTiktok: boolean;
  temInstagram: boolean;
  tiktokAssistido: boolean;
  instagramAssistido: boolean;
  publicarSozinho: boolean;
  /** D-1011: o robô vai parar no botão final por causa de vários Reels no ato. */
  seguraInstagram: boolean;
  onTiktok: (v: boolean) => void;
  onInstagram: (v: boolean) => void;
  onSozinho: (v: boolean) => void;
}

export function RoboDoLote(p: Props) {
  const temRobo = (p.temTiktok && p.tiktokAssistido) || (p.temInstagram && p.instagramAssistido);
  return (
    <div className="mt-2 space-y-1.5 rounded-[9px] bg-[var(--wb-bg-inset)] p-2.5">
      {/* Um interruptor por plataforma, e não um só: as duas páginas não são
          nossas e quebram em dias diferentes — desligar o robô de uma não pode
          desligar o da outra. */}
      {p.temTiktok && (
        <Interruptor
          ligado={p.tiktokAssistido}
          onChange={p.onTiktok}
          titulo="TikTok: o robô sobe pelo navegador"
          nota="envia o vídeo, escreve a legenda e põe a capa — e para no Publicar"
        />
      )}
      {p.temInstagram && (
        <Interruptor
          ligado={p.instagramAssistido}
          onChange={p.onInstagram}
          titulo="Instagram: o robô sobe pelo navegador"
          nota="abre o compositor, envia o vídeo e escreve a legenda — e para no Compartilhar"
        />
      )}
      {temRobo && (
        <Interruptor
          ligado={p.publicarSozinho}
          onChange={p.onSozinho}
          titulo="…e também aperta o botão final"
          nota="sem conferência sua: uma legenda errada vira post público no canal"
          alerta
        />
      )}
      {temRobo && p.publicarSozinho && p.seguraInstagram && (
        <p className="text-[11.5px] text-[var(--wb-text-dim)]">
          Com vários Reels o Instagram ainda publica no ato, sem agenda: neste lote o robô sobe
          tudo e para no botão final, para os Reels não irem ao ar de uma vez.
        </p>
      )}
    </div>
  );
}
