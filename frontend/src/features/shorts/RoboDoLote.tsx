// Os interruptores dos robôs do lote (TikTok, Instagram e "aperta o botão final").
// Saíram do modal porque o teto de tamanho de função dele não sobe (D-1011).
import { Interruptor } from './pecasDoLote';

interface Props {
  temTiktok: boolean;
  temInstagram: boolean;
  tiktokAssistido: boolean;
  instagramAssistido: boolean;
  publicarSozinho: boolean;
  /** D-1010: vários Reels fora de "distribuir": o robô para no botão final. */
  seguraInstagram: boolean;
  onTiktok: (v: boolean) => void;
  onInstagram: (v: boolean) => void;
  onSozinho: (v: boolean) => void;
}

export function RoboDoLote(p: Props) {
  const temRobo = (p.temTiktok && p.tiktokAssistido) || (p.temInstagram && p.instagramAssistido);
  return (
    <div className="mt-2 space-y-1.5 rounded-[9px] bg-poco p-2.5">
      {/* Um interruptor por plataforma, e não um só: as duas páginas não são
          nossas e quebram em dias diferentes — desligar o robô de uma não pode
          desligar o da outra. */}
      {p.temTiktok && (
        <Interruptor name="tiktok_assistido"
          ligado={p.tiktokAssistido}
          onChange={p.onTiktok}
          titulo="TikTok: o robô sobe pelo navegador"
          nota="envia o vídeo, escreve a legenda e põe a capa — e para no Publicar"
        />
      )}
      {p.temInstagram && (
        <Interruptor name="instagram_assistido"
          ligado={p.instagramAssistido}
          onChange={p.onInstagram}
          titulo="Instagram: o robô sobe pelo navegador"
          nota="envia o vídeo, a legenda e a capa; com data, marca no Meta Business Suite"
        />
      )}
      {temRobo && (
        <Interruptor name="publicar_sozinho"
          ligado={p.publicarSozinho}
          onChange={p.onSozinho}
          titulo="…e também aperta o botão final"
          nota="sem conferência sua: uma legenda errada vira post público no canal"
          alerta
        />
      )}
      {temRobo && p.publicarSozinho && p.seguraInstagram && (
        <p className="text-micro text-fg-3">
          Só "distribuir" espaça os Reels: neste lote o robô sobe tudo e para no botão final,
          para eles não irem ao ar de uma vez.
        </p>
      )}
    </div>
  );
}
