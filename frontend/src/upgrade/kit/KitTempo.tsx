import { useState } from 'react';
import { Anel } from '@/components/ui/anel';
import { MapaDaLive, type CorteDoMapa } from '@/components/ui/mapa-da-live';
import { MedidorDeEtapas } from '@/components/ui/medidor-de-etapas';
import { Progresso } from '@/components/ui/progresso';
import { ReguaDeDias, type DiaDaRegua } from '@/components/ui/regua-de-dias';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { StatusExportCorte } from '@/types/models';
import { montarTira } from '../tiraDoCorte';

// D-1121 (E-069 H-11a): a seção "Tempo" da página Kit. Mostra o mapa da live, a régua de dias,
// o medidor de etapas, o anel e a barra de progresso em cada estado, para a comparação ser feita
// de uma vez; a H-12 monta a página inteira. Os dados são de exemplo (a live de 2:41:00 e os
// seis cortes do Design System), não vêm do backend.

const DURACAO = 9660;
const CORTES: CorteDoMapa[] = [
  {
    id: 'c1',
    numero: 1,
    nome: 'Por que parei de planejar',
    inicioSeg: 1674,
    fimSeg: 2671,
    estado: 'pronto',
  },
  {
    id: 'c2',
    numero: 2,
    nome: 'O erro dos três meses',
    inicioSeg: 3206,
    fimSeg: 4298,
    estado: 'pronto',
  },
  {
    id: 'c3',
    numero: 3,
    nome: 'Quando vale contratar',
    inicioSeg: 4873,
    fimSeg: 5742,
    estado: 'proposto',
  },
  {
    id: 'c4',
    numero: 4,
    nome: 'Pergunta do chat',
    inicioSeg: 5760,
    fimSeg: 6000,
    estado: 'proposto',
  },
  {
    id: 'c5',
    numero: 5,
    nome: 'Aparte sobre café',
    inicioSeg: 6018,
    fimSeg: 6887,
    estado: 'riscado',
  },
  { id: 'c6', numero: 6, nome: 'Fecho da live', inicioSeg: 7728, fimSeg: 8501, estado: 'pronto' },
];

const DIAS: DiaDaRegua[] = [
  { data: '2026-11-01', lives: [] },
  {
    data: '2026-11-02',
    lives: [{ id: 'a', titulo: 'Bastidores da semana', href: '#a', tom: 'ok', estado: 'No ar' }],
  },
  { data: '2026-11-03', lives: [] },
  {
    data: '2026-11-04',
    lives: [
      { id: 'b', titulo: 'Perguntas do chat', href: '#b', tom: 'neutro', estado: 'Analisada' },
    ],
  },
  { data: '2026-11-05', lives: [] },
  {
    data: '2026-11-06',
    lives: [
      { id: 'c', titulo: 'Em transcrição', href: '#c', tom: 'curso', estado: 'Transcrevendo' },
    ],
  },
  {
    data: '2026-11-07',
    lives: [{ id: 'd', titulo: 'Falhou o download', href: '#d', tom: 'erro', estado: 'Com erro' }],
  },
  {
    data: '2026-11-08',
    hoje: true,
    lives: [
      {
        id: 'e',
        titulo: 'Cansei do Youtube e fui criar',
        href: '#e',
        tom: 'convite',
        estado: 'Pronta para publicar',
      },
    ],
  },
];

function statusDeCorte(patch: Partial<StatusExportCorte>): StatusExportCorte {
  return statusExportPendente({
    corte_id: 'kit',
    numero: 1,
    titulo: 'Corte do kit',
    raw_pronto: false,
    grade_pronta: false,
    overlays_prontos: false,
    cenas_geradas: false,
    cenas_validadas: false,
    video_pronto: false,
    thumbnail_pronta: false,
    metadados_completos: false,
    pronto_publicar: false,
    ...patch,
  });
}

const TUDO = {
  raw_pronto: true,
  cenas_geradas: true,
  cenas_validadas: true,
  grade_pronta: true,
  overlays_prontos: true,
  video_pronto: true,
  thumbnail_pronta: true,
  metadados_completos: true,
};

const MEDIDORES: { rotulo: string; tira: ReturnType<typeof montarTira> }[] = [
  { rotulo: 'Começando', tira: montarTira(statusDeCorte({})) },
  {
    rotulo: 'Parou no filtro',
    tira: montarTira(statusDeCorte({ raw_pronto: true, cenas_validadas: true })),
  },
  { rotulo: 'Pronto: falta publicar', tira: montarTira(statusDeCorte(TUDO)) },
  {
    rotulo: 'No ar',
    tira: montarTira(statusDeCorte({ ...TUDO, youtube_url_publicado: 'https://youtu.be/kit' })),
  },
  { rotulo: 'Riscado', tira: montarTira(statusDeCorte({ raw_pronto: true }), 'rejeitado') },
];

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-cartao border border-fio bg-vidro p-5">
      <h3 className="font-mono text-micro">
        <span className="text-fg-3">{titulo}</span>
      </h3>
      {children}
    </section>
  );
}

function BlocoDoMapa() {
  const [aberto, setAberto] = useState<string | undefined>('c2');
  return (
    <Bloco titulo="Mapa da live">
      <MapaDaLive duracaoSeg={DURACAO} cortes={CORTES} abertoId={aberto} onAbrir={setAberto} />
      <MapaDaLive
        duracaoSeg={DURACAO}
        cortes={CORTES}
        abertoId={aberto}
        onAbrir={setAberto}
        tamanho="mini"
      />
      <MapaDaLive duracaoSeg={0} cortes={CORTES.slice(0, 3)} />
    </Bloco>
  );
}

export function KitTempo() {
  return (
    <div className="grid gap-4 text-fg" data-kit="tempo">
      <BlocoDoMapa />
      <Bloco titulo="Régua de dias">
        <ReguaDeDias dias={DIAS} />
      </Bloco>
      <div className="grid gap-4 md:grid-cols-2">
        <Bloco titulo="Medidor de etapas">
          {MEDIDORES.map((m) => (
            <div key={m.rotulo} className="flex flex-col gap-1.5">
              <span className="text-micro">
                <span className="text-fg-3">{m.rotulo}</span>
              </span>
              <MedidorDeEtapas tira={m.tira} />
            </div>
          ))}
        </Bloco>
        <Bloco titulo="Anel e progresso">
          <div className="flex flex-wrap items-center gap-6">
            <Anel valor={80} rotulo="Nota da IA: 24 de 30" tamanho={34} espessura={3}>
              <span className="num text-micro">24</span>
            </Anel>
            <Anel valor={43} rotulo="Nota da IA: 13 de 30" tamanho={34} espessura={3} cor="aviso">
              <span className="num text-micro">13</span>
            </Anel>
            <Anel valor={100} rotulo="Tudo pronto" tamanho={30} espessura={3} cor="ok">
              <span className="num text-micro">✓</span>
            </Anel>
            <Anel valor={87.5} rotulo="7 de 8 etapas em cada corte" tamanho={64} espessura={6}>
              <span className="num text-linha">7/8</span>
            </Anel>
          </div>
          <Progresso valor={64} rotulo="Renderização do corte 3" />
          <Progresso valor={100} rotulo="Renderização do corte 4" />
          <Progresso valor={0} rotulo="Renderização do corte 5" />
        </Bloco>
      </div>
    </div>
  );
}
