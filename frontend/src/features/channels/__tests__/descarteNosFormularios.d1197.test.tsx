import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { Modal } from '@/components/ui/modal';
import { assentar, montarComElementos } from '@/components/ui/__tests__/domDeElementos';
import type { Canal } from '../api/canais';
import type { EditorialScaffold } from '../api/scaffolds';
import type { EditorialSkill } from '../api/skillsEditoriais';
import type { PromptUtilitario } from '../api/promptsUtilitarios';
import { ChannelForm } from '../ChannelForm';
import { EditorialScaffoldForm } from '../EditorialScaffoldForm';
import { EditorialSkillForm } from '../EditorialSkillForm';
import { PromptUtilitarioForm } from '../PromptUtilitarioForm';

// D-1197: os formulários com Salvar explícito que abrem em diálogo, cada um dentro do
// `Modal` de verdade, como em Configurações. Intocado, o X fecha direto; mexido, pergunta.

vi.mock('@radix-ui/react-dialog', () => import('@/components/ui/__tests__/radixDeMentira'));

const fechou = vi.fn();
const nada = () => undefined;

const canal = {
  id: 'meu-canal',
  nome: 'Meu Canal',
  handle: '@meucanal',
  credito: 'Meu Canal',
  youtube_channel_id: '',
  paleta: { primaria: '#000000', secundaria: '#ffffff', acento: '' },
} as unknown as Canal;

const scaffold = { scaffold: 'corpo {x}', placeholders: ['x'], marcador: '' } as unknown as EditorialScaffold;
const prompt = { prompt: 'corpo {x}', placeholders: ['x'], marcador: '' } as unknown as PromptUtilitario;
const params = { faixa: 'media', thinking_tokens: 0, timeout: 300 };
const skill = {
  corpo: 'corpo',
  params,
  params_default: params,
  lentes: ['uma'],
  lentes_default: ['uma'],
} as unknown as EditorialSkill;

const comuns = { pending: false, onCancel: nada };
const FORMULARIOS: [string, ReactElement, string, string][] = [
  [
    'identidade do canal',
    <ChannelForm {...comuns} mode="editar" initial={canal} onSubmit={nada} />,
    'canal-nome',
    'Meu Canal',
  ],
  [
    'paleta do canal',
    <ChannelForm {...comuns} mode="editar" initial={canal} onSubmit={nada} />,
    'canal-primaria',
    '#000000',
  ],
  ['canal novo', <ChannelForm {...comuns} mode="criar" onSubmit={nada} />, 'canal-id', ''],
  [
    'scaffold',
    <EditorialScaffoldForm {...comuns} scaffold={scaffold} onSave={nada} onReset={nada} />,
    'scaffold-texto',
    'corpo {x}',
  ],
  [
    'prompt utilitário',
    <PromptUtilitarioForm {...comuns} prompt={prompt} onSave={nada} onReset={nada} />,
    'prompt-utilitario-texto',
    'corpo {x}',
  ],
  [
    'skill (timeout)',
    <EditorialSkillForm {...comuns} skill={skill} onSave={nada} onReset={nada} />,
    'skill-timeout',
    '300',
  ],
];

let tela: ReturnType<typeof montarComElementos>;
afterEach(async () => {
  await tela.limpar();
  fechou.mockReset();
});

const apertarX = () =>
  tela.disparar(tela.achar((n) => n.props['aria-label'] === 'Fechar')[0], 'onClick');

describe.each(FORMULARIOS)('formulário de %s no diálogo (D-1197)', (_, formulario, campo, original) => {
  const abrir = async () => {
    tela = montarComElementos(
      <Modal open onClose={fechou} title="Editar">
        {formulario}
      </Modal>,
    );
    await assentar();
  };

  it('intocado, fecha sem perguntar', async () => {
    await abrir();
    await apertarX();
    expect(fechou).toHaveBeenCalledOnce();
  });

  it('com texto não salvo, pergunta antes de descartar', async () => {
    await abrir();
    await tela.digitar(tela.porId(campo), '999');
    await apertarX();

    expect(fechou).not.toHaveBeenCalled();
    expect(tela.texto()).toContain('Descartar alterações?');
    expect(tela.porId(campo).props.value).toBe('999');
  });

  it('voltando ao valor gravado, fecha sem perguntar', async () => {
    await abrir();
    await tela.digitar(tela.porId(campo), '999');
    await tela.digitar(tela.porId(campo), original);
    await apertarX();
    expect(fechou).toHaveBeenCalledOnce();
  });
});
