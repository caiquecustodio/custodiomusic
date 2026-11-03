# Auditoria de desempenho e resposta — 27/10/2026

## Conclusão sobre o conceito

O Custódio combina biblioteca offline, reprodução híbrida e descoberta personalizada. A arquitetura é adequada a um player leve: um motor nativo, áudio sem processamento adicional, biblioteca persistida e enriquecimento complementar. A principal oportunidade é reduzir o trabalho provocado por atualizações secundárias e antecipar apenas o que provavelmente será usado. Carregar tudo antecipadamente aumentaria tráfego, memória e competição com o áudio.

Esta é uma análise estática com validação automatizada. Não foram medidos FPS, latência audível, CPU, bateria ou memória de um telefone. As prioridades abaixo são inferências do código, não um perfil de execução em aparelho. Nenhum APK foi gerado nesta etapa.

## Documentação e situação atual

Foram consultados README, os documentos de `docs/`, instruções do repositório, avisos de terceiros e validação visual. O código atual é a referência para o diagnóstico. Há relatos históricos contraditórios: `capas-letras-downloads.md` ainda descreve recursos como futuros; `analise-reproducao.md` menciona visualizador; `melhorias-uso-e-desempenho.md` descreve timer em JS, enquanto o Android atual já o executa no nativo. O início de `plano-usabilidade-reproducao.md` registra problemas posteriormente tratados na seção Execução. Não considerar esses diagnósticos históricos como defeitos atuais sem conferir o fonte.

Já implementado antes desta auditoria:

- Playlist única no Expo/Media3, transições nativas no Android e intenção de reprodução protegida por token.
- Relógio isolado do resumo global e listeners visuais suspensos fora de foco.
- Biblioteca salva mostrada antes da atualização pela origem, leitura em páginas de 200 e até oito operações simultâneas.
- Cache de letras, capas e classificação; fila compartilhada de consultas MusicBrainz.
- Rádio com pré-carregamento nativo das duas próximas faixas, thread de baixa prioridade, cache de 192 MiB e limite de 16 MiB por faixa. Só arquivos completos entram no cache.
- Proteção do áudio atual: preparação remota inicia com 30 s de buffer e suspende abaixo de 15 s, em buffering ou pausa. Esse recurso já funciona independentemente dos timers visuais JS enquanto o player/processo permanece ativo.

## Melhorias aplicadas nesta etapa

| Local | Custo identificado | Alteração |
| --- | --- | --- |
| `src/app/index.tsx` | Favoritos/playlists procuravam cada ID em toda a biblioteca | Índice memoizado por ID; resolução linear no número de IDs selecionados |
| `src/app/index.tsx` | Cada tecla reconstruía texto de busca, gêneros e normalização de todas as faixas | Índice textual reutilizado enquanto músicas/categorias não mudam; consulta com `useDeferredValue` para priorizar a digitação |
| `src/lib/downloads/model.ts` | Reconciliação pesquisava a lista de downloads para cada música sem ID correspondente | Índice por provedor/identidade; custo esperado O(biblioteca + downloads), preservando ID online, edições e referência quando nada muda |
| `src/lib/useDiscoveryMapping.ts` | Timer podia iniciar consultas automáticas de gênero com o app em segundo plano | Novas consultas automáticas só começam com AppState ativo; retorno ao app retoma o trabalho |

`useDeferredValue` prioriza a atualização do campo; não transforma um filtro síncrono em trabalho numa thread separada. A classificação já em andamento pode terminar ao apagar a tela; esta mudança evita iniciar novas consultas, sem cancelar ações manuais ou preparação do áudio.

## Próximas melhorias, por prioridade

### P1 — Inicialização e biblioteca grande

`music.tsx` restaura o cache, mas inicia uma varredura completa quando há permissão. Cada faixa passa por `getInfo` e `localInfo`, inclusive em reaberturas. A consulta automática e `requestLibrary` também possuem caminhos separados: ao conceder permissão, verificar a possibilidade de duas varreduras concorrentes.

Centralizar a varredura em uma operação compartilhada, deduplicar pedidos e reutilizar metadados locais quando identidade/modificação não mudaram. Agendar a atualização após a primeira tela utilizável, ceder o JS entre páginas e publicar progresso sem substituir a biblioteca por resultados parciais. Remoções só devem ser reconciliadas ao concluir uma varredura válida; cancelamento ou permissão revogada não pode apagar músicas salvas. Com biblioteca vazia, publicar as primeiras faixas progressivamente pode reduzir a espera inicial.

### P1 — Downloads sem provocar trabalho global por progresso

`downloads/context.tsx` lê fila e fontes em cada `onDownloadsChanged`; `music.tsx` também lê a fila no mesmo evento. Downloads ativos podem, portanto, gerar consultas duplicadas e renders em consumidores globais. A frequência efetiva deve ser medida no APK.

Compartilhar snapshots da fila, permitir uma consulta em andamento e acumular no máximo uma atualização pendente. Ler disponibilidade dos provedores na abertura/retorno ou em mudança relevante. Atualizar a biblioteca apenas quando mudar o conjunto de arquivos concluídos; progresso em bytes deve atualizar a apresentação do download. A atualização final de conclusão/cancelamento precisa ser entregue mesmo após uma rajada de eventos.

