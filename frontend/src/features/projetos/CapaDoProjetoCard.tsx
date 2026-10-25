// D-987 · A primeira das três alturas de leitura do card: a miniatura, que
// diz QUE live é. Saiu de `ProjetoCardAp` quando o card ganhou os chips de
// rede e a função bateu no teto da catraca de tamanho (D-772) — e a costura
// já estava desenhada pelo comentário de lá: miniatura, fita, números.
//
// Tudo o que só esta altura usa veio junto: a arte, o selo de estado, a nota
// do ranking, a duração e a barra de download.
import { useState } from 'react';
import { estadoDoProjeto } from '@/features/projetos/statusMaps';
import { formatarDuracao, thumbnailUrl } from '@/lib/utils';
import type { Projeto } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import { MolduraDeVideo } from '@/upgrade/MolduraDeVideo';
import { SeloDeEstado, TOM_DO_PROJETO } from '@/upgrade/SeloDeEstado';

const HUES = [22, 280, 160, 340, 240, 60, 200, 100];

export function CapaDoProjetoCard({
  projeto,
  index,
  abrir,
}: {
  projeto: Projeto;
  index: number;
  abrir: () => void;
}) {
  const [thumbErro, setThumbErro] = useState(false);

  const estado = estadoDoProjeto(projeto);
  const thumb = thumbnailUrl(projeto.youtube_url, 'mq');
  const hue = HUES[index % HUES.length];
  const baixando = projeto.status === 'baixando';
  const nota = Math.round(projeto.pontuacao_ranking);

  // D-746: moldura em três camadas (passe-partout, bisel, vinheta) — a R2 era
  // só respiro + filete, e a arte da live parecia colada.
  return (
    <MolduraDeVideo
      mat={8}
      proporcao="16/9"
      onClick={abrir}
      rotulo={`Abrir projeto ${projeto.titulo_live} — ${estado.label}`}
    >
      {/* O gradiente mora DENTRO da moldura: live sem miniatura continua
            emoldurada, só troca a arte. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg,oklch(0.6 0.06 ${hue}),oklch(0.3 0.05 ${hue}))`,
        }}
      />
      {thumb && !thumbErro ? (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          onError={() => setThumbErro(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : null}

      <span style={{ position: 'absolute', top: 8, left: 8 }}>
        <SeloDeEstado tom={TOM_DO_PROJETO[estado.key]} sobreArte>
          {estado.label}
          {baixando ? ` ${Math.round(projeto.progresso_download)}%` : ''}
        </SeloDeEstado>
      </span>

      {nota > 0 ? (
        <span
          className="chip gl"
          title={`Nota do projeto no ranking de lives: ${nota}/100`}
          style={{ position: 'absolute', top: 8, right: 8, fontFamily: 'var(--mono)' }}
        >
          <Icon name="trophy" />
          {nota}
        </span>
      ) : null}

      {projeto.duracao_segundos > 0 ? (
        <span
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: '#fff',
            background: 'rgb(10 14 24 / 0.68)',
            padding: '2px 6px',
            borderRadius: 'var(--r1)',
          }}
        >
          {formatarDuracao(projeto.duracao_segundos)}
        </span>
      ) : null}

      {baixando ? <BarraDeDownload progresso={projeto.progresso_download} /> : null}
    </MolduraDeVideo>
  );
}

/** A régua do download rodando no pé da arte — some assim que a live baixa. */
function BarraDeDownload({ progresso }: { progresso: number }) {
  return (
    <span
      style={{
        position: 'absolute',
        insetInline: 0,
        bottom: 0,
        height: 3,
        background: 'rgb(0 0 0/.3)',
      }}
      aria-hidden
    >
      <span
        style={{
          display: 'block',
          height: '100%',
          width: `${Math.max(0, Math.min(100, progresso))}%`,
          background: 'var(--warn)',
        }}
      />
    </span>
  );
}
