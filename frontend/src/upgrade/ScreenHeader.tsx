import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import { Button } from '@/components/ui/button';
import { OverflowMenu, type OverflowMenuItem } from '@/components/ui/overflow-menu';
import type { ProviderIA } from '@/lib/providerIa';
import { Icon, type IconName } from './Icon';
import { BotaoDeBusca } from './PontaDaBarra';
import { menuDoTrilho, type Grupo, type Migalha, type TelaId } from './upgradeRoutes';

// ─────────────────────────────────────────────────────────────────
// D-599 · O cabeçalho de tela.
//
// O subtítulo nunca é decorativo: ele carrega número ("14 cortes · 3 fire ·
// 412 MB"). É o painel de instrumentos da tela, não a legenda dela. Nas telas
// densas esta faixa não é montada: subtítulo e ações sobem para a linha do topo.
//
// D-1137 (E-069 H-13; DIRECAO §7.0): fora de uma live não há barra no topo, e o
// cabeçalho é a tela se apresentando: o sobretítulo em íris (o grupo do trilho,
// ou a live), o `h1` em display (peso 300) com UMA palavra em 800 no feixe — um
// dos lugares marcados do feixe (§3.1) —, a busca Ctrl K em pílula e as ações.
// ─────────────────────────────────────────────────────────────────

export type ScreenAction = {
  icone: IconName;
  texto: string;
  forte?: boolean;
  onClick?: () => void;
  /** Ação de IA: o verbo é dito uma vez e o provedor vira a escolha final,
   *  por ícone (D-609). Com isto, `onClick` é ignorado; o `icone` segue para
   *  o AcaoDeIa (antes era ignorado, e "Analisar padrões" saía com o brilho
   *  em vez do cérebro — D-858). */
  ia?: { emVoo: ProviderIA | null; onGerar: (provider: ProviderIA) => void };
  /** D-867: ação que abre um menu — o "Mais" (⋯) das ações raras da tela.
   *  Com isto, `onClick` é ignorado e o `texto` vira o rótulo do gatilho.
   *  Nas telas densas é a própria linha do topo que junta as ações simples
   *  num Mais quando aperta (D-877, `juntarNoMais`); o painel desce porque
   *  a linha corta só de lado (D-876). */
  menu?: OverflowMenuItem[];
};

const NOME_DO_GRUPO: Record<Grupo, string> = {
  producao: 'Produção',
  inteligencia: 'Inteligência',
  ferramentas: 'Ferramentas',
};

/** O sobretítulo: o grupo do trilho a que a tela pertence (a Fila de render mora em
 *  Produção). Fora de qualquer grupo, a migalha de cima. */
export function sobretituloDaTela(tela: TelaId, trilha: Migalha[]): string | undefined {
  const menu = menuDoTrilho();
  const grupo: Grupo | undefined =
    tela === 'fila' ? 'producao' : (Object.keys(menu) as Grupo[]).find((g) => menu[g].some((i) => i.telas.includes(tela)));
  if (grupo) return NOME_DO_GRUPO[grupo];
  return trilha.length > 1 ? trilha[trilha.length - 2].texto : undefined;
}

/** O título em duas partes: o que fica em 300 e a última palavra, que vai em 800 no feixe. */
export function partesDoTitulo(titulo: string): [inicio: string, destaque: string] {
  const corte = titulo.trimEnd().lastIndexOf(' ');
  return corte < 0 ? ['', titulo.trim()] : [titulo.slice(0, corte + 1), titulo.slice(corte + 1).trim()];
}

type ScreenHeaderProps = {
  titulo: string;
  sobretitulo?: string;
  sub?: string;
  acoes?: ScreenAction[];
  /** Fora de uma live a busca mora aqui; dentro, na linha do topo. */
  onAbrirBusca?: () => void;
};

export function AcoesDaTela({ acoes = [] }: { acoes?: ScreenAction[] }) {
  return (
    <>
      {acoes.map((a) =>
        a.menu ? (
          <OverflowMenu key={a.texto} items={a.menu} texto={a.texto} align="right" />
        ) : a.ia ? (
          <AcaoDeIa
            key={a.texto}
            rotulo={a.texto}
            icone={a.icone}
            tamanho="sm"
            // A altura do `.btn` do design (30 px): lado a lado, os dois têm de
            // parecer a mesma família de botão.
            className="h-[30px]"
            destaque={a.forte}
            emVoo={a.ia.emVoo}
            onGerar={a.ia.onGerar}
          />
        ) : (
          <Button
            key={a.texto}
            type="button"
            variant={a.forte ? 'primario' : 'secundario'}
            size="pq"
            onClick={a.onClick}
          >
            <Icon name={a.icone} />
            {a.texto}
          </Button>
        ),
      )}
    </>
  );
}

export function ScreenHeader({ titulo, sobretitulo, sub, acoes = [], onAbrirBusca }: ScreenHeaderProps) {
  const [inicio, destaque] = partesDoTitulo(titulo);
  return (
    <div className="flex flex-none flex-wrap items-end gap-x-4 gap-y-3 px-6 pb-4 pt-6">
      <div className="min-w-0 flex-1">
        {sobretitulo ? <p className="mb-1 truncate text-pequeno font-semibold text-iris">{sobretitulo}</p> : null}
        <h1 className="truncate text-display font-light">
          {inicio}
          <span className="font-extrabold text-feixe">{destaque}</span>
        </h1>
        {sub ? <p className="mt-1 truncate text-corpo text-fg-2">{sub}</p> : null}
      </div>
      {onAbrirBusca ? <BotaoDeBusca larga onAbrir={onAbrirBusca} /> : null}
      <div className="flex flex-none flex-wrap items-center gap-2">
        <AcoesDaTela acoes={acoes} />
      </div>
    </div>
  );
}
