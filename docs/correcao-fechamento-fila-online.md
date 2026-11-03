# Fechamento ao trocar música online — versão 11

## Evidência encontrada

O usuário informou que o app fecha ao passar para outra música da fila online. Nenhum Android está conectado ao ADB e não há emulador instalado, portanto não foi possível recolher o stack trace do aparelho.

A investigação identificou o defeito de Expo Audio SDK 58 descrito em https://github.com/expo/expo/issues/52192 e na correção proposta em https://github.com/expo/expo/pull/52193. O cenário é uma playlist alterada depois de ativar a sessão de notificação/tela bloqueada. A sessão não recebe os callbacks Java default de Player.Listener quando o código Kotlin usa delegação `by`. A timeline conhecida pela sessão fica desatualizada e o controlador pode fechar o processo com Invalid PlayerInfo update ao mudar de faixa.

O código instalado (expo-audio 58.0.10) contém essa delegação. Dois testes contra a classe realmente carregada pelo Gradle falharam antes da correção: faltavam 35 dos 37 callbacks, e nenhum dos cinco callbacks de timeline/transição/reprodução/erro chegou ao listener de teste. Após o backport, os mesmos dois testes passaram. Isso confirma a presença do defeito da biblioteca; sem logcat, a correspondência exata com o fechamento do aparelho ainda precisa de confirmação.

O APK da versão 10 também foi inspecionado diretamente: a classe dentro de classes5.dex implementava apenas dois callbacks. Essa verificação evita confundir uma edição em node_modules com o código que foi entregue no instalador.

## Correção

- Backport revisado do encaminhamento explícito dos 37 callbacks do Media3 1.9.1. Os metadados e a identidade do player usados pela notificação continuam preservados.
- Expo Audio configurado em package.json para compilar do código-fonte. O SDK 58 usa AARs pré-compilados por padrão, que não incorporariam o arquivo corrigido.
- Script idempotente no postinstall e no empacotamento protegido, com verificação da versão, do hash original e do hash corrigido. Dependências diferentes exigem revisão.
- Sem alteração manual em arquivos Android gerados ou adição de bibliotecas.

## Verificação

- Dois testes de regressão: falham antes e passam depois.
- 30 testes Android executados passaram, com três testes opcionais de rede ignorados.
- Quatro testes da aplicação segura do backport e 15 testes do empacotamento passaram.
- TypeScript e ESLint passaram.
- scripts/verify-audio-apk.py confere os métodos implementados dentro do DEX do APK, usando apenas a biblioteca padrão do Python. O APK anterior é rejeitado por conter só dois callbacks; o APK novo contém os 37 callbacks, sem nenhum dos callbacks essenciais faltando.

## Conferência no Android

Atualizar sobre a versão anterior e testar: tocar música online, acrescentar novas faixas, avançar e voltar várias vezes, deixar avançar automaticamente, editar a fila e repetir com a tela bloqueada. Se ainda fechar, recolher logcat de AndroidRuntime para distinguir uma segunda causa.

A correção anterior da versão 10 tratou a configuração e recuperação da fila; ela não corrigia o componente da sessão de notificação identificado nesta investigação.

## Instalador entregue

VersionCode 11, assinatura compatível com a versão anterior, ARM 32 e 64 bits. A validação de DEX do APK publicado confirmou 37 callbacks e nenhum callback essencial faltando. SHA-256: b2b296033f2d6586a76364b401bbce83776ccd400a982e6c9cec0479fe175df0.
