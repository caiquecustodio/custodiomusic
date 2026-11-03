# Modo online integrado — 28/10/2026

## Plano de execução

1. Preservar o player Media3/Expo e a fila nativa; ampliar apenas catálogo, resolução e apresentação.
2. Adicionar o catálogo Audius pela REST API oficial, incluindo busca, seleção em alta, metadados, URLs temporárias e espelhos fornecidos pelo serviço. Recusar faixas privadas, removidas ou com acesso restrito. Manter YouTube e Jamendo existentes.
3. Consultar automaticamente as fontes disponíveis em paralelo, com orçamento de tempo, no máximo uma pesquisa e uma atualização de sugestões pendentes por fonte, recuperação de resultados da mesma pesquisa e intervalo após falhas por operação. Combinar resultados por identidade do provedor, mostrando resultados progressivos; sugestões não bloqueiam a busca.
4. Reutilizar arquivos locais da mesma faixa antes de resolver áudio remoto. Na fonte Audius, usar espelhos da própria mídia, com tentativas limitadas; não substituir silenciosamente a música por outro artista, cover ou gravação.
5. Persistir preferências gerais, rádio e pesquisas recentes em SQLite Android, migrando AsyncStorage sem apagar dados. Conservar compatibilidade com APK antigo/web. Aproveitar o histórico SQLite de escutas já existente.
6. Entregar uma aba Online com pesquisa única, ouvidas novamente, rádio e seleção em alta; uma linha por música e ações ocasionais em painel. Ocultar seleção de fonte/motor/formato; conservar autoria e link de origem nas informações da música. Manter gerenciador de downloads separado.
7. Validar TypeScript, lint, testes de concorrência/falhas/cache/migração e o módulo nativo Android. Documentar o que depende de teste em aparelho e de credenciais do provedor.

## Referências

- [Audius API](https://docs.audius.co/api/) e OpenAPI publicado em `https://api.audius.co/v1/swagger.yaml`: busca, trending, resolução de permalink e streams; endpoints de leitura podem funcionar sem chave, sujeitos a limites.
- [Audius controle de acesso](https://docs.audius.co/developers/guides/gate-release-access/): respeitar gates e permissão de streaming.
- [Jamendo tracks](https://developer.jamendo.com/v3.0/tracks): `audio` para streaming, `audiodownload_allowed` para download; requer `JAMENDO_CLIENT_ID`.

## Limites

Mais fontes aumentam a disponibilidade de resultados; não garantem catálogo universal ou ausência de interrupções. A disponibilidade de cada música continua dependendo da fonte, região, licença e rede. YouTube mantém sua integração preexistente, não oficial; nenhuma restrição de acesso é contornada por esta implementação. O banco de histórico não é enviado; consultas online podem incluir artistas e títulos escolhidos a partir das escutas. Não há login, conta de nuvem ou sincronização entre aparelhos.

## Implementado

- Aba Online com pesquisa única, seleção inicial, mix, buscas recentes e Ouça de novo; linha de música com painel de ações. Downloads ficam em uma área própria. A fonte permanece identificada como crédito, sem seletor técnico.
- Busca paralela com resultados progressivos, deduplicação por provedor/ID, uma pesquisa e uma atualização de sugestões pendentes por fonte. Cada consulta tem orçamento de 10 segundos; uma falha impõe 30 segundos de intervalo àquela operação. Outros resultados continuam utilizáveis.
- Cache de até 24 consultas, com até 30 itens por fonte/consulta. Buscas são reutilizadas por 5 minutos e sugestões por uma hora; em falhas, resultados da mesma consulta podem ser recuperados por até 7 dias. Atualizar sugestões força renovação, respeitando consultas pendentes e o intervalo de falha.
- Audius usa API oficial e respeita flags de acesso público; metadados têm limite de 10 segundos. Na reprodução, até três nós fornecidos pelo serviço são consultados, com até 4 segundos por tentativa incluindo redirecionamentos. Uma tentativa falha descansa por 60 segundos para aquela combinação nó/faixa. Esta conexão oferece streaming; downloads existentes do YouTube/Jamendo seguem os controles anteriores.
- Hosts de mídia Audius são aprendidos somente de respostas da API oficial, com limite de sessão, HTTPS e validação de DNS público nas requisições de áudio. A autorização de um host não libera seus subdomínios. URLs assinadas não são gravadas como identidade da música.
- Biblioteca e online usam o mesmo player. Faixas baixadas da mesma origem são reaproveitadas e não entram duplicadas na renovação da fila. Recomendações e próximas faixas automáticas respeitam bloqueios por música/artista; pesquisas e escolhas explícitas continuam disponíveis.
- Preferências gerais, rádio e buscas recentes usam `custodio-preferences.db` no Android. Migração insere os valores legados apenas se a chave não existir. Leituras e escritas são serializadas por chave; um diário de recuperação conserva o valor mais novo se houver falha entre os dois armazenamentos. O histórico de escutas continua em `custodio-listening.db`. APK antigo e web preservam o uso do AsyncStorage.
- Nenhuma dependência adicional ou segundo player foi necessário: a conexão nova usa OkHttp e o SQLite nativo já disponíveis no módulo Android.

## Validação

- TypeScript, lint e 39 testes JavaScript aprovados, incluindo concorrência, consulta lenta, resultados progressivos, cache, renovação explícita, filtros de recomendação, fila com arquivos baixados e migração/recuperação de preferências.
- Módulo Android compilado e 27 testes nativos executados sem falhas; dois testes opcionais antigos do YouTube permaneceram desativados. Os cinco testes unitários Audius e o teste real Audius passaram.
- O teste real consultou o catálogo, resolveu o permalink e leu somente 32 bytes de áudio após os probes de disponibilidade. Ele confirma acesso ao stream naquele momento; não comprova decodificação, áudio contínuo ou funcionamento de todas as músicas.
- Bundle web exportado. O catálogo online continua sendo um recurso do APK Android, sem simulação de streaming no Expo Go/web.
- Nenhum aparelho foi encontrado por `adb devices`. Permanecem para validação no celular: interface com texto ampliado, emissão de áudio real, tela bloqueada/Bluetooth, troca de rede, interrupções, recuperação de preferências ao atualizar e uso contínuo da rádio. O APK deve ser instalado por cima da versão existente, com a mesma assinatura, para preservar dados.

Para repetir os testes JavaScript específicos, usar `node --test tests/catalog.test.mjs tests/preferences.test.mjs tests/online-queue.test.mjs tests/native-queue.test.mjs tests/downloads.test.mjs tests/discovery.test.mjs tests/radio-network.test.mjs`. Os testes Android ficam em `modules/music-downloads/android/src/test`; o teste com a API real exige `CUSTODIO_AUDIUS_SMOKE=1` no ambiente da execução Gradle.

## Entrega do código

Código entregue sem novo APK, conforme preferência do usuário. As tentativas de empacotamento foram interrompidas pelo monitor de RAM, preservando o instalador anterior. O módulo nativo foi compilado e testado; isso não equivale à entrega de um instalador atualizado.

O script de APK passou a aceitar o perfil opcional `APK_GRADLE_HEAP_MB`, com valores restritos e o padrão anterior preservado. Os 15 testes do script e o lint dos arquivos alterados passaram; o limite de proteção de RAM não foi reduzido. Esse perfil não garante que uma máquina com pouca RAM livre consiga finalizar o build.
