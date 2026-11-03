Veja a [experiência simplificada para ouvir música](docs/experiencia-simples.md): novo Início, busca única e player mais direto.

# Custódio Music

Modo Online integrado: [busca automática, Audius, cache de catálogo e preferências SQLite](docs/modo-online.md). Uma única fila e um único player atendem biblioteca e faixas online; fontes disponíveis são consultadas automaticamente.

Auditoria atual: [desempenho, resposta e carregamento antecipado — 27/10/2026](docs/auditoria-performance-2026-10-27.md), com melhorias aplicadas, gargalos restantes e roteiro de medição online/offline.

Implementação posterior: [resposta visual, isolamento de renders, pré-carregamento e cache de capas](docs/resposta-visual-implementacao.md).

Agora inclui reprodução híbrida online/offline, ouvir enquanto baixa, rádio personalizada local, recap semanal e organização por artista/álbum/pasta com M3U. Consulte [reprodução híbrida e validação](docs/reproducao-hibrida.md) para funcionamento, configuração dos provedores e testes ainda pendentes no celular. A prioridade continua sendo reprodução eficiente, sem efeitos ou edição do áudio.

Reprodutor Android de músicas locais, feito com Expo, React Native e TypeScript. Inclui biblioteca offline, capas, letras sincronizadas, modo cantar, playlists, favoritos e fila editável. A prioridade é reprodução leve e resposta rápida.

## Executar em desenvolvimento

```sh
npm install
npx expo start
```

Expo Go serve para validar a interface e a biblioteca de mídia. O seletor de pastas e a leitura nativa de metadados usam recursos do APK próprio e precisam de um development build.

## Gerar APK

### APK local protegido e atualização do mesmo app

Na pasta deste projeto, use:

```sh
npm run apk:check   # diagnóstico; não compila e não altera o APK
npm run apk:debug   # gera a atualização, se houver RAM suficiente
npm run apk:stop    # em outro terminal, cancela somente a geração deste projeto
```

Instale as dependências uma vez com `npm install` se `node_modules` estiver ausente. Não reinstale dependências nem limpe caches a cada APK.

**Saída única:** `releases/CustodioMusic.apk`, acompanhada de `CustodioMusic.apk.sha256`. O comando mantém o APK anterior até validar completamente a nova cópia. Confere assinatura, pacote `com.custodio.music`, código de versão, arquiteturas e JavaScript incluído. Publicação com falha restaura o APK, hash e contador anteriores; não substitui o instalador por um arquivo parcial.

**Memória:** exige 1 GiB de RAM disponível antes de iniciar compiladores. Se faltar, encerra e pede para fechar aplicativos. Durante o build, monitora a memória livre a cada segundo e cancela a árvore de processos própria se ficar abaixo de 1,5 GiB por dez segundos consecutivos. Não encerra processos de outros apps. Uma trava impede duas gerações simultâneas deste projeto. Os limites reduzem a pressão de memória, mas o consumo de outros aplicativos também afeta a RAM disponível.

O Gradle usa um worker, sem projetos em paralelo, heap de 1536 MiB e metaspace de 384 MiB; Kotlin roda dentro desse processo. O C++ usa até dois compiladores por módulo e o Metro usa um worker. O daemon de uso único do Gradle termina ao final; o cache em disco é preservado. O limite do heap não é um limite de memória total de todas as ferramentas.

Se o monitor de RAM interromper a geração, é possível reduzir o heap para deixar espaço ao Metro: definir `APK_GRADLE_HEAP_MB=1024` no ambiente daquela execução. São aceitos somente 768, 1024, 1280 e 1536 MiB; o padrão continua 1536 MiB. O monitor de RAM, a assinatura e a publicação segura continuam ativos. Um heap menor pode exigir mais tempo ou falhar se a compilação precisar de mais memória.

