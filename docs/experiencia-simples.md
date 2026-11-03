# Experiência simples para ouvir música

## Organização implementada

- **Início** abre ao entrar: continuar ouvindo, meu mix, ouça de novo, estilos e descobertas. Nenhuma permissão de arquivos é necessária para chegar à busca online no Android completo.
- **Buscar** concentra a pesquisa por título, artista, álbum ou link. Resultados locais aparecem imediatamente após enviar a consulta; resultados online chegam progressivamente. Alterar o texto sem enviar mantém os resultados da consulta anterior.
- **Biblioteca** mantém músicas, favoritos e playlists. Downloads, organização e histórico ficam nesta área. Ajustes são acessíveis pelo ícone no cabeçalho.
- **Player** destaca capa/letra, música, favorito, progresso, anterior, play/pause, próxima, aleatório e repetição. Fila abre em tela própria. Os atalhos de dez segundos e demais ferramentas continuam em Mais opções.
- **Gêneros** têm tela própria acessível pelas opções da música. A personalização do mix fica em Ajustes. Meu histórico concentra resumo das escutas e privacidade.

## Continuidade e compatibilidade

Os motores de pesquisa, o player compartilhado, o SQLite, downloads e bibliotecas existentes continuam em uso. Não foram adicionadas dependências. A rota /downloads continua aceitando links compartilhados e consultas; agora apresenta Buscar. A antiga Biblioteca passou a /library, e /for-you apresenta Meu histórico.

Uma cópia baixada prevalece sobre uma entrada online da mesma fonte e identificador. Gravações diferentes com o mesmo título são preservadas. A lista unificada usa virtualização, inclusive para resultados locais. Pesquisa local funciona também quando o módulo online não está disponível.

A repetição alterna entre desligada, fila e música. O antigo modo single é convertido para desligado ao carregar preferências ou restaurar backup; favoritos, playlists e demais dados são preservados. O motor mantém suporte aos valores antigos para compatibilidade.

A troca de abas usa uma única ação de navegação, eliminando a disputa entre voltar ao Início e abrir outro destino.

## Verificação

- TypeScript e ESLint sem erros.
- 45 testes passaram: busca unificada, identidade de cópias baixadas, cache e falhas dos catálogos, preferências, fila, reprodução, gêneros e backup. Inclui migração do antigo modo de repetição na restauração de backup.
- Prévia web conferida em 360 × 800: Início, navegação Biblioteca/Buscar, lista vazia, importação de dois WAVs de teste, dois resultados locais, player, ciclo dos três modos de repetição e tela de gêneros.
- Capturas: [Início](../releases/ui-review/inicio-simples-360.png), [player](../releases/ui-review/player-simples-360.png) e [busca](../releases/ui-review/busca-unificada-360.png).
- A prévia web não executa o motor online nativo. Reprodução online, permissões, segundo plano e conforto dos toques ainda precisam ser conferidos no Android.
- Entrega somente do código, conforme preferência do usuário. Nenhum novo APK foi gerado.

## Referência técnica consultada

Documentação correspondente à versão instalada: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/) e [Expo Router SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/router/).
