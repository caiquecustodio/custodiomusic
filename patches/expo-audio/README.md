# Expo Audio 58.0.10: backport da correção de eventos da sessão

Fonte: https://github.com/expo/expo/pull/52193, por iamfatihay. Licença MIT do Expo.
Relato e reprodução: https://github.com/expo/expo/issues/52192.

O arquivo MetadataInjectingPlayer.kt aplica o encaminhamento explícito de todos os callbacks de Player.Listener do Media3 1.9.1. A delegação Kotlin anterior não encaminhava os métodos default da interface Java: a sessão mantinha uma timeline antiga, causando Invalid PlayerInfo update ao avançar para músicas acrescentadas posteriormente.

scripts/patch-expo-audio.mjs verifica a versão e os hashes de origem/destino. É idempotente, roda no postinstall e antes do empacotamento protegido. Uma mudança da dependência exige revisão do backport. O Expo Audio é compilado do código-fonte com expo.autolinking.android.buildFromSource em package.json; editar somente node_modules não altera um AAR pré-compilado.

O teste LockScreenListenerTest inspeciona a classe carregada pelo Gradle e executa callbacks de timeline, transição, reprodução e erro. Ele deve falhar com a biblioteca original e passar com o backport. Alocação sem construtor é usada apenas no teste JVM para evitar criar um Handler Android; o app continua usando o construtor normal.
