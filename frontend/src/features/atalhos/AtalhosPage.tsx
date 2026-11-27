// D-1178 (E-069 H-23; DIRECAO §7.13): na Sala escura, com `Tabela`, `Segmented`, `Busca` e
// `Kbd`; as Novidades (D-922) entram aqui como a segunda aba. Tela de configuração de teclas:
// sem primário. Etapa 7 + D-394 (validação 1): página de Atalhos estilo VS Code,
// renderizada do shortcutsRegistry e agora EDITÁVEL — cada linha aceita
// reatribuição de tecla (overlay `wb-keybindings-v1` em localStorage),
// com validação de conflito via assertNoShortcutConflicts. A nova
// combinação vale para todas as telas ao recarregar a página.
import { useEffect, useMemo, useState } from 'react';
import type { ShortcutBinding } from '@/shared/atalhos/shortcuts';
import {
  assertNoShortcutConflicts,
  clearKeybindingsOverlay,
  effectiveShortcutSpecs,
  loadKeybindingsOverlay,
  saveKeybindingOverride,
  shortcutCombo,
  type KeybindingsOverlay,
  type KeyOverride,
  type ShortcutId,
  type ShortcutScreen,
} from '@/shared/atalhos/shortcutsRegistry';
import { Button } from '@/components/ui/button';
import { Busca } from '@/components/ui/busca';
import { EstadoVazio } from '@/components/ui/estado-vazio';
import { Icon, ICONE_DO_CONCEITO } from '@/components/ui/icon';
import { Kbd } from '@/components/ui/kbd';
import { Segmented } from '@/components/ui/segmented';
import { Selo } from '@/components/ui/selo';
import {
  Tabela,
  TabelaCabeca,
  TabelaCelula,
  TabelaCorpo,
  TabelaLinha,
  TabelaTitulo,
} from '@/components/ui/tabela';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NovidadesPage from '@/features/novidades/NovidadesPage';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDefinirChrome } from '@/upgrade/UpgradeChrome';

const TELAS: Array<{ id: ShortcutScreen | 'todas'; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'global', rotulo: 'Global / Shell' },
  { id: 'bruto', rotulo: 'Editor Bruto' },
  { id: 'shorts', rotulo: 'Shorts' },
  { id: 'pos', rotulo: 'Pós-produção' },
  { id: 'pos-timeline', rotulo: 'Timeline da Pós' },
];

const TELA_LABEL: Record<ShortcutScreen, string> = {
  global: 'Global',
  bruto: 'Bruto',
  shorts: 'Shorts',
  pos: 'Pós',
  'pos-timeline': 'Timeline · Pós',
  'pos-layout': 'Layout YT',
  'pos-cenas': 'Cenas',
};

function Combo({ combo }: { combo: string }) {
  return (
    <span className="inline-flex gap-1">
      {combo.split('+').map((parte, i) => (
        <Kbd key={i}>{parte}</Kbd>
      ))}
    </span>
  );
}

/** Converte o KeyboardEvent capturado num override do registro. */
function overrideDoEvento(event: KeyboardEvent): KeyOverride | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null;
  const ctrl = event.ctrlKey || event.metaKey;
  let mod: ShortcutBinding['mod'];
  if (ctrl && event.altKey) mod = 'ctrl+alt';
  else if (ctrl) mod = 'ctrl';
  else if (event.altKey) mod = 'alt';
  else if (event.shiftKey && event.key.length > 1) mod = 'shift';
  return { key: event.key, mod };
}

type Aba = 'atalhos' | 'novidades';

/** Estado da edição: busca, filtro de tela, captura da próxima tecla e o overlay salvo. */
function useEdicaoDeAtalhos() {
  const [busca, setBusca] = useState('');
  const [tela, setTela] = useState<ShortcutScreen | 'todas'>('todas');
  const [overlay, setOverlay] = useState<KeybindingsOverlay>(() => loadKeybindingsOverlay());
  const [capturando, setCapturando] = useState<ShortcutId | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendenteAplicar, setPendenteAplicar] = useState(false);

  const specs = useMemo(() => effectiveShortcutSpecs(overlay), [overlay]);

  // Captura da próxima tecla enquanto uma linha está em modo de edição.
  useEffect(() => {
    if (!capturando) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturando(null);
        return;
      }
      const override = overrideDoEvento(event);
      if (!override) return; // só modificador — segue capturando
      const candidato: KeybindingsOverlay = { ...overlay, [capturando]: override };
      try {
        assertNoShortcutConflicts(effectiveShortcutSpecs(candidato));
      } catch (conflito) {
        setErro(
          conflito instanceof Error
            ? conflito.message.split('\n')[1]?.trim() || conflito.message
            : 'Conflito de atalhos.',
        );
        setCapturando(null);
        return;
      }
      saveKeybindingOverride(capturando, override);
      setOverlay(candidato);
      setErro(null);
      setPendenteAplicar(true);
      setCapturando(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturando, overlay]);

  const linhas = useMemo(() => {
    const query = busca.trim().toLowerCase();
    return specs.filter((spec) => {
      if (tela !== 'todas' && spec.screen !== tela) return false;
      if (!query) return true;
      return `${spec.description} ${spec.id} ${shortcutCombo(spec)}`.toLowerCase().includes(query);
    });
  }, [busca, tela, specs]);

  const restaurarLinha = (id: ShortcutId) => {
    saveKeybindingOverride(id, null);
    setOverlay(loadKeybindingsOverlay());
    setErro(null);
    setPendenteAplicar(true);
  };

  const restaurarTudo = () => {
    clearKeybindingsOverlay();
    setOverlay({});
    setErro(null);
    setPendenteAplicar(true);
  };

  const totalCustom = Object.keys(overlay).length;

  return {
    busca, setBusca, tela, setTela, overlay, capturando, setCapturando, erro, setErro,
    pendenteAplicar, specs, linhas, restaurarLinha, restaurarTudo, totalCustom,
  };
}

