import { z } from "zod";
import { cenaSchema } from "./schema";

// D-725: o contrato da cena para quem não fala zod — o backend, que grava as
// cenas que o worker vai renderizar. Sai do MESMO schema que valida o render,
// no formato de saída (depois da normalização dos tempos). O arquivo gerado
// mora em video-renderer/protocol/cena.schema.json; um teste do frontend
// recusa o arquivo quando ele fica para trás do schema.
export const cenaEmJsonSchema = () => z.toJSONSchema(cenaSchema, { io: "output" });
