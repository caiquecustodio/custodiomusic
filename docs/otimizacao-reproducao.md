# Otimização da reprodução

Atualizado em 27/10/2026. Consulte a execução e os limites em [plano de usabilidade e reprodução](plano-usabilidade-reproducao.md).

## Arquitetura atual

- Um único `useAudioPlaylist` no provider global. No Android, `PlaybackQueue.kt` entrega a sequência ao Media3, resolve as fontes no loader e mantém transições, metadados e histórico sem depender da tela ou de um efeito JavaScript para avançar.
- `useMusicPlayer.ts` adapta os controles existentes à playlist. Fontes online e o observador de escuta usam a mesma instância. Notificação, bloqueio de tela e Bluetooth usam os controles da playlist do Expo.
- A próxima fonte pode ser preparada pelo buffer nativo. URLs resolvidas usam cache limitado a três entradas com validade de três minutos; áudio não é baixado em massa. Uma falha remota permite uma renovação, e a rádio pode seguir com uma faixa local disponível.
- Edições reconciliam a fila por ID. Remover uma faixa futura não recarrega a atual. Remover a atual deixa-a terminar uma vez e a retira do ciclo de repetição.
- Repetição, shuffle, faixa única, timer e A–B são aplicados no nativo no Android. Novas recomendações da rádio ainda dependem de JS; a sequência já preparada permanece utilizável em segundo plano.
- Checkpoints de posição e histórico continuam no nativo enquanto o JS dorme. Ao voltar ao app, a interface se reconcilia com a faixa efetivamente tocando.

## Interface e trabalho visual

- Mini player único no layout, com marca atual, anterior, play/pause, próxima, fila e gesto lateral. Um arraste não dispara o toque de abrir o player.
- Progresso do player em componente próprio, com prévia do seek e confirmação ao soltar. Posição não atualiza toda a biblioteca: `usePlaybackSummary` continua ignorando ticks temporais.
- Telas são reutilizadas, congeladas fora de foco e os listeners de progresso param em background. Buscas descartam respostas fora de foco. Reprodução, downloads solicitados e preparação da fila permanecem globais.
- Fila usa índice memoizado; cada linha recebe sua posição. Arraste inclui rolagem nas bordas e botões continuam disponíveis para acessibilidade.

## Validação e limites

68 testes JavaScript aprovados; 16 testes JVM aprovados e um smoke test remoto ignorado. TypeScript e lint sem erros. Fluxos visuais verificados no navegador com viewport de celular e músicas artificiais.

Ainda é necessário medir latência e memória no telefone e validar tela bloqueada por 60 minutos/20 faixas, economia de bateria, fontes reais e Bluetooth. Testes unitários e compilação do APK não comprovam esses resultados. O caminho nativo descrito aqui é Android; web/iOS continuam com avanço compatível em JS.

Referência: [Expo Audio SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/audio/).
