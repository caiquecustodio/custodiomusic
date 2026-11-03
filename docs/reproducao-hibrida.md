# Reprodução híbrida, rádio e recap

Implementação de 26/10/2026 para o APK Android pessoal. Mantém o player Expo Audio 58 e não acrescenta equalizador, efeitos, normalização, crossfade, análise PCM, conversão ou edição sonora.

## Como usar

- **Descobrir:** pesquisar YouTube/Jamendo ou colar um link; usar Ouvir, Tocar a seguir ou Baixar. O botão de formatos continua disponível. No player online, Baixar esta música inicia uma transferência independente: streaming e download simultâneos podem consumir dados duas vezes.
- **Para você:** Minha rádio, rádio da faixa atual, proporção de conhecidas/descobertas, somente offline e limpeza de bloqueios. No player é possível bloquear uma música ou artista das recomendações.
- **Recap:** painel de hoje e dos seis dias anteriores e semanas encerradas de segunda a domingo. Atualizar recap consulta os totais locais. As faixas presentes na biblioteca podem ser reproduzidas novamente.
- **Organizar biblioteca:** acesso pela biblioteca a artistas, álbuns, pastas conhecidas, possíveis duplicatas e importação/exportação M3U/M3U8 UTF-8. A confirmação de duplicatas calcula SHA-256 sob demanda, sequencialmente e sem excluir arquivos. URIs privadas exportadas continuam dependentes do acesso concedido no aparelho.
- **Backup:** histórico é opcional e vem desativado na exportação. A confirmação de restauração informa que o histórico e os recaps serão substituídos. Reimportar o mesmo histórico não soma seus totais novamente.

## Funcionamento e eficiência

`Track.online` guarda provedor e identidade estável, sem armazenar URLs temporárias de mídia. Downloads existentes conservam seus IDs. Ao baixar uma faixa online, a reconciliação preserva seu ID, favoritos e playlists; a reprodução atual continua na fonte original, e a próxima execução prefere o arquivo local. Arquivos locais com caminho `file:` ausente podem voltar à fonte, exceto na rádio somente offline.

O módulo nativo resolve streaming separadamente de download. No Jamendo, `audio` permite ouvir sem depender de `audiodownload_allowed`; o download mantém sua verificação própria. YouTube usa os formatos de áudio HTTP compatíveis do extrator existente. O player recebe uma fonte Media3 progressiva com o cliente de rede restrito aos hosts dos provedores, DNS público e validação de cada redirecionamento. Endereço expirado recebe uma renovação automática; não há ciclo infinito de tentativas. Falhas na rádio permitem continuar com arquivos locais da fila.

A rádio busca somente metadados, em pequenos lotes e com intervalo mínimo de um minuto entre consultas durante a sessão. Só resolve o áudio quando a faixa vai tocar. Não há downloads automáticos. A proporção de descoberta é probabilística e usa as alternativas disponíveis, sem prometer um catálogo ilimitado. A pontuação combina favoritos, tempo ouvido, conclusões e pulos precoces, com redução gradual do peso do histórico antigo. Bibliotecas pequenas flexibilizam a janela de 30 faixas e reposicionam músicas ouvidas para depois da faixa atual. Prioridade manual, repetição explícita e temporizador são preservados.

A varredura da biblioteca lê páginas de 200 entradas, com até oito leituras simultâneas, e aproveita título/artista/álbum/pasta disponíveis no MediaStore. Grupos da organização usam uma lista virtualizada. Faixas sem metadados não recebem gêneros ou artistas inventados.

## Histórico local

O observador nativo recebe o mesmo `AudioPlayer` do Expo e acompanha seu Media3 Player. Enquanto há áudio tocando, coleta progresso a cada segundo; salva checkpoints cumulativos a cada dez segundos e também em pausas, mudanças, erros e consultas. Pausas, buffering e saltos manuais não entram no tempo ouvido. As gravações rodam em executor único; checkpoint, snapshot, exclusão e restauração respeitam a mesma ordem.

O SQLite `custodio-listening.db`, versão 1, guarda sessões com ID UUID e totais por dia/faixa. Checkpoints são transacionais e idempotentes: somente a diferença ainda não salva incrementa os totais. Uma escuta é qualificada após 30 segundos ou metade da faixa, o que ocorrer primeiro. A coleta usa eventos nativos e não exige ticks da interface ou timers JavaScript em segundo plano.

Eventos brutos são removidos após 12 meses; totais diários permanecem para reconstruir semanas antigas. Datas usam o calendário local do aparelho no momento da escuta. O painel consulta somente agregações; eventos completos só são lidos para backup. Não há coleta retroativa nem transmissão do banco para servidores. Recomendações online consultam os provedores pelos artistas selecionados.

Pausar coleta interrompe o observador, inclusive com a tela bloqueada. Apagar histórico limpa sessões e totais e inicia uma sessão nova se a coleta estava ativa; favoritos, playlists e bloqueios são preservados. Encerramento abrupto pode perder o intervalo posterior ao último checkpoint, de até aproximadamente dez segundos em execução normal. Forçar parada não garante continuidade da reprodução.

## Validação e limites

Resultado desta execução: lint e typecheck aprovados; 63 testes JavaScript aprovados; 11 testes Kotlin controlados aprovados; teste real optativo do YouTube aprovado. APK `releases/CustodioMusic.apk`, versionCode **5**, gerado para `arm64-v8a` e `armeabi-v7a`, com pacote, assinatura e JavaScript embarcado validados. SHA-256: `b24cb9d1755f632a2e46d05bec09617906a6fb9d0736deac8d99d67bdc47983a`. O arquivo pode atualizar a instalação assinada pela mesma chave sem desinstalação.

- TypeScript e testes JavaScript verificam reconciliação online/offline, fila, rádio pequena, bloqueios, pontuação, virada de semana/ano, recap vazio, M3U, sugestões de duplicatas e backups, além das regressões existentes.
- Testes Kotlin controlados verificam streaming Jamendo com download negado, política de rede, exclusão de pausas/buffering/seek e limiares de escuta.
- Compilação Android do módulo e teste real optativo do YouTube foram executados. O teste real resolve o vídeo público Big Buck Bunny e lê até 1 KiB do stream, sem gravar a mídia. Não prova disponibilidade de todas as faixas.
- Bundles Android/Hermes e web foram exportados. Navegação e estados iniciais de Para você e Organizar foram inspecionados no navegador. Web/Expo Go não simulam streaming nativo, downloads ou coleta Android.
- Jamendo depende de `JAMENDO_CLIENT_ID` no ambiente do build. Sem configuração, permanece indisponível. O extrator do YouTube pode exigir atualização por novo APK.

### Pendente em aparelho

Nenhum dispositivo foi encontrado por `adb devices` nesta execução. Ainda precisam ser conferidos no celular: ponte do SharedObject Expo/Media3 em execução, decodificação real, controles da tela bloqueada, continuidade da rádio em segundo plano, interrupções de áudio, renovação após expiração, streaming e download simultâneos, cancelamento, pouco espaço, preservação dos dados ao atualizar e restauração transacional do SQLite.

A comparação de CPU, memória, bateria e tráfego antes/depois exige o mesmo aparelho, arquivos, rede e duração. Não foi medida aqui. Usar uma sessão local e outra online de 20 minutos, com tela bloqueada durante metade de cada sessão; registrar `dumpsys meminfo com.custodio.music`, CPU e tráfego do UID e confirmar o recap. A ausência de processamento sonoro e de pré-download reduz trabalho desnecessário, mas não substitui essas medições.