### P1 — Reduzir o alcance dos renders

`MusicProvider` ainda reúne biblioteca, reprodução, preferências, histórico, rádio e classificação. `TrackRow` consome esse contexto diretamente, portanto apenas envolver a linha em `memo` não isola atualizações do contexto.

Separar leitura da biblioteca, comandos e estado de reprodução, mantendo um único motor. Linhas devem receber propriedades pequenas e comandos estáveis; favoritos podem usar um Set memoizado. Medir primeiro com React Profiler e uma biblioteca de 5.000 músicas. Evitar uma migração ampla sem cobertura de última intenção, fila e retomada.

### P2 — Mostrar cache imediatamente e atualizar depois

`popular-radio.ts` tem cache e deduplicação, mas, quando a seleção salva expira, aguarda a rede antes de oferecer fallback. Exibir primeiro uma seleção salva de até sete dias com indicação da idade, depois atualizar discretamente; deduplicar a revalidação e aplicar intervalo após falhas. Não persistir URLs temporárias de áudio como catálogo estável.

`GenreStations.tsx` possui cache em Map e aceita consultas livres: adicionar limite LRU por quantidade, além da validade, para não acumular consultas durante uma sessão longa. Preparar no máximo uma estação adicional provável quando a rede estiver disponível e o áudio atual tiver folga; o código atual busca somente a estação selecionada, apesar de um parágrafo histórico citar outras duas.

### P2 — Capas e persistência

Capas podem chegar a 8 MB e o caminho de leitura usa `arrayBuffer`, seguido de cópia para Uint8Array; na web há também expansão em base64. Gerar miniaturas locais e limitar dimensões de decodificação poupa memória nas listas. Medir imagens reais antes de trocar bibliotecas de renderização.

Toda mudança de uma faixa ainda pode serializar a biblioteca inteira após 300 ms. Com milhares de faixas e classificação automática, avaliar armazenamento por registro/SQLite, transações em lotes e migração recuperável. Não usar JSON completo no caminho de um toque. Preservar backup e persistência ao sair do app.

### P2 — Listas extensas

A biblioteca e a organização já usam virtualização. Resultados/downloads em `downloads.tsx` usam ScrollView e as playlists são montadas no cabeçalho: avaliar lista virtualizada quando houver muitos itens. Ajustar janela e lotes com fonte ampliada e rolagem rápida; reduzir arbitrariamente a janela pode criar espaços vazios. Não fixar alturas incompatíveis com acessibilidade.

## Política de antecipação recomendada

| Momento | Prioridade |
| --- | --- |
| Abertura | Mostrar preferências e biblioteca salvas; restaurar faixa pausada; liberar navegação |
| Após a primeira tela | Atualizar biblioteca em lotes e recuperar dados auxiliares sob demanda |
| Reprodução estável | Preparar até duas próximas faixas no orçamento nativo existente; carregar letra/capa da faixa atual antes de enriquecer o restante |
| Buffer baixo/rede lenta | Suspender antecipação; priorizar stream atual; usar fallback disponível e identificado |
| App oculto | Manter áudio, fila e downloads solicitados; evitar novos trabalhos de catálogo sem benefício imediato |
| Perfil offline da rádio | Usar faixas locais; não confundir cache temporário da rádio com download permanente |

O perfil offline existente é da rádio. Não equivale a uma preferência global que impeça toda consulta de capas/gêneros. Se desejar um modo global sem rede, centralizar essa regra em todas as entradas de rede. Em modo avião real, dados persistidos devem continuar acessíveis sem aguardar timeouts.

## Validação e metas

Lint e TypeScript aprovados. Suíte JavaScript executada; o teste adicional verifica reconciliação online → offline, preservação de edições, ausência de duplicação e estabilidade de referência. As otimizações de complexidade não equivalem a um ganho de milissegundos comprovado no aparelho.

Medir em APK de distribuição no mesmo Android, com bibliotecas de 100/1.000/5.000 faixas e três condições: modo avião, Wi-Fi estável e rede com perda/latência. Fazer 30 amostras por cenário, separar abertura fria/quente, cache hit/miss, tempo de resolução, preparação e início audível. Registrar p50/p95, RAM após aquecimento, CPU, tráfego e bateria. Metas iniciais a validar: feedback visual p95 ≤100 ms, pausa/retomada de comando p95 ≤150 ms, troca local preparada p95 ≤250 ms. Definir meta de abertura após obter a linha de base do aparelho.

Repetir 100 ciclos de navegação, dez trocas rápidas com pausa durante carregamento e 60 minutos/20 faixas com tela bloqueada. Conferir ausência de autoplay atrasado, estabilidade de listeners/players, arquivos incompletos, recuperação após perda de rede e preservação de favoritos/playlists. Não chamar de ganho de desempenho uma regressão de disponibilidade offline ou um aumento excessivo de consumo de dados.

Referências consultadas: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/) e [configuração de FlatList](https://reactnative.dev/docs/optimizing-flatlist-configuration). Comportamento específico de rádio/cache identificado no fonte Kotlin do projeto.
