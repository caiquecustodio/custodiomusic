# Resposta visual — implementação de 27/10/2026

## Alterações

- Contextos separados para tema, comandos, biblioteca, identificação/favoritos das linhas, resumo de reprodução e instância do player. A biblioteca não assina mais mudanças de play/buffering, rádio ou histórico. Componentes genéricos recebem somente o tema. O contexto completo continua disponível para as telas avançadas existentes.
- Comandos estáveis encaminham para o estado mais recente confirmado em layout effect; não guardam uma fila antiga em closures. As linhas usam Set de favoritos e apresentação memoizada: mudar a faixa atual não exige reconstruir a apresentação de todas as linhas. Callbacks da biblioteca e IDs da seleção são reutilizados.
- Busca mantém o índice textual, agora construído em lotes de 32 faixas durante períodos ociosos, com cancelamento quando a biblioteca muda. `useDeferredValue` prioriza o campo de texto; publicação do índice usa transição. Enquanto o índice é reconstruído, os resultados podem refletir brevemente o índice anterior.
- FlatList da biblioteca inicia com dez itens, lotes de seis e janela de sete telas. Alturas continuam flexíveis para acessibilidade. Esses valores precisam de conferência em rolagem rápida e fonte ampliada no aparelho.
- Pré-carregamento seletivo de player/fila após hidratação, em período ocioso. Sem pré-carregar todas as seções. Listeners visuais existentes continuam condicionados ao foco.
- `expo-image` usa cache em disco, redução de resolução ao renderizar e chave de reciclagem. Capas locais para listas de até 64 dp recebem miniaturas de até 160 × 160 px, decodificadas já com limite de tamanho, sem alterar a capa original. Transformações são serializadas; no máximo 16 ficam pendentes e 128 miniaturas são mantidas. São arquivos descartáveis do cache; falhas voltam para a imagem original/fallback.
- Capas remotas prováveis são preparadas no cache em disco, até duas por operação, durante reprodução sem buffering e com app ativo. O perfil offline da rádio e shuffle evitam essa antecipação. Não baixa áudio adicional por causa dessa mudança; o cache de áudio da rádio permanece com os limites existentes.
- Varredura da biblioteca compartilha uma única operação em andamento, aguarda período ocioso na abertura, cede execução entre páginas e reaproveita metadados de arquivos com URI/modificação iguais e duração conhecida. Continua consultando a origem para identificar alterações e remoções; não transforma o cache em prova de que o arquivo ainda existe.
- Downloads têm uma leitura em andamento e atualização final acumulada para rajadas de eventos. Disponibilidade dos provedores é lida na abertura/retorno, não a cada progresso. A biblioteca recebe somente snapshots alterados de downloads concluídos; links compartilhados têm contexto separado da fila de progresso.
- Botões comuns e linhas ganharam feedback de toque nativo no Android. Reprodução mantém estados de intenção/carregamento, sem afirmar disponibilidade de áudio antes da confirmação nativa.
- React Compiler 1.0.0 habilitado; dependências `expo-image` e `expo-image-manipulator` instaladas pelo resolvedor do SDK 58. Lint do Expo/React Compiler e TypeScript aprovados.
- Corrigidas duas chaves React iguais entre irmãos no player: timeline e catálogo de gêneros agora têm prefixos distintos. Na inspeção web, as chaves antigas provocavam avisos e duplicação de timelines durante atualizações; após correção, cinco ciclos entre player e fila mantiveram uma timeline e um mini-player.

## Validação

- 97 testes JavaScript aprovados. Os novos testes cobrem rajadas de 100 eventos com uma leitura concorrente, leitura final, recuperação após erro e cancelamento de trabalho ocioso.
- TypeScript e ESLint sem erros/avisos após as mudanças finais.
- Exportação web com React Compiler concluída. A prévia de desenvolvimento também executou os fluxos com o compilador habilitado.
- Prévia web: importação de três WAV artificiais silenciosos de um minuto, favoritos, busca e limpeza, reprodução, pausa, próxima faixa e cinco ciclos player/fila. Sessão limpa após a correção das chaves: nenhum erro de console nos fluxos conferidos.
- Biblioteca e mini-player inspecionados em 393 × 852; captura em `releases/ui-review/visual-response-393.png`.
- Nenhum aparelho conectado em `adb devices`. Miniaturas nativas, comportamento de toque Android, rede real, Bluetooth e continuidade com tela bloqueada ainda exigem teste no telefone.

O APK é produzido pelo comando protegido `npm run apk:debug`. O resultado e hash finais ficam em `releases/CustodioMusic.apk` e `.sha256`; diagnóstico em `.local/apk-build/last-run.json`. Não foram medidos ganhos percentuais de latência, FPS, RAM ou bateria. Conferência web e testes de lógica não comprovam esses números no Android.

### APK concluído

Build local aprovado: versionCode **8**, pacote `com.custodio.music`, arquiteturas `arm64-v8a` e `armeabi-v7a`. Assinatura original, versão, arquiteturas, JavaScript embarcado e hash conferidos pelo script de publicação. SHA-256: `ea0e021ca878471a2a64ff01f75844ce19e908912d3e03ec44b0933e263c8573`. Tempo total: aproximadamente 9 min 12 s.

O mapa de fontes do bundle Android foi comparado com os arquivos finais de provider, player, capas, cache, índice de busca e downloads: correspondência confirmada. Instalar o APK por cima do existente, sem desinstalar ou limpar dados. A preservação efetiva dos dados e os módulos novos devem ser conferidos no aparelho.

## Referências

[Memoização e contextos](https://react.dev/reference/react/memo), [prioridade de atualização da busca](https://react.dev/reference/react/useDeferredValue), [Expo Router prefetch](https://docs.expo.dev/router/basics/navigation/), [Expo Image 58](https://docs.expo.dev/versions/v58.0.0/sdk/image/), [ImageManipulator 58](https://docs.expo.dev/versions/v58.0.0/sdk/imagemanipulator/), [React Compiler no Expo](https://docs.expo.dev/guides/react-compiler/).
