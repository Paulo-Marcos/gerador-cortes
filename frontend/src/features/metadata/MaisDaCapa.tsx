import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Menu, MenuContent, MenuGrupo, MenuItem, MenuRotulo, MenuSeparador, MenuTrigger } from '@/components/ui/menu';

// D-1167 (E-069 H-19, DIRECAO §7.5): o "Mais" das capas. Duas famílias de gesto, e o menu as
// separa para o operador não procurar uma ação de arte entre as de prompt:
//   Arte   → o que muda a IMAGEM da capa (colar, quadro do vídeo, estilizar, atualizar texto)
//   Prompt → o que mexe no PROMPT que gera a imagem (copiar, refazer com o Claude ou o Gemini)
// Item sem como rodar agora fica `desligado` (aria-disabled): continua no teclado e o `dica`
// diz o porquê (D-439), em vez de sumir e mudar o menu de lugar.

export type ItemDoMais = {
  icone: IconName;
  rotulo: string;
  onSelect: () => void;
  desligado?: boolean;
  /** O porquê de estar desligado, ou o que o item faz quando o rótulo não basta. */
  dica?: string;
  perigo?: boolean;
};

export type GrupoDoMais = { rotulo: 'Arte' | 'Prompt'; itens: ItemDoMais[] };

export function MaisDaCapa({
  rotulo,
  grupos,
  desabilitado = false,
  aberto,
}: {
  /** O nome acessível do gatilho: "Mais da capa do TikTok". */
  rotulo: string;
  grupos: GrupoDoMais[];
  desabilitado?: boolean;
  /** Só o teste em servidor força o menu aberto; no app quem abre é o Radix. */
  aberto?: boolean;
}) {
  return (
    <Menu {...(aberto === undefined ? {} : { open: aberto })}>
      <MenuTrigger asChild>
        <Button type="button" variant="secundario" size="pq" disabled={desabilitado} aria-label={rotulo}>
          <Icon name="more-horizontal" />
          Mais
        </Button>
      </MenuTrigger>
      <MenuContent align="end" portal={aberto === undefined}>
        {grupos.map((grupo, indice) => (
          <MenuGrupo key={grupo.rotulo} aria-label={grupo.rotulo}>
            {indice > 0 && <MenuSeparador />}
            <MenuRotulo>{grupo.rotulo}</MenuRotulo>
            {grupo.itens.map((item) => (
              <MenuItem
                key={item.rotulo}
                icone={item.icone}
                perigo={item.perigo}
                desligado={item.desligado}
                title={item.dica}
                onSelect={item.onSelect}
              >
                {item.rotulo}
              </MenuItem>
            ))}
          </MenuGrupo>
        ))}
      </MenuContent>
    </Menu>
  );
}
