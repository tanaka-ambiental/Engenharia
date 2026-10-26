# Engenharia Hídrica

Aplicativo web em português para estudos preliminares de disponibilidade hídrica e autodepuração por Streeter–Phelps, com memória de cálculo e relatório para impressão/PDF. Primeira versão de apoio à preparação de estudos de outorga; **não certifica atendimento às exigências do SP Águas**.

## Executar

Requer Node.js 22 ou superior. Não há dependências externas, instalação de pacotes, banco de dados ou etapa de build.

```sh
cd /workspace/Engenharia
npm start
```

O servidor escuta na porta 3000. `PORT` e `HOST` podem ser definidos no ambiente de execução. Para desenvolvimento com reinício automático, use `npm run dev`. Abra a interface pelo endereço do servidor disponibilizado pela sua hospedagem. O servidor não fornece autenticação; os dados do estudo são calculados no navegador e não são enviados ao servidor. Não há armazenamento automático: salve o JSON para retomar o estudo.

```sh
npm run check
npm test
```

Os testes conferem conservação de massa, unidades, balanço hídrico, correção de temperatura, casos-limite, OD mínimo, validação e a solução analítica contra uma integração numérica independente, além da entrega HTTP dos arquivos públicos.

### Verificação opcional no navegador

O teste funcional usa Playwright e Chromium apenas como ferramentas de desenvolvimento. Para executá-lo sem adicionar dependências ao aplicativo:

```sh
npm install --prefix /tmp/engenharia-browser --cache /tmp/engenharia-npm-cache --no-package-lock --no-audit --no-fund playwright@1.58.2
PLAYWRIGHT_MODULE=/tmp/engenharia-browser/node_modules/playwright/index.mjs npm run test:browser
```

O script usa `/usr/bin/chromium` (ajustável por `CHROMIUM_PATH`), sobe um servidor temporário e verifica cálculo, validação, exportação/importação JSON e impressão. Produz capturas desktop/mobile e um PDF em `/tmp/engenharia-*`. O aplicativo em produção não depende do Playwright. Os horários do relatório são apresentados no fuso de Brasília (`America/Sao_Paulo`); o JSON guarda o instante em UTC.

## Hospedar no GitHub Pages pela interface do GitHub

O aplicativo também funciona como site estático, sem executar `npm start` na hospedagem. Os cálculos continuam no navegador e os estudos não são gravados no GitHub.

1. No GitHub, revise a branch do aplicativo e incorpore os arquivos à `main` por um pull request. Com `index.html`, `src/` e `.nojekyll` na raiz do repositório, não é preciso baixar um ZIP, fazer upload manual ou executar `npm start`.
2. Abra **Settings → Pages**. Em **Build and deployment**, escolha **Source: Deploy from a branch**, **Branch: main**, **Folder: / (root)** e clique em **Save**.
3. Aguarde a execução de publicação na aba **Actions**. Volte a **Settings → Pages** e clique em **Visit site** quando estiver disponível.

O endereço esperado após publicação bem-sucedida é `https://tanaka-ambiental.github.io/Engenharia/`, salvo configuração de domínio personalizado. Esse endereço só passa a funcionar depois do envio dos arquivos e da publicação pelo GitHub. Se a opção Pages não aparecer, verifique as permissões de administração e a disponibilidade para o plano/visibilidade do repositório; não é necessário alterar a visibilidade como parte deste procedimento.

Para atualizar o site, envie as mudanças do aplicativo por uma branch e incorpore-as à `main`. Para outra hospedagem estática, `npm run build:pages` prepara apenas os arquivos públicos em `dist/`, sem instalar dependências. Publicar o ambiente do Codex não envia automaticamente os arquivos ao GitHub nem publica o site.

## Preencher um estudo

