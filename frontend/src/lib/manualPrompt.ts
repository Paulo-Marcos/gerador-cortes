const FENCED_CODE_BLOCK_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;
const JSON_CODE_BLOCK_INSTRUCTION = [
  'INSTRUCAO PARA CHAT EXTERNO:',
  'Esta instrucao substitui qualquer pedido anterior de responder sem markdown ou JSON puro.',
  'Responda em um bloco de codigo JSON, usando exatamente este formato:',
  '```json',
  '{ ... }',
  '```',
  'Dentro do bloco, inclua somente JSON valido, sem comentarios.',
  'Nao escreva explicacoes antes ou depois do bloco.',
  'Ao clicar em copiar no bloco de codigo, o conteudo copiado deve ser diretamente importavel pela aplicacao.',
].join('\n');

type ManualPromptResponseLike = {
  prompt?: string;
  prompts?: Array<{ texto: string }>;
};

export function extractJsonText(input: string): string {
  const trimmed = input.trim();
  const codeBlock = trimmed.match(FENCED_CODE_BLOCK_PATTERN);

  return (codeBlock?.[1] ?? trimmed).trim();
}

export function parseManualJson(input: string): unknown {
  return JSON.parse(extractJsonText(input));
}

export function ensureJsonCodeBlockInstruction(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed || trimmed.includes(JSON_CODE_BLOCK_INSTRUCTION)) return trimmed;

  return `${trimmed}\n\n${JSON_CODE_BLOCK_INSTRUCTION}`;
}

export function getManualPromptText(
  data: ManualPromptResponseLike | undefined,
  partIndex = 0,
): string {
  const prompt = data?.prompts?.[partIndex]?.texto ?? data?.prompt ?? '';

  return ensureJsonCodeBlockInstruction(prompt);
}
