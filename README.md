# Raiz — agenda pessoal

Agenda pessoal estática em HTML, CSS e JavaScript modular, com Firebase Authentication e Cloud Firestore. O front-end pode ser publicado no Vercel; o Firebase continua cuidando de login e persistência.

## Estrutura

```text
agenda-pessoal/
├── index.html
├── styles.css
├── firestore.rules
├── vercel.json
├── assets/
│   └── raiz-mark.svg
└── js/
    ├── app.js
    ├── calendar.js
    ├── dates.js
    ├── events.js
    ├── firebase.js
    ├── firebase-config.js
    └── local-reminders.js
```

## Configuração Firebase

1. No Firebase Console, habilite **Authentication → E-mail/senha**.
2. Crie o banco Cloud Firestore em modo **Nativo**, edição Standard.
3. Em **Configurações do projeto → Geral → Seus apps → app Web → Config**, copie os valores do objeto `firebaseConfig` para `js/firebase-config.js`. O arquivo é carregado no navegador; nunca insira credenciais de service account nele.
4. Em **Authentication → Configurações → Domínios autorizados**, inclua `localhost` para desenvolvimento e seu domínio Vercel em produção.
5. Publique no Firestore o conteúdo atual de `firestore.rules`. As regras preservam compatibilidade com compromissos antigos que ainda não tenham categoria, duração e observações.

Os compromissos ficam em `users/{uid}/events/{eventId}`. As regras validam dono, título, data, horário, categoria, duração, observações e estado de conclusão.

## Rodar localmente

No terminal dentro da pasta do projeto:

```bash
npx serve .
```

Abra o endereço que o comando mostrar. Não abra o HTML com `file://`.

## Publicar

Envie **todo o conteúdo desta pasta**, incluindo `js/` e `assets/`, para a raiz do repositório GitHub. Conecte esse repositório privado à Vercel, escolha preset **Other**, diretório raiz `./`, e deixe build, output e install commands vazios. A Vercel republica os commits automaticamente. Depois, autorize o domínio atribuído à implantação no Firebase Authentication.

## Recursos

- Calendário mensal, semanal, diário e lista, navegável por período.
- Clique em um dia para criar; clique em um horário nas visões semana e dia para criar com a hora preenchida.
- Compromissos com data, horário opcional, duração, categoria e observações.
- Edição, conclusão/reabertura, detalhes e exclusão persistidos no Firestore.
- Busca por título, observações ou categoria e filtros por categoria e estado.
- Entrada rápida para `hoje`, `amanhã`, `depois de amanhã`, `dia 14/11` e horários como `14h` e `15:30`.
- Alertas de proximidade na lista lateral; os dados exibidos vêm da conta autenticada.
- Lembretes locais: clique em **Ativar avisos** e escolha o prazo ao criar cada compromisso. Com a agenda aberta, aparece um cartão visual no prazo escolhido e outro no início do compromisso; cada cartão pode ser fechado e desaparece sozinho após 5 minutos. Um toque suave de cerca de 5 segundos acompanha os avisos.
- Logo SVG própria, paleta verde, modo escuro e layout responsivo.

Os lembretes locais funcionam neste aparelho enquanto a agenda estiver aberta e visível. Eles não precisam do plano Blaze, mas não são enviados se a agenda estiver fechada ou suspensa pelo navegador. A permissão do navegador é separada do cartão visual dentro da página.

## Notificações push em segundo plano (opcional)

O envio quando a agenda está fechada é um recurso separado e opcional. Para habilitá-lo, gere um par de chaves com `npx --yes web-push generate-vapid-keys`, coloque a chave pública em `js/firebase-config.js` e `functions/index.js` (os valores devem ser iguais) e guarde a chave privada como segredo, sem enviá-la ao GitHub: `firebase functions:secrets:set WEB_PUSH_VAPID_PRIVATE_KEY`. Depois rode `npm install --prefix functions` e `firebase deploy --only functions,firestore:rules,firestore:indexes`.

As Cloud Functions agendadas exigem o plano Blaze e uma conta de faturamento, podendo gerar cobranças. No iPhone/iPad, Web Push requer iOS/iPadOS 16.4 ou posterior e o site adicionado à Tela de Início pelo Safari.
