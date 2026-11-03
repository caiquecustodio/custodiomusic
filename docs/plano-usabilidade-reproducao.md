# Plano de usabilidade e reprodução — 27/10/2026

## Escopo e evidência

Auditoria estática do código atual. Não houve medição de latência, memória, bateria nem reprodução do defeito em um telefone. O APK instalado não foi comparado ao código; funções presentes no fonte podem estar ausentes da versão usada. Nenhum comportamento do app foi alterado nesta análise.

## Diagnóstico

1. **Continuidade depende de JavaScript.** `src/lib/music.tsx` usa um único `useAudioPlayer`, troca a fonte com `replace`/`setOnlineSource` e decide a próxima faixa num efeito sobre `didJustFinish`. A fila não está entregue ao motor nativo. A suspensão de JS é uma hipótese prioritária para a parada com tela apagada, não uma causa comprovada nem uma explicação específica para exatamente duas músicas. O modo de segundo plano e os controles de bloqueio já estão configurados; verificar também o serviço no APK e logs de áudio/energia.
2. **Trabalho secundário bloqueia o início.** `playTrack` aguarda `observeListening` antes de `player.play()`. O módulo roda na thread principal e anexa o observador. O histórico não deve ser uma barreira assíncrona para ouvir. Preservar a atribuição correta de escuta ao mover essa integração para eventos de transição nativos.
3. **Online resolve a fonte sob demanda.** `downloads.stream` acontece antes da troca, sem preparação antecipada nesse fluxo. `sourceChanges` serializa mudanças e usa tokens para descartar pedidos antigos, uma proteção útil; uma operação nativa já em andamento ainda pode atrasar a intenção mais recente. Medir resolução, preparação e início separadamente.
4. **Navegação pode manter telas empilhadas.** A barra usa `router.navigate`, mas player, fila e outros destinos usam `router.push`. Player → fila → player pode criar novas entradas. Cada `Screen` também monta sua própria barra e mini player. Isso não comprova múltiplos processos de áudio: há um provider e um player globais.
5. **Já existem controles e otimizações.** O mini player tem play/pause, próxima, capa e progresso; faltam anterior e gesto lateral. A fila permite arrastar pela alça, subir/descer e remover. `usePlaybackSummary` ignora ticks de posição e `usePlaybackStatus` desliga o listener ao perder foco. Documentos antigos que dizem que toda a biblioteca atualiza a cada 250 ms estão desatualizados frente a esse código.
6. **Fila e apresentação ainda têm custo.** `queue.tsx` faz `tracks.find` para cada entrada; `QueueEntry` procura seu índice na fila. O contexto reúne biblioteca, rádio, histórico e reprodução, propagando mudanças para muitos consumidores. O player inteiro recebe progresso a cada 250 ms; isolar a região temporal evita redesenhar controles e opções.
7. **Marca precisa de conferência visual.** O mini usa `Artwork`, cujo fallback é um disco SVG genérico; não referencia diretamente o novo `custodio-mark.svg`. Conferir também capas persistidas, notificação e APK instalado antes de atribuir a imagem antiga a cache.

## Ordem de execução

### 1. Medir e assegurar continuidade

- Registrar tempos monotônicos: toque, comando, resolução da fonte, preparação e primeiro avanço de áudio. Separar arquivos locais, online, retomada e transição automática; coletar p50/p95.
- Reproduzir tela bloqueada com pelo menos 20 faixas e 60 minutos. Capturar logs do serviço, foco de áudio, erros e eventos de fim/transição. Repetir com economia de bateria e rede variável.
- Prototipar fila nativa com `useAudioPlaylist` do Expo 58. Validar antes os módulos Kotlin: `setOnlineSource` e `observeListening` recebem `AudioPlayer`, portanto a migração não é uma substituição direta de hook. Verificar MIME/fontes online, histórico por faixa, metadados, botões do sistema, repeat/shuffle, faixa única, loop A–B e temporizador. Escolher um único motor após a prova; não manter dois players concorrentes.
- Entregar ao nativo a sequência já preparada, transição, repetição e controles de mídia. Rádio precisa abastecer antecipadamente; não consultar recomendações apenas quando o áudio acabar. Garantir política explícita para fila remota esgotada ou fonte expirada.

### 2. Tornar comandos rápidos e previsíveis

- Tirar histórico, capas, letras, persistência e descoberta do caminho crítico de play e troca.
- Preparar a próxima faixa com limites de memória/rede; renovar URLs expiradas e descartar fontes obsoletas. Não baixar toda a fila para produzir sensação de rapidez.
- Centralizar intenção de reprodução e comandos para que a última ação vença. Testar pausa enquanto resolve uma fonte e dez trocas rápidas: nenhum callback antigo deve voltar a tocar ou sobrescrever erro/estado da faixa atual.
- Usar estado nativo atual para comandos; apresentar feedback imediato sem afirmar que há áudio quando ainda está carregando. Distinguir pausado, conectando, carregando e erro.

### 3. Navegação e ciclo de vida

- Manter home como raiz e definir destinos principais sem empilhamento repetido. Voltar de uma seção principal deve retornar ao home; fechar o player ou uma tela auxiliar deve respeitar a origem definida.
- Hospedar um mini player persistente no layout apropriado e ocultá-lo no player completo. Manter áudio, fila e downloads globais.
- Suspender timers visuais, animações e subscriptions de tela no blur; cancelar requisições de tela obsoletas. Manter somente tarefas intencionais como reprodução, downloads solicitados e preparação da fila.
- Separar contexto de biblioteca, comandos e status. Indexar músicas e posições da fila. Medir montagens/listeners/memória após 100 ciclos de navegação para verificar estabilização, considerando aquecimento de caches.

### 4. Usabilidade básica

