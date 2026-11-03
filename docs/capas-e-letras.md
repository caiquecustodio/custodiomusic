# Capas e letras

## Uso

- No player, **Sincronizar capa e letra** executa uma nova busca. **Letra** mostra a letra salva, destaca a linha atual e acompanha a reprodução. Tocar numa linha busca aquele instante; `−0,5 s` e `+0,5 s` ajustam o atraso, limitado a 30 segundos em cada direção. Arrastar a letra suspende o acompanhamento; **Acompanhar** o reativa.
- **Corrigir busca** permite salvar título, artista e álbum. Alterações são preservadas quando a biblioteca ou os downloads são atualizados.
- **Escolher versão** lista até oito alternativas com artista, álbum, duração e indicação de sincronização. A escolha é explícita para resultados incertos. As alternativas ficam salvas para consulta offline.
- **Importar .lrc** aceita `.lrc` e `.txt` em UTF-8, até 500 KB e 250 mil caracteres. Letras importadas são preservadas nas buscas automáticas; escolher outra versão manualmente permite substituí-las.
- Em **Configurações → Capas e letras**, é possível desativar a busca automática e sincronizar as músicas sem capa ou letra em sequência, com progresso e cancelamento.

## Busca e armazenamento

### Acompanhar o canto sem marcações de tempo

Quando a letra não contém timestamps, o player distribui suas frases igualmente pela duração total da faixa: uma música de 180 segundos com 30 frases recebe seis segundos por frase. Linhas vazias e títulos de seções entre colchetes não entram na contagem. Um texto em parágrafo único é dividido pela pontuação. O destaque, a rolagem automática, o toque para avançar e o ajuste de atraso funcionam também nesse modo, identificado como **Sincronização aproximada**.

Essa estimativa não detecta a voz: introduções, solos, pausas e diferenças de duração entre frases podem afastar o destaque do canto real. Letras com timestamps sempre têm prioridade. A estimativa só começa quando a duração é conhecida, é recalculada em memória e não substitui os dados originais da letra salva.

A sincronização automática aguarda 1,2 segundo de reprodução, sem atrasar o início do áudio. Uma trava permite uma música em sincronização por vez. Consultas bem-sucedidas, ausentes ou incertas ficam em cache por sete dias; falhas têm intervalo mínimo de um minuto e não são repetidas automaticamente na mesma sessão. A busca manual ignora esse intervalo.

No Android, o módulo local lê título, artista, álbum, duração e capa com `MediaMetadataRetriever`. Também tenta ler letras USLT em tags ID3v2.3/v2.4, examinando no máximo 1 MB de tags. Tags com cabeçalhos estendidos, compressão ou unsynchronisation e outros formatos de letra embutida não são suportados por esse leitor. Arquivos sem artista podem usar o padrão `Artista - Música`; nos demais casos, o usuário corrige os dados.

As letras vêm do LRCLIB. A seleção automática exige título e artista normalizados correspondentes e duração com diferença de até três segundos. Letras sincronizadas têm preferência entre correspondências confiáveis. Resultados incertos são apresentados para escolha, sem substituição automática. Letras comuns e faixas instrumentais também são reconhecidas.

Capas vêm de gravações compatíveis no MusicBrainz e do Cover Art Archive. A busca prioriza o álbum informado e tenta até três edições quando uma capa está ausente. MusicBrainz tem espaçamento mínimo de 1,1 segundo entre consultas. Requisições de metadados e imagem têm limite de tempo; imagens têm limite de 8 MB.

No Android, as capas baixadas ficam em `Paths.document/music-covers`, e capas embutidas em armazenamento privado do módulo. Letras e alternativas ficam em chaves individuais do AsyncStorage, separadas da biblioteca. Na versão web, as capas são armazenadas como data URLs e estão sujeitas à quota do navegador. Os arquivos de áudio originais não são modificados nem enviados aos serviços; a pesquisa usa seus metadados.

## Validação

Há testes de parser LRC, escolha de versão, busca por duração e artista, cancelamento, resposta inválida/HTTP, identificação pelo nome do arquivo e preservação de metadados na atualização dos downloads. Verificação de lint e TypeScript e compilação do módulo Android completam a validação estática.

Ainda é necessário testar a experiência completa em um aparelho com um APK atualizado: letras e capas offline após reiniciar, permissões dos arquivos importados, correção manual, troca de faixa durante a busca, cancelamento e leitura de tags de arquivos reais. A cobertura de músicas depende dos catálogos externos.

Fontes: [LRCLIB](https://github.com/tranxuanthang/lrclib), [MusicBrainz Search API](https://musicbrainz.org/doc/MusicBrainz_API/Search), [Cover Art Archive](https://musicbrainz.org/doc/Cover_Art_Archive/API), [Expo FileSystem 58](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/).
