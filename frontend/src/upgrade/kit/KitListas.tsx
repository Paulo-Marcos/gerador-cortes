import { Card, CardCorpo } from '@/components/ui/card';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { EstadoCarregando, EstadoVazio } from '@/components/ui/estado-vazio';
import { Etiqueta } from '@/components/ui/etiqueta';
import { Kpi } from '@/components/ui/kpi';
import { CabecalhoDaLista, LinhaDaLista, Lista } from '@/components/ui/lista';
import { Miniatura } from '@/components/ui/miniatura';
import { Selo } from '@/components/ui/selo';
import {
  Tabela,
  TabelaCabeca,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from '@/components/ui/tabela';

// D-1120 (E-069 H-10) · seção "Listas e dados" do Kit: cartão, miniatura, lista, tabela,
// KPI e os estados de tela. Só a vitrine: nenhuma tela usa estes componentes ainda.

// Capa de mentira (SVG em data URI) em 16:9 — a miniatura a recorta, nunca a estica.
const CAPA = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="slateblue"/><stop offset="1" stop-color="mediumaquamarine"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="160" cy="90" r="40" fill="currentColor" fill-opacity=".4"/></svg>',
)}`;

const CORTES = [
  { id: 1, titulo: 'Como o canal virou negócio', duracao: 372, tom: 'ok', estado: 'No ar' },
  { id: 2, titulo: 'A pergunta que mudou a conversa', duracao: 515, tom: 'convite', estado: 'Pronto' },
  { id: 3, titulo: 'Bastidores da edição', duracao: 331, tom: 'curso', estado: 'Renderizando' },
  { id: 4, titulo: 'Trecho descartado', duracao: 298, tom: 'inerte', estado: 'Riscado' },
] as const;

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-micro text-fg-3">{titulo}</h3>
      {children}
    </section>
  );
}

function CartoesDoKit() {
  return (
    <Bloco titulo="Cartão e miniatura · a capa recorta, nunca estica; a duração vai queimada em mono">
      <div className="flex flex-wrap items-start gap-4">
        <Card variante="vidro" interativo className="w-72" tabIndex={0}>
          <Miniatura src={CAPA} alt="Capa da live" duracaoSeg={3725} grande />
          <CardCorpo>
            <h4 className="text-linha text-fg">Live de terça · entrevista</h4>
            <p className="text-pequeno text-fg-3">12 cortes, 3 esperam o seu ok</p>
            <div className="flex items-center gap-2 pt-1">
              <Selo tom="convite">Pronto</Selo>
              <Etiqueta>Podcast</Etiqueta>
            </div>
          </CardCorpo>
        </Card>
        <Card variante="deitado" className="w-96">
          <Miniatura src={CAPA} alt="" duracaoSeg={512} className="w-32" />
          <CardCorpo>
            <h4 className="text-linha text-fg">Cartão deitado</h4>
            <p className="text-pequeno text-fg-3">Mesma anatomia, em linha</p>
          </CardCorpo>
        </Card>
        <div className="flex items-start gap-3">
          <Miniatura src={CAPA} alt="Short, recortado" proporcao="9/16" duracaoSeg={42} className="w-20" />
          <Miniatura alt="" proporcao="16/9" numero={3} className="w-32" />
          <Miniatura src={CAPA} alt="Corte riscado" riscada duracaoSeg={90} className="w-32" />
        </div>
      </div>
    </Bloco>
  );
}

function ListaDoKit() {
  return (
    <Bloco titulo="Lista · linha de 72 px, hover, atual, marcada e riscada">
      <Lista colunas="64px 1fr 120px 96px" aria-label="Cortes da live">
        <CabecalhoDaLista>
          <span />
          <span>Corte</span>
          <span>Duração</span>
          <span>Estado</span>
        </CabecalhoDaLista>
        {CORTES.map((c, i) => (
          <LinhaDaLista key={c.id} atual={i === 1} marcada={i === 2} riscada={i === 3}>
            <Miniatura src={CAPA} alt="" duracaoSeg={c.duracao} className="w-16" riscada={i === 3} />
            <span className={i === 3 ? 'truncate text-linha line-through' : 'truncate text-linha'}>{c.titulo}</span>
            <span className="num text-fg-2">{Math.floor(c.duracao / 60)}:{String(c.duracao % 60).padStart(2, '0')}</span>
            <Selo tom={c.tom}>{c.estado}</Selo>
          </LinhaDaLista>
        ))}
      </Lista>
    </Bloco>
  );
}

function TabelaDoKit() {
  return (
    <Bloco titulo="Tabela · número à direita, em mono">
      <Tabela>
        <TabelaCabeca>
          <TabelaLinha>
            <TabelaTitulo>Live</TabelaTitulo>
            <TabelaTitulo aDireita>Cortes</TabelaTitulo>
            <TabelaTitulo aDireita>Views</TabelaTitulo>
          </TabelaLinha>
        </TabelaCabeca>
        <TabelaCorpo>
          <TabelaLinha>
            <TabelaCelula>Entrevista de terça</TabelaCelula>
            <TabelaCelula aDireita numero>12</TabelaCelula>
            <TabelaCelula aDireita numero>48.210</TabelaCelula>
          </TabelaLinha>
          <TabelaLinha>
            <TabelaCelula>Bastidores</TabelaCelula>
            <TabelaCelula aDireita numero>7</TabelaCelula>
            <TabelaCelula aDireita numero>9.804</TabelaCelula>
          </TabelaLinha>
        </TabelaCorpo>
      </Tabela>
    </Bloco>
  );
}

function KpisDoKit() {
  return (
    <Bloco titulo="KPI · sem dado mostra 'Sem dados' com o motivo, nunca zero">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi rotulo="Cortes publicados" valor={38} detalhe="+6 sobre a semana" />
        <Kpi rotulo="Tempo médio" valor={6.4} unidade="min" />
        <Kpi rotulo="Retenção" motivo="O YouTube ainda não liberou a métrica deste canal." />
      </div>
    </Bloco>
  );
}

function EstadosDoKit() {
  return (
    <Bloco titulo="Estados de tela · vazio, carregando e erro (o quarto é a própria lista)">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-cartao border border-fio bg-vidro">
          <EstadoVazio
            titulo="Nenhuma live ainda"
            descricao="Cole o link de uma live do YouTube para começar."
            acao="Colar um link"
            aoAgir={() => {}}
          />
        </div>
        <div className="rounded-cartao border border-fio bg-vidro p-4">
          <EstadoCarregando frase="Buscando as lives…" linhas={3} />
        </div>
        <EstadoDeErro
          titulo="Não deu para buscar as lives"
          motivo="O backend não respondeu. Confira se ele está ligado."
          aoTentar={() => {}}
        />
      </div>
    </Bloco>
  );
}

export function KitListas() {
  // Sem chave de tema própria: a do `KitEstado` já troca o `data-theme` do documento, e duas
  // chaves gravando no mesmo atributo se dessincronizam (e a limpeza deixaria "dark" para trás).
  return (
    <section
      aria-label="Listas e dados"
      className="mt-6 flex flex-col gap-8 rounded-painel border border-fio bg-app p-6 font-sans text-corpo text-fg"
    >
      <header>
        <h2 className="text-secao">Listas e dados · Sala escura</h2>
        <p className="text-pequeno text-fg-3">O tema vem da chave da seção "Estado e navegação".</p>
      </header>
      <CartoesDoKit />
      <ListaDoKit />
      <TabelaDoKit />
      <KpisDoKit />
      <EstadosDoKit />
    </section>
  );
}