- Mini player: anterior, play/pause, próxima, abrir player e acesso claro à fila; gesto horizontal na área de capa/título (esquerda avança, direita volta), sem interferir com botões ou rolagem vertical. Um gesto gera um comando; manter ações acessíveis e alvos de pelo menos 48 dp.
- Aplicar identidade atual ao fallback da capa e conferir notificação/controles de bloqueio.
- Player: destacar capa, título, artista, progresso e tempos; permitir arrastar posição com prévia e confirmar seek ao soltar. Usar atualização local suave e reconciliada com o áudio real. Letras sincronizadas quando disponíveis; visualização de espectro somente se desejada e sem análise pesada no início da faixa.
- Fila: destacar a faixa atual, separar próximas/reproduzidas visualmente, mover/remover/tocar a seguir sem reiniciar o áudio. Definir remoção da faixa atual (proposta: concluir a atual e seguir as restantes), rearranjo durante reprodução e shuffle. Melhorar feedback do arraste e autoscroll; passar índice pronto às linhas.

## Critérios de aceite propostos

- Feedback visual do toque: p95 até 100 ms; comando de pausar/retomar: p95 até 150 ms no dispositivo de referência. Medir separadamente a saída audível.
- Troca local preparada: p95 até 250 ms entre comando e avanço do áudio, como meta inicial a validar. Online: medir cache e rede separadamente; não prometer zero latência para fonte ainda não resolvida.
- Pelo menos 20 faixas/60 minutos com tela bloqueada, sem exigir acordar a tela e com histórico/metadados corretos.
- 100 ciclos de navegação sem crescimento contínuo de players, listeners ou telas duplicadas; home acessível pelo comportamento de voltar definido.
- Dez trocas rápidas e pausa durante carregamento respeitam a última intenção. Editar fila não interrompe a faixa atual. Testar arquivos locais, fontes online, downloads, modo avião, Bluetooth e interrupções de áudio.
- Validar em build de distribuição no telefone, além do debug. Testes de lógica não demonstram continuidade em segundo plano.

## Validação desta auditoria

- Typecheck passou.
- 16 testes existentes de reprodução, desempenho e organização/histórico passaram. A suíte `listening` verifica também organização e backup; não é um teste de reprodução nativa em segundo plano.
- Lint: resultado registrado na resposta da análise.

Referência: https://docs.expo.dev/versions/v58.0.0/sdk/audio/ — playlist nativa, ciclo de vida e requisitos de reprodução em segundo plano.

## Execução em 27/10/2026

O Android passou a usar uma única instância Expo `AudioPlaylist`, com controle da fila no Media3 por `PlaybackQueue.kt`. A escolha aproveita os controles de notificação/Bluetooth já oferecidos pela playlist. Os módulos próprios de fonte online e histórico foram adaptados para essa instância. Não há um segundo player.

Aplicado:

- Sequência, shuffle, repetição, faixa única, timer e loop A–B no nativo; a troca automática não espera um efeito React.
- Resolução de fontes online no loader de áudio, inclusive nas faixas seguintes; cache de URLs limitado a três entradas/3 minutos, uma renovação por erro e fallback local para rádio quando há uma faixa local disponível. O pré-carregamento de áudio segue o orçamento de buffer do Media3, sem baixar toda a fila.
- Histórico e metadados atualizados nas transições nativas; checkpoint de posição a cada cinco segundos e ao pausar/trocar. O serviço de mídia existente continua responsável pela sessão em segundo plano, com wake mode de reprodução.
- Comandos com token e intenção explícita para impedir autoplay atrasado depois de uma pausa ou seleção mais recente. A troca manual usa a fila já preparada.
- Reconciliação da fila por ID sem substituir a fonte atual. A faixa atual removida termina, sai da sequência nativa após a transição e não reaparece no repeat. Uma seleção explícita começa um novo ciclo de shuffle.
- Um único mini player no layout, marca atual, anterior/próxima, fila, gesto horizontal que não abre o player e feedback de pausa/carregamento/erro.
- Timeline isolada das opções do player, atualização suave, arraste com prévia, confirmação ao soltar e controles acessíveis. Letras continuam usando o relógio do áudio.
- Navegação sem `push` repetido, home como âncora, seções principais voltando ao home, telas fora de foco congeladas e listeners visuais suspensos ao perder foco ou entrar em segundo plano. Resultados de buscas fora de foco são descartados; consultas nativas já iniciadas podem concluir.
- Índice de músicas/posições da fila, identificação da faixa atual, feedback de posição e rolagem durante o arraste.

Verificação: TypeScript e lint; 68 testes JavaScript; 16 testes JVM aprovados e um smoke test de fonte real ignorado (requer configuração/execução própria). Interface web em 393 × 852 validada com três arquivos WAV artificiais: reprodução, avanço automático, pausa, gesto lateral sem abrir tela, arraste do progresso, remoção/reordenação e cinco ciclos entre seções com um único mini player e uma barra. A prévia está em `releases/ui-review/mini-player-optimized-393.png`.

O APK precisa ser atualizado: as funções novas dependem do módulo nativo. Ainda exigem aparelho real: 20 faixas/60 minutos com tela bloqueada, bateria, Bluetooth, fontes reais, p50/p95 de latência e estabilização de memória em 100 ciclos. O log `CustodioPlayback` registra preparação nativa; não equivale à medição acústica. Não foram comprovadas as metas numéricas de latência.

A geração de novas recomendações da rádio continua no JavaScript. Se ele for suspenso, a fila já entregue ao nativo continua disponível e pode repetir; buscar novas recomendações não é garantido enquanto o JS estiver suspenso. Web/iOS mantêm o avanço de compatibilidade em JS; esta implementação de continuidade nativa é Android.
