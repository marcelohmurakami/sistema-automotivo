import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "tmp", "backups", "output", "n8n/diagnostico-whatsapp.js"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/orcamentos"],
              importNames: ["rpc", "dinheiro"],
              message:
                "Use lib/rpc ou lib/formatacao; infraestrutura não pertence ao serviço de orçamentos.",
            },
          ],
        },
      ],
    },
  },
]);
