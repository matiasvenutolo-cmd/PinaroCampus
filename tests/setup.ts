import { config } from "dotenv";

// Vitest carga los setupFiles (y los ejecuta del todo) antes de importar los
// archivos de test, así que acá sí se puede garantizar que .env.local está
// cargado antes de que cualquier test importe `src/env.ts` transitivamente.
config({ path: ".env.local" });
