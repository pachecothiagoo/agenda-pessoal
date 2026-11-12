# Agenda pessoal

Aplicação estática em HTML, Tailwind via CDN e JavaScript ES Modules. Usa Firebase Authentication (e-mail/senha) e Firestore. Cada documento fica em `users/{uid}/events/{eventId}`; as regras incluídas limitam toda operação ao UID autenticado.

## Estrutura

```text
agenda-pessoal/
├── index.html
├── firebase-config.js          # referência de configuração
├── firestore.rules
├── vercel.json
└── js/
    ├── app.js                  # autenticação e interface
    ├── dates.js                # datas, alertas e parser de entrada rápida
    ├── events.js               # operações e sincronização Firestore
    ├── firebase.js             # inicialização dos SDKs
    └── firebase-config.js      # configuração usada pelo app
```

## 1. Criar e configurar o Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com/) e crie um projeto.
2. Em **Authentication → Começar → Método de login**, habilite **E-mail/senha**.
3. Em **Firestore Database**, crie um banco em modo de produção. Escolha a região mais próxima dos usuários.
4. Em **Configurações do projeto → Geral → Seus apps**, registre um aplicativo Web (`</>`). Copie o objeto `firebaseConfig`.
5. Cole esses valores em `js/firebase-config.js` (e mantenha `firebase-config.js` da raiz como referência, se desejar). As chaves do SDK Web identificam o projeto e não são credenciais administrativas; a proteção de dados é feita pelas regras.
6. No console do Firestore, abra **Regras**, substitua pelo conteúdo de `firestore.rules` e publique. Não use regras abertas para produção.
7. Em **Authentication → Configurações → Domínios autorizados**, confirme que o domínio de produção da Vercel está listado. Adicione também `localhost` se for testar localmente.

## 2. Rodar localmente

Não abra `index.html` diretamente como arquivo, porque os módulos ES e o Firebase precisam de um servidor HTTP. Na pasta do projeto, rode um servidor estático, por exemplo:

```bash
npx serve .
```

Ou use a extensão Live Server do VS Code. Configure a URL exibida entre os domínios autorizados no Firebase.

## 3. Publicar no GitHub e Vercel

1. Crie um repositório GitHub e envie o conteúdo desta pasta. Antes, preencha `js/firebase-config.js` com a configuração do seu projeto.
2. Em [Vercel](https://vercel.com/), selecione **Add New → Project**, importe o repositório.
3. Como é um site estático puro, deixe **Framework Preset: Other**, **Build Command** em branco e **Output Directory** como `.`. Importe/deploy.
4. Copie o domínio `*.vercel.app` que a Vercel atribuir e adicione-o aos domínios autorizados no Firebase Auth.
5. Para alterações futuras, faça push para o branch conectado; a Vercel publica automaticamente.

O config do Firebase Web é enviado com o site porque o navegador precisa dele. Não coloque service account, chave privada ou segredo administrativo no front-end. O SDK Web não usa variáveis de ambiente da Vercel sem uma etapa de build; neste projeto estático, edite o módulo de configuração antes do deploy.

## Entrada rápida e limites

O parser entende `hoje`, `amanhã`, `depois de amanhã`, `dia 14`, `dia 14/11`, `14/11/2027` e horários como `14h`, `14hr`, `14:30` ou `às 15:00`. Datas `dia N` sem mês usam o mês atual ou o próximo mês se o dia já passou. Se uma data não for reconhecida, o sistema pede uma forma mais clara em vez de agendar algo incorreto. Revise a confirmação antes de fechar o fluxo. O parser funciona no navegador e não envia texto a um serviço de IA.

Os alertas aparecem para compromissos não concluídos de hoje até 30 dias e distinguem urgência, semana(s), mês e vencidos. A lista “Próximos” oculta vencidos; selecione “Todos” para encontrá-los. O horário é opcional.
