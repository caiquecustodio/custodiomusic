# Correção de continuação online — versão 10

Relato: a reprodução para mesmo com próximas músicas na fila. Não foi possível reproduzir o relato em um Android conectado; a revisão encontrou e corrigiu as condições abaixo.

## Alterações

- Uma seleção online entrega ao motor a lista completa de faixas recém-obtidas, sem depender da próxima renderização do React. A rádio usa o mesmo caminho quando inicia com recomendações novas.
- Quando uma atualização acrescenta faixas depois de o motor já ter terminado a fila, o Android pode continuar na próxima disponível, se a sessão online/radio ainda estiver autorizada a tocar.
- Após a tentativa existente de renovar uma fonte online falhar, o motor tenta a próxima faixa da sequência. Mantém o registro de fontes que falharam para não percorrer a fila indefinidamente.
- A recuperação respeita a ordem da fila ou a ordem aleatória nativa, a pausa explícita e pausas do sistema, o temporizador e a repetição da música atual.
- A transição permanece no motor Android e não exige um callback JavaScript para iniciar uma próxima faixa que já esteja carregada na fila.

## Verificação

- TypeScript e ESLint passaram.
- 15 testes JavaScript de fila nativa, fila online e avanço/repetição passaram.
- 28 testes Android executados passaram; três testes opcionais de rede foram ignorados. Inclui sete casos da política de fila.
- A conferência completa no aparelho continua necessária: tocar uma faixa online com outras na fila, deixar terminar, repetir com a tela bloqueada e testar uma próxima faixa indisponível. O comportamento de serviços externos depende da disponibilidade da fonte.

APK gerado e validado com sucesso: versionCode 10, com a assinatura existente para atualização sobre a versão anterior. SHA-256: 968278d0640f23ebd077f25316b45cc799f42f2453957d1bb15c150214bd829e.