1. O aplicativo começa com um cenário **demonstrativo**. Altere “Natureza dos dados” para “Dados do meu estudo” ao inserir seu caso real.
2. Identifique empreendimento, corpo hídrico, município/bacia, responsável, referência hidrológica, enquadramento e fontes. Registre justificativas dos coeficientes e critérios.
3. Informe a vazão de referência, a fração adotada como outorgável, os compromissos existentes e a nova captação. Use informações compatíveis com o mesmo ponto e período.
4. Informe vazões, OD e DBO₅ no rio e no efluente, condições do trecho, saturação local, critério de OD e coeficientes calibrados ou tecnicamente justificados.
5. Calcule e confira o balanço, a curva de OD, o mínimo no trecho, a memória de cálculo e os avisos.
6. Salve o JSON para continuar depois. A importação valida os dados e recalcula os resultados. Use “Imprimir / PDF” para gerar o relatório com entradas, fontes, resultados, hipóteses e limitações.

## Modelo e unidades

- Vazões em m³/s, concentrações em mg/L, velocidade em m/s, trecho em km e tempo de cálculo em dias.
- Saldo de captação = vazão de referência × fração adotada − compromissos − nova demanda. O lançamento não é automaticamente creditado como retorno. A fração e a vazão de referência são entradas, não regras oficiais embutidas.
- A vazão efetiva do rio imediatamente antes do lançamento é informada separadamente do balanço; deve considerar as intervenções aplicáveis. O aplicativo não supõe que a nova captação esteja a montante nem a desconta novamente.
- Mistura de OD e DBO₅ por conservação de massa. `L₀ = DBO₅ / (1 − exp(−5 Kᵦ))`, com Kᵦ do ensaio a 20 °C.
- `D(t) = K₁ L₀/(K₂−K₁) × (exp(−K₁t)−exp(−K₂t)) + D₀ exp(−K₂t)` e `OD = ODsat − D`.
- Quando K₁ = K₂ = K, `D(t) = (K L₀ t + D₀) exp(−Kt)`. A implementação também evita cancelamento numérico quando as taxas são próximas.
- Coeficientes em base natural (e), dia⁻¹. K₁ e K₂ do rio são corrigidos por `K(T) = K(20) θ^(T−20)`; Kᵦ do ensaio não recebe essa correção.
- O OD mínimo é procurado nas extremidades e no extremo analítico dentro do trecho, sem depender da resolução do gráfico.
- A saturação de OD é uma entrada independente: ajustar para temperatura, altitude/pressão e salinidade. Não há correção automática.

## Escopo e limitações

Modelo de regime permanente, unidimensional, com um lançamento, mistura completa instantânea, vazão, velocidade, temperatura e saturação constantes e cinética de primeira ordem. Não inclui nitrificação, demanda do sedimento, fotossíntese, dispersão, tributários, múltiplos lançamentos ou sazonalidade. A DBO deve ser compatível com a demanda modelada; eventual contribuição nitrogenada exige tratamento próprio. Os exemplos de coeficientes e o critério inicial de OD não são prescrições oficiais nem calibração do trecho.

OD negativo é apresentado como extrapolação matemática, acompanhado de aviso de esgotamento. O modelo aeróbio não representa fisicamente a condição após o esgotamento. Um resultado favorável de OD ou de balanço não significa aprovação de outorga nem conformidade de todos os parâmetros de qualidade.

Antes de uso em um processo, o profissional habilitado deve conferir dados de campo, referência hidrológica, enquadramento, critérios, documentação e exigências vigentes do órgão competente. Ainda não foi fornecido um roteiro oficial específico para implementação. A aplicação não gera ART nem substitui a responsabilidade técnica. Autenticação, múltiplos usuários, banco de dados, publicação em domínio e integração com sistemas do SP Águas não fazem parte desta versão.

Referência conceitual: Streeter, H. W.; Phelps, E. B. (1925). *A Study of the Pollution and Natural Purification of the Ohio River*. U.S. Public Health Bulletin 146.