**Atualização no celular:** o identificador e o certificado do APK existente foram conferidos. A chave é validada e copiada, antes da sincronização, para `.local/android-signing/debug.keystore`, fora do Android gerado e ignorada pelo Git. Preserve essa pasta em uma cópia segura; perder ou trocar a chave pode impedir atualizar o app instalado. Nunca é gerada outra chave automaticamente. O contador local avança somente após uma publicação bem-sucedida e considera também a versão do APK atual. Instale o novo APK por cima do anterior, sem desinstalar ou limpar os dados. A preservação efetiva de músicas, playlists e favoritos deve ser conferida no aparelho.

**Cache:** Expo Prebuild só é executado quando mudam configurações nativas, dependências, plugins, registros de módulos, ícones ou os arquivos Android gerados. Usa `--no-clean --no-install`. Mudanças apenas nos arquivos de interface não exigem essa sincronização; Gradle e Metro continuam responsáveis por compilar/empacotar as alterações. O cache C++ permanece em `~/.cm-cxx/<identificador-do-projeto>/`, com caminhos curtos e as configurações CMake existentes.

O APK é independente do PC: inclui o JavaScript e usa a variante `release` com assinatura de teste, sem minificação, redução de recursos ou checagem de publicação. Essas opções só se aplicam ao comando local; não equivalem a uma assinatura de publicação na loja.

**Pré-requisitos:** JDK 21 para Gradle, JDK 17 para os plugins React Native, Android SDK 37, Build Tools 37.0.0, NDK 27.1.12297006 e CMake 3.22.1. O script reconhece JDKs em `~/Android/jdk` e aceita `JAVA_HOME`, `ANDROID_HOME` e `ANDROID_SDK_ROOT`. Toolchains Java ausentes não são baixadas automaticamente. `apk:check` informa os requisitos ausentes e retorna código diferente de zero se o ambiente não estiver pronto.

Por padrão gera um único APK com `arm64-v8a` e `armeabi-v7a`, para Android ARM de 64 e 32 bits. Isso evita excluir aparelhos com sistema de 32 bits, mesmo quando o processador suporta 64 bits. A assinatura e o avanço automático do código de versão são preservados. Incluir a segunda arquitetura aumenta o tamanho do APK e pode demorar mais na primeira compilação.

Para incluir também emuladores x86, no PowerShell:

```powershell
$env:APK_ARCHITECTURES = 'arm64-v8a,armeabi-v7a,x86,x86_64'
npm run apk:debug
Remove-Item Env:APK_ARCHITECTURES
```

Diagnóstico em `.local/apk-build/build.log` e `.local/apk-build/last-run.json`: etapa da falha/cancelamento, duração total e por etapa, menor RAM disponível e pico observado de memória usada **pelo sistema inteiro**. Não confundir esse pico com consumo exclusivo do build. O contador fica em `version.json`; a sincronização incremental, em `native-sync.json`. A primeira compilação nativa pode ser demorada; o tempo das seguintes depende do que mudou. Não há repetição automática após falhas.

Validação das proteções, sem compilar o Android:

```sh
npm run test:apk
npm run lint
npm run typecheck
node --test tests/duration.test.mjs tests/downloads.test.mjs
```

Para desenvolvimento conectado ao computador, `npm run android` e `npm start` continuam disponíveis. São fluxos distintos: as proteções acima pertencem ao comando `apk:debug`.

### EAS Build

O perfil `preview` de `eas.json` gera um APK instalável com EAS Build:

```sh
npx eas-cli@latest build --platform android --profile preview
```

Também há perfis `development` e `production`, ambos gerando APK. Para compilar localmente, instale JDK e Android SDK e execute `npx expo run:android`.

## Reprodução, letras e desempenho

O espectrograma e o visualizador foram removidos, juntamente com o processamento PCM/FFT e o cache de espectros. O módulo Android agora lê somente metadados, capas e letras embutidas. O relógio do áudio atualiza apenas as interfaces visíveis que precisam dele; a leitura da biblioteca tem concorrência limitada. Consulte [melhorias de uso e desempenho](docs/melhorias-uso-e-desempenho.md) para detalhes de retomada, fila, treino A–B, temporizador, modo cantar e backup.

## Armazenamento

A biblioteca usa a permissão granular de áudio do Android. O seletor de arquivos importa faixas individuais; o seletor de pastas usa Storage Access Framework e mantém a permissão de leitura concedida pelo usuário.

