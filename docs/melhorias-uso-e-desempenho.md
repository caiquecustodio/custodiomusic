# Melhorias de uso e prioridade de desempenho

## Recursos disponíveis

- Retomada da última faixa e posição, inicialmente pausada. Checkpoint a cada cinco segundos, ao pausar e ao sair do primeiro plano. Requer URI ainda acessível; URLs `blob:` da prévia web expiram ao fechar a sessão e não são restauradas.
- Fila editável: arraste a alça das faixas visíveis ou use os botões para subir/descer; remover da fila não exclui o áudio. “Tocar a seguir” nas linhas da biblioteca também tem prioridade no modo aleatório. Uma faixa explicitamente repetida continua repetindo até troca manual ou mudança de modo.
- Modo cantar, acessível pelo player: letras maiores, acompanhamento e tela acordada enquanto a tela está em foco. “Marcar tempos das frases” permite registrar o início de cada frase, desfazer, revisar e salvar uma letra LRC local. Todos os tempos precisam ser crescentes e todas as frases marcadas. Esses dados são preservados pelas buscas automáticas.
- Trecho A–B e temporizador de 15/30/60 minutos ou fim da música ficam em “Treinar trecho e temporizador”. Trocar de faixa desativa o trecho. O temporizador não é persistido entre execuções.
- Biblioteca ordenável por título, artista e álbum, mantendo a opção de ordem original. Playlists podem ser renomeadas, excluídas e ter músicas retiradas.
- Backup JSON em Configurações: favoritos, playlists, preferências, letras e ajustes de tempo. Áudios e imagens ficam fora do arquivo. Restauração validada e confirmada na tela; músicas são relacionadas por ID ou correspondência única de título/artista/duração. Músicas ausentes são informadas, sem inventar arquivos locais.

## Mudanças para manter o app leve

- Espectrograma e visualizador circular foram removidos da interface e do código. Também foram removidos a decodificação PCM/FFT, a geração de espectros e seus caches. O módulo Android existente agora só lê metadados/capas/letras; seu identificador foi mantido para preservar a integração.
- O contexto global não acompanha os ticks de posição. Ele só publica mudanças relevantes de reprodução: carregamento, duração, play/pause, buffer, término e erro. Isso evita invalidar biblioteca e configurações quatro vezes por segundo por causa do relógio.
- Posição em tempo real é assinada nas interfaces que a utilizam, enquanto estão em foco. Ferramentas fechadas não mantêm sua própria assinatura do relógio. O contador do temporizador atualiza apenas seu próprio texto.
- Repetição A–B só registra seu listener quando há um trecho completo; o temporizador só monitora o prazo enquanto está ativo.
- Leitura de metadados da biblioteca limitada a oito operações nativas simultâneas. Gravações da biblioteca agrupadas em uma janela de 300 ms, com tentativa adicional ao ir para segundo plano.
- Atualizações de download que não mudam os dados finais preservam a referência da biblioteca, inclusive depois de corrigir título ou baixar uma capa.
- Identificadores antigos da prévia web que contêm URLs de áudio são abreviados no backup para impedir que áudio entre no JSON por acidente.

## Verificações e limites

Testes cobrem fila, ordenação, LRC manual, validação/restauração de backup, seleção de letras, reprodução e regressões de desempenho. Um teste simula 1.200 ticks de posição sem invalidar o resumo global; outro confirma que a varredura não passa de oito operações simultâneas. Isso verifica o comportamento do código, sem representar um benchmark de tempo de resposta no celular.

Na prévia web foram conferidos importação de áudio/letra de demonstração, abertura do modo cantar, marcação de três frases e salvamento com mudança de “aproximada” para “sincronizada”. Após retirar os visualizadores, foi conferida a presença apenas das abas Capa e Letra.

Ainda precisam de validação em aparelho: arraste com gestos nativos, retomada após encerrar o processo, disponibilidade de arquivos importados, wake lock, compartilhamento de backup, interrupções e temporizador com o sistema suspendendo JavaScript. O temporizador e A–B usam eventos/relógio JavaScript; não há promessa de precisão com o processo suspenso pelo sistema.

Nenhum comando de geração de APK foi executado nesta etapa. A verificação do módulo Kotlin gera apenas classes de compilação, não um instalador. As dependências `expo-keep-awake` e `expo-sharing` foram adicionadas em versões compatíveis; a configuração será incluída na geração manual final.
