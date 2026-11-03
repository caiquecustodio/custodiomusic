# Revisão de layout e design

## Problemas encontrados e ajustes aplicados

| Antes | Ajuste | Benefício |
| --- | --- | --- |
| Navegação concentrada em ícones no topo | Barra inferior com Biblioteca, Descobrir, Fila e Ajustes | Destinos principais acessíveis com uma mão e com rótulos. |
| Botões com pesos visuais semelhantes | Variação primária preenchida e ações secundárias discretas | Fica mais claro qual é a próxima ação. |
| Biblioteca sem ponto de entrada para ouvir | Cartão com gradiente suave para iniciar ou continuar a reprodução | Destaque para o conteúdo e para a faixa atual. |
| Abas horizontais cortadas em telas estreitas | Controle segmentado para músicas, favoritos e playlists | As três opções permanecem visíveis. |
| Muitas ações de sincronização abertas no player | Cartão com opções avançadas recolhidas em Mais opções | Menos poluição visual, mantendo todos os recursos acessíveis. |
| Capa grande em telas baixas | Tamanho limitado pela largura e pela altura disponíveis | Reduz a distância até os controles de reprodução. |
| Pouca distinção da faixa atual | Fundo e texto de destaque, além do indicador na capa | Facilita localizar a música em reprodução. |
| Playlists como botões comuns | Cartões com nome, quantidade e ação de abertura | Hierarquia visual mais clara. |
| Preferências booleanas como botões de texto | Interruptores rotulados para tema e sincronização | Estado ligado/desligado mais fácil de reconhecer. |
| Progresso da sincronização apenas numérico | Barra de progresso com informação acessível | Melhor acompanhamento de operações longas. |
| Conteúdo muito largo na prévia desktop | Área principal limitada a 760 px | Legibilidade e coerência com o aplicativo móvel. |

## Identidade visual

Mantida a identidade roxa. O tema escuro recebeu superfícies mais quentes, bordas mais definidas e texto secundário mais claro. Controles reutilizam espaçamentos, cantos e áreas mínimas de toque. A barra inferior e o miniplayer ocupam espaço próprio, sem cobrir o conteúdo rolável.

## Validação e limites

Biblioteca e configurações conferidas na prévia web com viewport de 390 × 844, incluindo troca entre temas claro e escuro e navegação inferior. Uma incompatibilidade de propriedades de acessibilidade dos ícones SVG na web foi corrigida durante a inspeção. TypeScript, lint e os 24 testes de reprodução/metadados são a verificação complementar.

A prévia estava sem músicas importadas. Player com arquivos reais, tamanhos maiores de fonte, teclado e áreas seguras de diferentes aparelhos ainda precisam de validação no APK atualizado.