## Interface e validação

A navegação usa Expo Router com um MusicProvider compartilhado. Os tokens ficam em `src/lib/theme.ts`; capas vetoriais determinísticas e ícones Lucide substituem os símbolos de texto. A barra do mini-player ocupa espaço no layout e respeita as áreas seguras do sistema.

A API nova de expo-media-library 58 retorna duração em milissegundos (confirmado nos mapeadores nativos Android e iOS instalados). A conversão acontece somente na leitura da biblioteca. Durações persistidas usam `durationUnit: seconds`; entradas antigas são invalidadas até a atualização pela origem ou reprodução. IDs, favoritos e playlists são preservados.

Verificações:

```sh
npm run typecheck
npm run lint
node --test tests/duration.test.mjs
npm run web
```

Para a conferência final no APK, usar um aparelho Android com músicas reais: telas de 360, 393 e 412 pontos, texto ampliado, temas claro/escuro e navegação por gestos/três botões. Validar importação, reprodução em segundo plano, busca, favoritos, playlists, fila, avanço e progresso. Conferir também capas/letras offline, marcação manual, retomada e temporizador no dispositivo.


## Descobrir e baixar (Android)

O módulo local `modules/music-downloads` separa provedores, fila Room e serviço foreground do player. A tela `/downloads` recebe pesquisas, links de faixas e links compartilhados por outros apps. Não há WebView, anúncios, plugins executáveis ou conversão para MP3. O NewPipeExtractor é fixado em v0.26.5. AAC/M4A é priorizado; WebM/Opus é preservado. MP3 do Jamendo é aceito como fornecido pela fonte, sem transcodificação.

Para habilitar Jamendo, defina `JAMENDO_CLIENT_ID` no ambiente do build EAS antes de compilar. O identificador é uma configuração pública de aplicativo, não deve conter credenciais secretas. Sem essa configuração, a tela informa que o catálogo está indisponível e mantém o YouTube independente. O módulo não solicita login e recusa conteúdo restrito, transmissões ao vivo e manifestos protegidos. Mudanças de plataforma podem exigir atualização do extrator por novo APK.

```sh
npm run typecheck
npm run lint
node --test tests/duration.test.mjs tests/downloads.test.mjs
npx expo prebuild --platform android --no-install
npx eas-cli@latest build --platform android --profile downloads-validation
```

O perfil `downloads-validation` executa os testes unitários do módulo Android e gera APK de release. Expo Go e web mostram a indisponibilidade do módulo; não simulam downloads nativos. Os testes Kotlin estão em `modules/music-downloads/android/src/test`.

Os downloads ficam no armazenamento privado persistente do aplicativo e são removidos ao desinstalá-lo. Arquivos temporários não entram na biblioteca. A permissão de notificações permite acompanhar/cancelar a transferência com a tela bloqueada. A fila é persistida; interrupções do processo são apresentadas para repetição, e a opção Continuar fila inicia tarefas pendentes. Forçar parada ou limites de execução do Android podem interromper o serviço. A retomada exige suporte a Range e um validador ETag/Last-Modified confirmado; manifestos renovados reiniciam de forma conservadora.

A camada de rede valida HTTPS, hosts e redirecionamentos dos provedores, bloqueia endereços internos e limita o tamanho de arquivos e respostas. O áudio é percorrido pelo MediaExtractor e M4A é remuxado sem recodificação antes da publicação. Essas verificações reduzem riscos e não equivalem a antivírus nem garantem risco zero.

A biblioteca preserva faixas com origem de download durante atualizações. A imagem fornecida por uma plataforma é uma miniatura da fonte, não necessariamente uma capa oficial de álbum. Consulte `THIRD_PARTY_NOTICES.md` e a licença GPL do módulo antes de redistribuir APKs.

A validação em aparelho deve conferir: download de conteúdo próprio/autorizado; tela bloqueada; reprodução simultânea; cancelamento pela notificação; rede interrompida; pouco espaço; arquivo inválido; URI expirada; reabertura; reprodução offline; favoritos e playlists preservados. Compilação bem-sucedida não substitui essa validação.
