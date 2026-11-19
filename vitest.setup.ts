import "@testing-library/jest-dom/vitest";

import { configure } from "@testing-library/react";

// O `findBy` esperava 1 s: sob a suíte inteira em paralelo, o aviso que
// aparece depois de uma resposta assíncrona chegava depois disso, e o teste
// falhava sem defeito nenhum (19/nov). Ver `testTimeout` em `vitest.config.mts`.
configure({ asyncUtilTimeout: 3_000 });
