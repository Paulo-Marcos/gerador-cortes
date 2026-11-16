import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { Etiqueta } from '@/components/ui/etiqueta';
import { Segmented } from '@/components/ui/segmented';
import { Selo, TONS_DO_SELO, type TomDoSelo } from '@/components/ui/selo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// D-1117 (E-069 H-09) · seção "Estado e navegação" do Kit: selo, etiqueta, chip,
// abas e segmented, na linguagem Sala escura (DIRECAO §3, §5). Só a vitrine:
// nenhuma tela usa estes componentes ainda.

const ROTULO_DO_TOM: Record<TomDoSelo, string> = {
  inerte: 'Aguardando',
  neutro: 'Em edição',
  curso: 'Baixando',
  convite: 'Pronto',
  ok: 'No ar',
  erro: 'Falhou',
};

const SENTIDO_DO_TOM: Record<TomDoSelo, string> = {
  inerte: 'ninguém tem a vez',
  neutro: 'a live segue o fluxo',
  curso: 'a máquina trabalha',
  convite: 'a vez é do operador',
  ok: 'nada a fazer',
  erro: 'travou',
};

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[11px] uppercase tracking-wider text-fg-3">{titulo}</h3>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export function KitEstado() {
  const [tema, setTema] = useState<'dark' | 'light'>('dark');
  const [ligados, setLigados] = useState<Record<string, boolean>>({ prontos: true });
  const [visao, setVisao] = useState('mapa');

  // Os tokens `--cc-*` moram no <html>: o seletor de tema da seção troca o do
  // documento inteiro, e a seção devolve o que encontrou ao sair.
  useEffect(() => {
    const raiz = document.documentElement;
    const anterior = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', tema);
    return () => {
      if (anterior === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', anterior);
    };
  }, [tema]);

  const alternar = (chave: string) => setLigados((l) => ({ ...l, [chave]: !l[chave] }));

  return (
    <section
      aria-label="Estado e navegação"
      className="mt-6 flex flex-col gap-8 rounded-painel border border-fio bg-app p-6 font-sans text-[13px] text-fg"
    >
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-secao">Estado e navegação · Sala escura</h2>
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

      <Bloco titulo="Selo · seis tons, cada um com forma própria">
        {TONS_DO_SELO.map((tom) => (
          <div key={tom} className="flex flex-col items-start gap-1.5">
            <Selo tom={tom}>{ROTULO_DO_TOM[tom]}</Selo>
            <span className="text-[11px] text-fg-3">
              {tom} · {SENTIDO_DO_TOM[tom]}
            </span>
          </div>
        ))}
      </Bloco>

      <Bloco titulo="Etiqueta · classifica, não diz estado">
        <Etiqueta>Podcast</Etiqueta>
        <Etiqueta>Entrevista</Etiqueta>
        <Etiqueta>42 min</Etiqueta>
      </Bloco>

      <Bloco titulo="Chip · repouso, ligado (visto), desabilitado · use Tab para o foco">
        <Chip pressionado={!!ligados.prontos} contagem={6} onClick={() => alternar('prontos')}>
          Prontos
        </Chip>
        <Chip pressionado={!!ligados.propostos} contagem={3} onClick={() => alternar('propostos')}>
          Propostos
        </Chip>
        <Chip pressionado={!!ligados.riscados} onClick={() => alternar('riscados')}>
          Riscados
        </Chip>
        <Chip disabled contagem={0}>
          No ar
        </Chip>
      </Bloco>

      <Bloco titulo="Abas · o traço da aba atual é o feixe">
        <Tabs defaultValue="mapa" className="w-full">
          <TabsList aria-label="Visões da live">
            <TabsTrigger value="mapa">Mapa</TabsTrigger>
            <TabsTrigger value="lista">Lista</TabsTrigger>
            <TabsTrigger value="fila">Fila</TabsTrigger>
            <TabsTrigger value="shorts" disabled>
              Shorts
            </TabsTrigger>
          </TabsList>
          <TabsContent value="mapa" className="pt-3 text-fg-2">
            Os cortes da live, na ordem em que acontecem.
          </TabsContent>
          <TabsContent value="lista" className="pt-3 text-fg-2">
            Os mesmos cortes, em linhas.
          </TabsContent>
          <TabsContent value="fila" className="pt-3 text-fg-2">
            O que espera render.
          </TabsContent>
        </Tabs>
      </Bloco>

      <Bloco titulo="Segmented · um entre poucos, o escolhido leva visto">
        <Segmented
          aria-label="Visão dos cortes"
          value={visao}
          onValueChange={setVisao}
          opcoes={[
            { valor: 'mapa', rotulo: 'Mapa' },
            { valor: 'lista', rotulo: 'Lista' },
            { valor: 'grade', rotulo: 'Grade', desabilitado: true },
          ]}
        />
        <Segmented
          cheio
          className="max-w-sm"
          aria-label="Quando publicar"
          value="agora"
          onValueChange={() => {}}
          opcoes={[
            { valor: 'agora', rotulo: 'Agora' },
            { valor: 'agendar', rotulo: 'Agendar' },
          ]}
        />
      </Bloco>
    </section>
  );
}
