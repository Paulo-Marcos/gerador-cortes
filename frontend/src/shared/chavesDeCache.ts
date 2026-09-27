// As chaves de cache que mais de uma feature lê ou invalida. Moram aqui, sem
// depender de nenhuma, para que o editor e o detalhe do projeto não precisem se
// importar um ao outro só para saber o nome de uma query (D-723).

export const corteKey = (id: string) => ['corte', id] as const;
export const cortesProjetoKey = (id: string) => ['cortes', 'projeto', id] as const;
export const projetoKey = (id: string) => ['projeto', id] as const;
export const exportStatusKey = (id: string) => ['projeto', id, 'export-status'] as const;
