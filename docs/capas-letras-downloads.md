# Capas, letras e downloads — pesquisa de viabilidade

Pesquisa em 26/10/2026. Este documento descreve a próxima implementação; os recursos de metadados, letras e downloads ainda não foram integrados ao app.

## O que o projeto já permite

O app usa Expo 58, reprodução local e um módulo Kotlin próprio para análise do áudio. `Track` já tem `artwork`, mas a biblioteca ainda monta título pelo nome do arquivo e usa artista genérico. O módulo Kotlin é um ponto de integração natural para leitura de tags em uma tarefa IO separada da FFT. Não é necessário enviar os arquivos de áudio para obter tags locais.

## 1. Metadados dentro do MP3: primeira prioridade

MP3 pode conter tags ID3: APIC (imagem), TIT2 (título), TPE1 (artista), TALB (álbum), USLT (letra simples) e SYLT (letra sincronizada). Nem todo arquivo tem essas informações. Downloads que só têm nome de arquivo não ganham capa ou letra automaticamente ao serem importados.

Para título, artista, álbum, duração e capa, usar MediaMetadataRetriever no módulo Android; `getEmbeddedPicture()` retorna bytes de uma imagem embutida, ou null. Ele não oferece um extrator genérico de USLT/SYLT: letras exigem parser ID3 que cubra versões 2.3/2.4, codificações e diferenças de timestamp. Avaliar uma biblioteca de tags com licença compatível antes de escolher a dependência; evitar implementar um parser completo improvisado.

Ler `content://` pelo ContentResolver/SAF, respeitando a permissão concedida. Salvar a capa extraída em arquivo privado, com limite de dimensões/tamanho; referenciar a URI em `Track.artwork` em vez de guardar base64 no AsyncStorage. Cache por identificador, modificação e tamanho do arquivo. Tratar tag danificada por faixa sem interromper a biblioteca.

Também aceitar arquivos `.lrc` e `.txt` associados à faixa, inclusive por seleção explícita. Arquivos vizinhos só podem ser lidos quando a permissão da pasta permitir; selecionar um MP3 isolado não concede acesso irrestrito à pasta. Não modificar o MP3 original nesta primeira integração.

Fontes:
- https://id3.org/id3v2.3.0
- https://developer.android.com/reference/android/media/MediaMetadataRetriever

## 2. Capas online

Usar título + artista + álbum para pesquisar MusicBrainz, identificar a gravação/edição e obter sua capa no Cover Art Archive. Preferir a imagem frontal de 500 px no player e miniaturas menores na lista. Um resultado de busca não garante a versão correta: ao vivo, remix, cover e homônimos devem ser distinguidos, usando duração como sinal auxiliar e escolha manual em resultados ambíguos.

MusicBrainz exige User-Agent identificável e no máximo uma chamada por segundo; criar fila e cache. A API informa gratuidade para uso não comercial e planos próprios para uso comercial. As imagens do Cover Art Archive não se tornam de domínio público por estarem acessíveis; manter origem/atribuição e avaliar direitos de exibição/armazenamento conforme a distribuição do app.

Fontes:
- https://musicbrainz.org/doc/MusicBrainz_API
- https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
- https://musicbrainz.org/doc/Cover_Art_Archive/API
- https://musicbrainz.org/doc/Copyright_and_DMCA_Compliance

## 3. Letras online

LRCLIB oferece API acessível sem chave obrigatória, com `plainLyrics` e `syncedLyrics` (LRC). Consultar `/api/get` com `track_name`, `artist_name`, `album_name` e duração em segundos. A documentação usa tolerância de aproximadamente dois segundos na duração. `/api/search` serve para seleção de candidatos quando a identificação não é suficiente; não aplicar automaticamente uma letra apenas pelo título.

No player, criar modo Letras, acompanhar a posição do áudio para destacar as linhas LRC e recalcular a linha após seek. Se só existir texto simples, oferecer leitura sem sincronização. Tratar instrumental, indisponível, offline e falha de rede como estados diferentes. Acesso aberto à API não equivale a uma licença irrestrita de redistribuição das letras; para um produto comercial, avaliar autorização de uso e provedores licenciados, como Musixmatch/LyricFind, antes de definir cache persistente e distribuição.

Fontes:
- https://lrclib.net/docs
- https://github.com/musixmatch/musixmatch-sdk

## 4. Baixar músicas pelo app

É tecnicamente possível com URLs HTTPS diretas de áudio que autorizem download, arquivos próprios ou catálogo integrado que permita essa operação. A fonte fornece o conteúdo; o aplicativo gerencia a transferência e adiciona o arquivo concluído à biblioteca.

Uma opção de catálogo é Jamendo: sua API retorna `audiodownload`, `audiodownload_allowed` e dados de licença. Só exibir Baixar quando a faixa permitir e houver URL de download. Exige cadastro de aplicativo/client_id e revisão dos termos e do modelo comercial. Não prometer que esse catálogo contém qualquer música popular procurada.

O fluxo recomendado é Buscar/Explorar → faixa e origem → Baixar → progresso/cancelar/repetir → biblioteca offline. Para uma primeira versão, baixar com o app aberto usando Expo FileSystem, em arquivo temporário dentro de armazenamento persistente; validar HTTP, tipo, tamanho e espaço, finalizar o arquivo e só então cadastrá-lo. Evitar duplicatas. Se quiser a pasta pública Música, usar a integração Android MediaStore/SAF adequada; o cache temporário do app não é armazenamento offline permanente.

Download confiável com o app fechado exige estratégia nativa de tarefas em segundo plano, retomada e notificação. Não prometer que uma simples chamada de fetch ou download do FileSystem sobrevive ao encerramento do processo.

As APIs oficiais de Spotify e YouTube não são APIs de download de MP3 para um player externo. YouTube restringe download/armazenamento e separação de áudio sem autorização; Spotify proíbe facilitar downloads/ripping. Streaming oficial e compra/licenciamento de um catálogo são integrações diferentes.

Fontes:
- https://developer.jamendo.com/v3.0/tracks
- https://developer.jamendo.com/v3.0
- https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/
- https://developers.google.com/youtube/terms/developer-policies
- https://developer.spotify.com/policy

## Sequência recomendada para o Custódio

1. Extrair tags/capas locais, importar LRC e adicionar o modo Letras.
2. Buscar metadados faltantes online, sem substituir dados locais ou edições manuais; permitir corrigir associação e desativar buscas online. Enviar somente título/artista/álbum/duração, não o arquivo ou seu caminho local.
3. Implementar downloads por link autorizado; integrar um catálogo como Jamendo após definir conta e termos.

Testar MP3 com e sem tags, ID3v2.3/v2.4, letras simples e sincronizadas, imagem danificada, nomes ambíguos, permissão revogada, falta de rede, HTTP 404/429/503, interrupção de download, pouco espaço e reabertura offline.
