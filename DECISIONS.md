# Décisions techniques — SanteCI Connect

| Sujet | Décision | Statut |
|---|---|---|
| Backend | TypeScript + Fastify + PostgreSQL (pg, argon2, zod) | Retenu |
| Web | Next.js 15 (App Router), même langage que l'API | Retenu |
| Mobile | Flutter (Android et iOS) | Retenu (non démarré) |
| Hébergement | Base de données en Côte d'Ivoire ou chez un hébergeur autorisé par l'ARTCI (art. 45) | Retenu en principe ; fournisseur à choisir après vérification auprès de l'ARTCI |
| Clé de chiffrement | KMS à désigner | Ouvert |
| Sessions | Jeton opaque, empreinte SHA-256 en base ; 30 min web, 2 h mobile | Implémenté |
| Verrouillage | 5 échecs → 15 minutes | Implémenté |
| 2FA (TOTP) | RFC 6238, SHA-1, 6 chiffres, ±30 s ; secret chiffré AES-256-GCM ; anti-rejeu par pas ; **enrôlement en deux temps** (secret en attente → confirmation par un premier code, expiration 15 min) | Implémenté |
| Codes de secours 2FA | 10 codes à usage unique, hachés SHA-256, utilisables à la place du TOTP | Implémenté |
| Clé 2FA | Variable `MFA_ENC_KEY` pour le MVP, à remplacer par le KMS | Provisoire |
| Données de santé | Chiffrement applicatif AES-256-GCM colonne par colonne (`*_enc`), clé `DATA_ENC_KEY` (32 octets base64) | Implémenté (provisoire, KMS à venir) |
| Permissions | Matrice rôles × permissions en table `role_permissions`, vérifiée par middleware (`403` sinon) | Implémenté |
| Migrations | `db/schema.sql` (base) + `db/migrations/*.sql` numérotées, `npm run migrate` | Implémenté |
| Numéros de facture | `FAC-{code_clinique}-{AAAAMM}-{seq}` via compteur atomique (`invoice_counters`) | Implémenté |
| Session web | Jeton API stocké en cookie `httpOnly` (`santeci_token`, 30 min), middleware Next.js | Implémenté |

## Points ouverts

- **Clés `MFA_ENC_KEY` / `DATA_ENC_KEY`** : à migrer vers un KMS/HSM avant toute donnée réelle. Une clé perdue rend les données illisibles.
- **Row-level security** : non activée. L'isolation des cliniques repose aujourd'hui sur le filtrage applicatif (`clinic_id`). À ajouter avant la mise en production.
- **Hébergement** : l'ARTCI doit autoriser tout hébergement hors Côte d'Ivoire (art. 45).
- **Application mobile (Flutter)** : non démarrée. L'API est prête (canal `mobile`, sessions 2 h).
- **Durée de conservation des logs** : à valider avec un juriste (cf. PAS 2.4).

## Prochaine étape

- Déployer l'API + PostgreSQL sur l'hébergeur retenu, configurer le KMS.
- Écran d'enrôlement 2FA dans le web (scan du QR + confirmation).
- Application mobile patient (Flutter) : connexion OTP, mes rendez-vous, QR patient.
