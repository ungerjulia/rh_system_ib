# RH Agent — Independent Brazil

## Stack
- Firebase Firestore (banco de dados)
- Firebase Authentication (login com Google @independentbrazil.com)
- Firebase Cloud Functions (backend + IA)
- Vercel (frontend React)

## Projeto Firebase
- Project ID: rh-system-ib-818fc
- Auth domain: rh-system-ib-818fc.firebaseapp.com

## Deploy do Frontend no Vercel

1. Suba este código para um repositório GitHub
2. Acesse vercel.com → Import Project → selecione o repositório
3. Framework: Vite
4. Adicione a variável de ambiente:
   VITE_FUNCTIONS_URL = https://us-central1-rh-system-ib-818fc.cloudfunctions.net
5. Deploy!

## Deploy das Cloud Functions

```bash
npm install -g firebase-tools
firebase login
firebase use rh-system-ib-818fc

cd functions
# Configurar secrets
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set PROXYCURL_KEY

# Deploy
firebase deploy --only functions,firestore
```

## Rodar localmente

```bash
npm install
cp .env.example .env.local
# preencha VITE_FUNCTIONS_URL
npm run dev
```
