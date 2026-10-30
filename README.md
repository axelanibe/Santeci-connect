# SanteCI Connect — MVP

Application de gestion de cliniques en Côte d'Ivoire : espace clinique web (secrétaires,
médecins, caissiers) + API partagée avec la future application mobile patient.

## Contenu

```
santeci-connect/
├── README.md              ce fichier
├── DECISIONS.md           décisions techniques et points ouverts
├── docker-compose.yml     PostgreSQL local pour le développement
├── .env.example           variables d'environnement (API)
├── db/
│   ├── schema.sql         schéma initial : cliniques, utilisateurs, sessions,
│   │                      patients, rendez-vous, consultations SOAP, factures,
│   │                      paiements, journal d'audit chaîné
│   └── migrations/        évolutions numérotées (compteurs factures, 2FA, permissions…)
├── api/                   API Fastify (TypeScript)
│   └── src/
│       ├── index.ts       démarrage
│       ├── app.ts         fabrique applicative (routes)
│       ├── auth.ts        connexion, 2FA, sessions, verrouillage, codes de secours
│       ├── totp.ts        TOTP RFC 6238 + chiffrement des secrets
│       ├── crypto.ts      chiffrement applicatif des données de santé
│       ├── migrate.ts     runner de migrations (`npm run migrate`)
│       ├── route-helpers.ts  auth middleware, permissions, erreurs métier
│       └── routes/        patients, rendez-vous, consultations, factures,
│                          paiements, utilisateurs, 2FA
└── web/                   Espace clinique (Next.js 15, App Router)
    └── app/               connexion (+2FA), tableau de bord, patients,
                           rendez-vous, consultations, factures
```

## Démarrage local

```bash
# 1. Base de données
docker compose up -d

# 2. API
cd api
cp ../.env.example ../.env   # renseigner MFA_ENC_KEY et DATA_ENC_KEY :
                             # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npm install
npm run migrate
npm run dev                  # http://localhost:3000

# 3. Web
cd ../web
cp .env.example .env.local   # API_URL=http://localhost:3000
npm install
npm run dev                  # http://localhost:3001
```

## API — routes principales

| Méthode | Route | Description |
|---|---|---|
| POST | `/auth/login` | Connexion (identifiant, mot de passe, canal, TOTP/code de secours) |
| POST | `/auth/mfa/enroll` | Étape 1 : secret en attente + URI otpauth |
| POST | `/auth/mfa/confirm` | Étape 2 : confirmation par un premier code |
| POST | `/auth/mfa/backup-codes` | Génère 10 codes de secours (affichés une fois) |
| POST | `/auth/logout` | Révocation de session |
| GET | `/me` | Session courante |
| GET/POST | `/patients`, `/patients/:id` | Dossiers patients (recherche, CRUD, suppression logique) |
| GET/POST/PATCH | `/appointments` | Rendez-vous (anti-double-RDV, statuts) |
| GET/POST/PATCH | `/consultations`, `/consultations/:id/sign` | SOAP chiffré, signature immuable |
| GET/POST/PATCH | `/invoices`, `/invoices/:id/payments` | Factures `FAC-…`, paiements Wave/Orange/MTN |
| GET | `/users?role=medecin` | Annuaire clinique (sans secrets) |

Sécurité : 5 échecs → verrouillage 15 min ; 2FA obligatoire si enrôlée ; permissions
par rôle (`403` sinon) ; journal d'audit append-only chaîné en SHA-256.

## Décisions techniques

| Sujet | Choix | Pourquoi |
|---|---|---|
| Base | PostgreSQL 15+ | Contraintes d'exclusion (pas de double RDV), chiffrement `pgcrypto` |
| Backend | API unique Node.js/TypeScript (Fastify) | Sert le web et le mobile |
| Web | Next.js | Espace clinique : secrétaires, médecins, caissiers |
| Mobile | Flutter | Un code pour Android et iOS, mode hors-ligne |
| Mots de passe | Argon2id | Recommandation OWASP, cité dans le PAS |
| Données de santé | Chiffrées au niveau applicatif (`bytea`, AES-256-GCM) | Clé hors base, en KMS/HSM |
| Journal d'audit | Table append-only + hash chaîné SHA-256 | Traçabilité inaltérable (US-20) |
| Consultations signées | Verrouillées par trigger | Immuabilité après signature (US-06) |

## Points ouverts

Voir `DECISIONS.md`. En résumé : clés à migrer vers un KMS/HSM, hébergement à faire
valider par l'ARTCI (art. 45), RLS à activer avant production, application mobile
Flutter à démarrer, durée de conservation des logs à valider avec un juriste.
