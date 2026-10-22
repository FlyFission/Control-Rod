import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/** Directory of JSON Schemas generated from spec/ by TypeSpec. Never hand-edited. */
export const schemaDir = fileURLToPath(
  new URL("../../../spec/generated/json-schema/", import.meta.url),
);

/** Loads every generated record schema into one strict JSON Schema 2020-12 validator. */
export function loadValidator(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats.default(ajv);
  for (const file of readdirSync(schemaDir).filter((f) => f.endsWith(".json")).sort()) {
    ajv.addSchema(JSON.parse(readFileSync(schemaDir + file, "utf8")) as object);
  }
  return ajv;
}