type Edicao = ReturnType<typeof useEdicaoDeAtalhos>;

/** Erro de conflito, contagem de personalizados e os botões de aplicar/restaurar. */
function FaixaDeEstado({ e }: { e: Edicao }) {
  const { erro, totalCustom, pendenteAplicar, restaurarTudo } = e;
  if (!erro && !pendenteAplicar && totalCustom === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {erro && <Selo tom="erro">Conflito: {erro}</Selo>}
      {totalCustom > 0 && (
        <Selo tom="neutro">
          {totalCustom} atalho{totalCustom > 1 ? 's' : ''} customizado
          {totalCustom > 1 ? 's' : ''}
        </Selo>
      )}
      {pendenteAplicar && (
        <Button variant="secundario" size="pq" onClick={() => window.location.reload()}>
          <Icon name="refresh-cw" />
          Aplicar mudanças (recarrega a página)
        </Button>
      )}
      {totalCustom > 0 && (
        <Button variant="fantasma" size="pq" onClick={restaurarTudo}>
          Restaurar todos os padrões
        </Button>
      )}
    </div>
  );
}

function LinhaDoAtalho({ e, spec }: { e: Edicao; spec: Edicao['specs'][number] }) {
  const custom = Boolean(e.overlay[spec.id]);
  const emCaptura = e.capturando === spec.id;
  return (
    <TabelaLinha>
      <TabelaCelula>
        {spec.description}
        {custom && (
          <Selo tom="neutro" className="ml-2">
            custom
          </Selo>
        )}
      </TabelaCelula>
      <TabelaCelula>
        {emCaptura ? (
          <Selo tom="convite">pressione a combinação…</Selo>
        ) : (
          <Combo combo={shortcutCombo(spec)} />
        )}
      </TabelaCelula>
      <TabelaCelula className="text-fg-3">{TELA_LABEL[spec.screen]}</TabelaCelula>
      <TabelaCelula aDireita>
        <Button
          variant="icone"
          size="pq"
          onClick={() => {
            e.setErro(null);
            e.setCapturando(emCaptura ? null : spec.id);
          }}
          aria-label={`Editar atalho de ${spec.description}`}
        >
          <Icon name={ICONE_DO_CONCEITO.editar} />
        </Button>
        {custom && (
          <Button
            variant="icone"
            size="pq"
            onClick={() => e.restaurarLinha(spec.id)}
            aria-label={`Restaurar padrão de ${spec.description}`}
            title="Restaurar padrão"
            className="ml-1"
          >
            <Icon name="rotate-ccw" />
          </Button>
        )}
      </TabelaCelula>
    </TabelaLinha>
  );
}

/** Os atalhos editáveis; a aba "Novidades" é a `NovidadesPage` da D-922. */
function TabelaDeAtalhos() {
  const e = useEdicaoDeAtalhos();
  const { specs, totalCustom, linhas } = e;

  useDefinirChrome(
    { sub: `${specs.length} atalhos · ${totalCustom} personalizados` },
    [specs.length, totalCustom],
  );

  return (
    <div className="flex min-h-0 flex-col gap-4 text-fg">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          aria-label="Tela dos atalhos"
          value={e.tela}
          onValueChange={e.setTela}
          opcoes={TELAS.map(({ id, rotulo }) => ({ valor: id, rotulo }))}
        />
        <div className="ml-auto w-[260px]">
          <Busca name="busca"
            value={e.busca}
            aoMudar={e.setBusca}
            aria-label="Buscar comando ou tecla"
            placeholder="Buscar comando ou tecla…"
          />
        </div>
      </div>

      <FaixaDeEstado e={e} />

      {linhas.length === 0 ? (
        <EstadoVazio
          icone="search"
          titulo="Nenhum atalho encontrado"
          descricao="Nenhum atalho encontrado para o filtro atual."
        />
      ) : (
        <Tabela>
          <TabelaCabeca>
            <tr>
              <TabelaTitulo>Comando</TabelaTitulo>
              <TabelaTitulo>Atalho</TabelaTitulo>
              <TabelaTitulo>Tela</TabelaTitulo>
              <TabelaTitulo aria-label="Ações" />
            </tr>
          </TabelaCabeca>
          <TabelaCorpo>
            {linhas.map((spec) => (
              <LinhaDoAtalho key={spec.id} e={e} spec={spec} />
            ))}
          </TabelaCorpo>
        </Tabela>
      )}
    </div>
  );
}

/** A aba vem da URL: /novidades é a aba Novidades, o resto é Atalhos. Assim trocar de uma
 *  rota para a outra (trilho, paleta) troca a aba, e o trilho marca a tela certa. */
export function AtalhosPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const aba: Aba = pathname.startsWith('/novidades') ? 'novidades' : 'atalhos';
  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-auto px-7 py-6 text-fg">
      <Tabs
        value={aba}
        onValueChange={(v) => navigate(v === 'novidades' ? '/novidades' : '/atalhos')}
        className="flex flex-col gap-5"
      >
        <TabsList aria-label="Atalhos e novidades">
          <TabsTrigger value="atalhos">Atalhos</TabsTrigger>
          <TabsTrigger value="novidades">Novidades</TabsTrigger>
        </TabsList>
        <TabsContent value="atalhos">
          <TabelaDeAtalhos />
        </TabsContent>
        <TabsContent value="novidades">
          <NovidadesPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
