# Validação do módulo de downloads

Data: 26/10/2026.

## Verificações concluídas

- `npm run lint`: aprovado.
- `npm run typecheck`: aprovado.
- `node --test tests/*.test.mjs`: 9 testes aprovados (downloads e duração).
- `npx expo export --platform android --output-dir .expo/downloads-export`: bundle Android/Hermes gerado, 1.327 módulos.
- `:expo-music-downloads:testDebugUnitTest`: 9 testes Kotlin aprovados com JDK 17 e Android SDK local.
- O teste nativo optativo `CUSTODIO_LIVE_SMOKE=1` pesquisou e resolveu metadados/formatos do vídeo público Big Buck Bunny. Não baixou a mídia. O teste padrão não depende dessa consulta de rede.
- Testes controlados do Jamendo: resposta válida, download negado pelo artista, catálogo sem configuração e destino de mídia inválido.
- Política de rede: hosts esperados, rejeição de endereços internos, ordenação de segmentos DASH e rejeição de manifesto protegido.
- Reconciliação da biblioteca: apenas arquivos concluídos, preservação das músicas locais e identidade estável após recarga.

## APK

Build EAS de validação: https://expo.dev/accounts/keizernaviers-team/projects/custodiomusic/builds/1312e25d-3f91-4c1a-8c57-919f0a39490a

O perfil executa testes nativos e gera APK assinado. Jamendo não está habilitado neste build porque não há `JAMENDO_CLIENT_ID` configurado.

Último estado confirmado: `IN_QUEUE`. Ainda não há APK deste módulo disponível para download. O APK antigo em `releases/CustodioMusic.apk` não corresponde a esta implementação e foi preservado.

Os avisos de terceiros e a licença GPL do extrator também estão em `assets/licenses/` dentro do pacote Android do módulo.

A tentativa de `:app:assembleRelease` e de lint Android no caminho original do Windows encontrou erro de criação de diretórios CMake em `react-native-screens`/`react-native-worklets` (caminhos longos). Isso não afetou a execução dos testes unitários Kotlin. Não confundir o lint JavaScript aprovado com o lint Android, que não terminou nessa tentativa.

## Pendente em aparelho

Nenhum dispositivo Android estava conectado durante a implementação. Os testes unitários não comprovam o funcionamento do serviço e dos decodificadores no aparelho.

- Baixar conteúdo próprio ou autorizado; reproduzir o arquivo com a rede desligada.
- Bloquear a tela durante transferência; conferir notificação, progresso e cancelamento.
- Reproduzir música enquanto outra é baixada.
- Interromper rede e reabrir o app; testar retomada com validador válido e reinício quando ele muda.
- Cancelar na fila, na transferência e no processamento; tentar novamente.
- Simular URL expirada, resposta HTML, mídia truncada, redirecionamento não permitido e pouco espaço.
- Reabrir após encerramento do processo; conferir duplicatas, favoritos, playlists e atualização da biblioteca.
- Compartilhar um link de outro app com o Custódio; conferir seleção do formato antes de baixar.
- Conferir telas estreitas, texto ampliado, temas e áreas seguras do Android.

Não há garantia de continuidade após forçar parada. Downloads privados são removidos na desinstalação; não é necessário desinstalar para atualizar com APK assinado pela mesma chave.
