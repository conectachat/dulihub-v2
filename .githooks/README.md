# Ganchos de git

`pre-commit` roda tipos e lint antes de cada commit. Se algo falhar, o commit
não acontece e a mensagem diz o quê.

Ligados por `core.hooksPath`, que é configuração local — não vem junto no
clone. Numa máquina nova, uma vez:

    git config core.hooksPath .githooks

Ficam aqui, versionados, em vez de `.git/hooks/`, que o git não versiona e que
some no primeiro clone.

Sem dependência nova de propósito: `husky` e `lint-staged` resolveriam o mesmo
com dois pacotes a mais para manter, num projeto de uma pessoa.
