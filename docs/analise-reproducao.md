# Reprodução: análise funcional

## Já disponível no código

Biblioteca local, importação de arquivos e pastas, busca por título e artista, favoritos, criação de playlists, fila, miniplayer, busca de posição, saltos de 10 segundos, capas, visualizador, temas e configuração de áudio em segundo plano. Há integração de metadados com a tela bloqueada; os comandos do sistema precisam de validação em dispositivo.

## Implementado nesta alteração

- Avanço automático dentro da fila, ignorando IDs sem arquivo disponível na biblioteca. Sem repetição, para no fim.
- Aleatório: percorre as faixas sem repetir antes de concluir o ciclo. Anterior usa o histórico da sessão.
- Botão de modo: sem repetição → repetir fila → repetir uma música → tocar só esta → sem repetição.
- Repetir uma música usa o loop nativo. Tocar só esta encerra ao fim da faixa; os botões de troca manual continuam funcionando.
- Preferências de aleatório e repetição persistidas com as demais configurações. A migração preserva favoritos e playlists existentes.
- Ao dar play novamente depois do término, a faixa começa do início.

## Melhorias recomendadas, ainda não implementadas

| Prioridade | Recurso | Benefício |
| --- | --- | --- |
| Alta | Editar fila: remover, mover e tocar a seguir | Controlar a sequência sem selecionar outra biblioteca ou playlist. |
| Alta | Temporizador: minutos ou fim da faixa | Parar a reprodução ao dormir. |
| Alta | Retomar faixa e posição depois de reabrir | Evitar perder o ponto da reprodução. |
| Média | Renomear/excluir playlists e remover faixas | Completar o gerenciamento das coleções. |
| Média | Ordenação por título, artista e duração | Facilitar encontrar faixas em bibliotecas grandes. |
| Média | Histórico de reprodução persistente | Reencontrar músicas ouvidas recentemente. |
| Posterior | Equalizador, normalização e transição entre faixas | Exigem avaliação do suporte nativo e testes de qualidade de áudio. |

## Referências

- [Spotify: controles de fila, repetição, aleatório e temporizador](https://newsroom.spotify.com/2025-05-07/experience-a-new-dimension-of-music-discovery-with-more-controls-and-enhanced-tools/).
- [Spotify: edição da fila e organização de playlists](https://newsroom.spotify.com/2026-05-28/playlist-folders-mobile-queue-controls-updates/).
- [Expo Audio SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/audio/): comportamento do player, loop e reprodução em segundo plano.

## Validação

Testes automatizados cobrem avanço, fim da fila, repetição, tocar só esta, troca manual, ciclos aleatórios e filas vazias ou com uma faixa. A reprodução real, interrupções e continuidade com a tela bloqueada devem ser verificadas em dispositivo com arquivos de áudio.
