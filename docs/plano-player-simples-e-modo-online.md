# Plano de melhoria do player e do modo online

Implementação posterior do modo online: [modo-online.md](modo-online.md).

## Escopo desta rodada

- Manter o motor de reprodução e os provedores que já existem.
- Colocar aleatório e repetição à vista no mini-player e no player aberto, com estado ativo e nomes acessíveis.
- Entregar o plano do modo online. Não acrescentar outro catálogo, API ou mecanismo de streaming nesta etapa.

## Como o app funciona hoje

- **YouTube:** a busca e a resolução de mídia passam pelo NewPipe Extractor no módulo Android. Ele obtém metadados e URLs de streams de áudio; o Media3 reproduz a URL e o módulo nativo pode salvar o áudio. É uma integração não oficial, sujeita a mudanças do YouTube e às condições de uso aplicáveis.
- **Jamendo:** usa o endpoint oficial para buscar e transmitir. O download separado só é oferecido quando a faixa informa `audiodownload_allowed`.
- **Fila e rádio:** o módulo nativo Android resolve as próximas fontes durante a reprodução e mantém a fila do Media3; o JavaScript oferece busca, recomendações e controles.
- **Preferências e histórico:** preferências gerais ficam hoje no AsyncStorage. O histórico de escuta no APK Android já usa o banco SQLite `custodio-listening.db`. SQLite é local ao aparelho e, sem um serviço de conta/sincronização, não leva as preferências para outro dispositivo.

## Layout mais simples

1. Preservar os quatro destinos principais já existentes: Biblioteca, Descobrir, Para você e Ajustes.
2. Deixar mini-player e fila como acessos persistentes; a tela da fila continua dedicada a ver/reordenar a sequência.
3. Pôr aleatório e repetição junto aos controles do player, com indicação visual quando ligados. No mini-player, manter ícones compactos antes dos comandos de play/avançar.
4. Deixar funções ocasionais em “Mais opções”: temporizador, loop A–B, sincronização de letras/capas, seleção de gênero e ferramentas avançadas.

## Plano para o modo online

1. **Decidir a fonte antes do código:** fazer um piloto com Jamendo, que já está no projeto, e avaliar Audius como segundo catálogo. Não tratar faixas indisponíveis, bloqueadas ou com acesso restrito como reproduzíveis.
2. **Conferir direitos e condições por fonte/faixa:** Jamendo documenta busca, rádio e catálogo Creative Commons; a API requer cadastro de aplicativo e os termos próprios. Audius documenta busca e streaming, e publica uma Open Music License; faixas podem ter restrição/gate e devem ser puladas nesses casos. A disponibilidade técnica não é prova de que toda música comercial está licenciada para qualquer uso.
3. **Separar o catálogo do player:** definir uma interface pequena de provedor (buscar, metadados, URL de stream vigente, licença/atribuição e estado de disponibilidade). O player atual segue responsável por tocar e controlar a fila. Não gravar URLs temporárias como identidade da música.
4. **Busca e fila online:** mostrar claramente nome do serviço, artista, duração e link para a página original; permitir ouvir e adicionar à fila. Uma falha de rede ou URL expirada deve oferecer repetir/buscar outra e deixar a biblioteca local tocando.
5. **Preferências e recomendações:** manter as preferências e o histórico no aparelho; usar artistas/faixas ouvidas para montar sugestões dentro do catálogo escolhido, respeitando bloqueios. Levar para SQLite numa etapa de dados própria, com migração dos valores atuais do AsyncStorage e sem misturar histórico bruto com preferências.
6. **Privacidade e limites:** deixar claro que histórico fica local; permitir pausar e apagar. Não prometer sincronização entre aparelhos sem conta/backend. Definir cache só para metadados e capas conforme os termos do provedor; streaming não vira download offline por conveniência.
7. **Validação:** testar busca, play/pause, avanço, aleatório, repetição, fila, retomada de stream e modo offline no APK Android; verificar limites/restrições e atribuição do catálogo; rodar lint e typecheck. Expo Go/web não substituem a validação nativa do player online.

## Alternativas pesquisadas

- [Jamendo API](https://developer.jamendo.com/v3.0/docs): já integrada; catálogo de música independente e endpoints de busca/rádio. Requer `client_id` e observar os termos de uso.
- [Audius API](https://docs.audius.co/api/) e [Open Music License](https://audius.org/open-music-license.pdf): alternativa para pesquisa e streaming de artistas que publicam no protocolo. O app precisa respeitar faixas com stream gated e creditar a fonte/artista; testar disponibilidade e os termos atuais antes de adotar.
- [SoundCloud API Terms](https://developers.soundcloud.com/docs/api/terms-of-use): não é uma boa base para agregar um serviço de música sob demanda sem autorização/licença explícita.
- YouTube oficial: a [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) incorpora o player de vídeo; as [políticas para desenvolvedores](https://developers.google.com/youtube/terms/developer-policies-guide) não autorizam separar áudio, esconder anúncios ou reproduzir o player em segundo plano. Por isso, esta rodada mantém o motor atual e não cria um novo modo YouTube Music.

## Fontes de documentação técnica

- [Expo SQLite para SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/)
- [Audius: controle de acesso a streams](https://docs.audius.co/developers/guides/gate-release-access/)
