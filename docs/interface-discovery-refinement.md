# Refinamento de interfaces e descoberta musical

Implementado sem geração de APK ou publicação.

## Interface

- Biblioteca: cabeçalho compacto, importação/atualização em painel, ordenação com seleção explícita e faixas com duas linhas.
- Player: reprodução em destaque; funções complementares no painel Mais opções; controles de 10 segundos identificados.
- Para você: personalização sob demanda, rádios por gênero com prévias e recap simplificado.
- Miniplayer: uma linha e progresso fino. Navegação mantém quatro destinos.

## Descoberta

O mapeamento prioriza a faixa atual e processa uma faixa por vez, sem bloquear áudio. Consulta título e artista no MusicBrainz, confirma título, créditos e duração e consulta gêneros da gravação. Usa álbum para distinguir versões quando disponível. Correspondências ambíguas ficam sem classificação. Não envia arquivo de áudio.

Os metadados são persistidos junto à biblioteca. Cache positivo: 90 dias; ausência de resultado: 7 dias; erro: 1 hora. Alterações de identidade invalidam o cache. Consultas de capas e gêneros compartilham a mesma fila MusicBrainz, com pelo menos 1,1 segundo entre inícios de requisição.

O trabalhador funciona enquanto o runtime do app executa, inclusive durante reprodução em segundo plano quando o sistema permite. Caso o Android suspenda o JavaScript, retoma no retorno ao aplicativo. Não há serviço nativo novo para mapear com o processo encerrado.

Rádios por gênero usam os provedores Android existentes. Buscam a estação visível e preparam outras duas, com prévias em cache por 24 horas. Os resultados online são sugestões por busca, não gêneros confirmados. Não atribuímos gênero aos resultados apenas por aparecerem numa pesquisa. O perfil offline evita consultas de rádio e usa faixas locais mapeadas.

A busca recebe atalhos de artista, gêneros conhecidos e ano da gravação atual, além de aceitar consulta livre. A biblioteca pode ser pesquisada por gênero/ano e agrupada pelo gênero principal ou ano identificado. A cobertura depende dos metadados disponíveis no MusicBrainz.

## Validação

Lint, TypeScript, testes de metadados/cache/correspondência e regressões de rádio, fila e reprodução. Prévia web para hierarquia e painéis em largura de celular. Os provedores de descoberta e reprodução online precisam do módulo Android e não são simulados como resultados reais na prévia web.

Fontes técnicas: https://musicbrainz.org/doc/MusicBrainz_API e https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting.


## Rádio online, cache e início popular

- Instalações sem preferência anterior começam no perfil Descobertas (70%); preferências já salvas são preservadas.
- O início sem histórico consulta o kiosk musical do YouTube com país BR e o catálogo Jamendo ordenado por popularity_week. Falhas não são apresentadas como rankings inventados. A lista em alta é guardada por uma hora; em falha de rede, uma seleção anterior de até sete dias pode ser usada com aviso.
- A busca passa gradualmente a alternar músicas em alta com artistas de escutas qualificadas e favoritos. Pulos pesam contra os artistas sugeridos. Continua havendo exploração mesmo com histórico extenso.
- Quando existe uma faixa local compatível, ela começa antes de a pesquisa online terminar. A fila intercala até uma local a cada duas online, conforme disponibilidade e bloqueios.
- O Android prepara até duas próximas faixas na ordem real da fila, respeitando aleatório. O trabalho acontece numa thread nativa de baixa prioridade durante a reprodução, inclusive com a tela apagada enquanto o processo e o player continuam ativos.
- A preparação só começa após 30 segundos de buffer da música online atual; suspende quando há carregamento ou o buffer cai abaixo de 15 segundos. Reprodução local pode preparar imediatamente. Pausa, encerramento da rádio e desativação da opção cancelam a preparação.
- Cache privado limitado a 192 MB, com limite de 16 MB por faixa e reserva de espaço para arquivos temporários. Arquivos incompletos nunca são usados; só um download integral passa a ser áudio pronto. O cache não cria músicas na biblioteca nem downloads permanentes.
- O resolvedor consulta o arquivo em cache antes de acessar a fonte ou renovar URL. Após 12 segundos de carregamento, a rádio pode seguir com uma faixa local ou já preparada disponível na fila. O cache é uma proteção contra oscilações, não uma garantia de rede infinita/offline completo.
- A opção Preparar próximas músicas fica no painel Personalizar rádio e pode ser desligada sem encerrar a rádio.

Fontes de implementação: API NewPipeExtractor v0.26.5 (kiosk musical com ContentCountry BR), https://developer.jamendo.com/v3.0/tracks e Media3 Player.Listener.
