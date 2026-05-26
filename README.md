# HamzaCoin Backend

> Express + TypeScript half of the Learn & Earn flow. Generates AI quizzes from Wikipedia article text with Groq, then signs EIP-712 messages that the HamzaFaucet smart contract on Sepolia trusts to release HMZ rewards.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.19-000000?logo=express&logoColor=white)
![Ethers.js](https://img.shields.io/badge/Ethers.js-v6.13-2535a0)
![Groq](https://img.shields.io/badge/Groq-Llama%203.3%2070B-FF6B35)
![License](https://img.shields.io/badge/License-MIT-green)

This is one of three repos. The others are the [smart contracts](https://github.com/tahabakri/crypto_class) and the [frontend](https://github.com/tahabakri/hamzacoin-website/tree/main/hamzacoin-react). You need all three running to demo the project end-to-end.

---

## What this is

A small Node.js + Express server that does exactly two things:

1. Takes a Wikipedia article from the frontend, asks Groq (a free LLM provider) to turn it into 5 multiple-choice questions, and returns the questions to the browser **without** the correct answers.
2. Takes a user's answers, grades them against the cached correct answers, and signs an **EIP-712** message attesting the user's score. The user submits that signature to the HamzaFaucet smart contract on Sepolia, which checks the signature and pays out HMZ.

The backend never sees the user's wallet private key. The user's browser never sees the correct answers. The smart contract trusts neither — it only trusts a valid signature from the configured signer.

---

## What you'll have when you're done

Follow this guide and you will have:

- The backend running locally on `http://localhost:3001`
- A Groq API key configured and working
- A wallet whose public address is the `trustedSigner` for a deployed HamzaFaucet contract on Sepolia
- The ability to grade quizzes and produce valid EIP-712 signatures
- A foundation you can rename + redeploy as your own learn-to-earn backend

---

## Live demo

| Property | Value |
| --- | --- |
| **HamzaCoin (ERC20)** | `0x619F30ec004442cdc3BE060FC927A3688054e6c3` |
| **Network** | Sepolia Testnet (chain ID `11155111`) |
| **Etherscan** | [sepolia.etherscan.io/address/0x619F30ec004442cdc3BE060FC927A3688054e6c3](https://sepolia.etherscan.io/address/0x619F30ec004442cdc3BE060FC927A3688054e6c3) |
| **Smart contract repo** | [github.com/tahabakri/crypto_class](https://github.com/tahabakri/crypto_class) |
| **Frontend repo** | [github.com/tahabakri/hamzacoin-website](https://github.com/tahabakri/hamzacoin-website) |

---

## Tech stack

| Layer | Tool | Version |
| --- | --- | --- |
| Runtime | Node.js | 18+ |
| Language | TypeScript (strict) | 5.4 |
| Web framework | Express | 4.19 |
| Web3 lib | ethers.js | 6.13 (matches the frontend) |
| LLM client | groq-sdk | 0.7 |
| Dev runner | tsx | 4.7 (watch mode + TS source execution) |
| Module system | CommonJS, compiled to `dist/` | — |

No database. No persistent storage. Everything is in-process memory by design — kept simple on purpose.

---

## Project architecture

```
┌─────────────────────────┐   wikipedia api   ┌─────────────────┐
│  hamzacoin-react        │ ────────────────▶ │  en.wikipedia   │
│  React + Vite + ethers  │ ◀──── article ──── │  (no key)       │
└────────┬────────────────┘                   └─────────────────┘
         │ POST /api/generate-quiz
         │ POST /api/verify-and-sign
         ▼
┌─────────────────────────┐    groq llama 3.3 ┌─────────────────┐
│  hamzacoin-backend      │ ────────────────▶ │   Groq API      │
│  Express + EIP-712      │ ◀──── 5 mcqs ──── │                 │
└────────┬────────────────┘                   └─────────────────┘
         │ signs (user, score, articleHash)
         ▼
┌─────────────────────────┐                   ┌─────────────────┐
│  user's MetaMask        │ ─── claimReward ─▶│ HamzaFaucet     │
│                         │                   │  (Sepolia)      │
└─────────────────────────┘                   └────────┬────────┘
                                                       │ transfer
                                                       ▼
                                               ┌─────────────────┐
                                               │ HamzaCoin ERC20 │
                                               │  (Sepolia)      │
                                               └─────────────────┘
```

This repo is the middle box: it talks to Wikipedia (via the frontend), Groq, and signs messages for the smart contract on Sepolia.

---

## How it actually works

1. **You connect MetaMask.** The frontend asks MetaMask for your wallet address and switches you to Sepolia.
2. **You pick a Wikipedia article.** Random, featured, or search.
3. **The backend asks Groq to make 5 questions.** The frontend sends the article text to `POST /api/generate-quiz`. The backend calls Groq with a strict JSON-only prompt and returns the 5 questions. Correct answers and explanations stay in the backend's in-memory cache, keyed by the keccak256 hash of the article text.
4. **You answer the questions.** One option per question, no time limit.
5. **The backend grades and signs.** When you click *Grade my answers*, the frontend posts to `POST /api/verify-and-sign`. The backend looks up the cached answers by `articleHash`, counts the matches, and signs an EIP-712 message `{ user, score, articleHash }` with `SIGNER_PRIVATE_KEY`.
6. **You submit the signature to the smart contract.** Your wallet sends `claimReward(score, articleHash, signature)` to the HamzaFaucet on Sepolia.
7. **The contract verifies and pays out.** The contract recomputes the same digest, runs `ECDSA.recover` on the signature, and checks the recovered address equals the trusted signer it was deployed with. If yes, it marks the claim as used and transfers `score × 1 HMZ` from its balance to your wallet.
8. **Confetti fires.** The frontend listens for the transaction and celebrates.

---

## Prerequisites

| Tool | Why | How to install / check |
| --- | --- | --- |
| Node.js 18+ | Runs the backend | [nodejs.org](https://nodejs.org) → LTS. Check: `node --version` |
| Git | Clone the repos | [git-scm.com](https://git-scm.com). Check: `git --version` |
| MetaMask | Wallet that holds test ETH and signs claims | Browser extension from [metamask.io](https://metamask.io) |
| Sepolia ETH | Pays gas on the test network when claiming | Free from [faucet.alchemy.com](https://www.alchemy.com/faucets/ethereum-sepolia) |
| Groq API key | Used by the backend to write quiz questions | [console.groq.com/keys](https://console.groq.com/keys) → Sign in → API Keys → **Create API Key** → copy. Free tier is generous for development. |
| A deployed HamzaFaucet | The contract this backend signs messages for | Deploy from the [contracts repo](https://github.com/tahabakri/crypto_class). See "Step 2" below. |
| VS Code (recommended) | Editor with TypeScript + ESLint | [code.visualstudio.com](https://code.visualstudio.com) |

> Use a brand-new MetaMask account that has never held real money. The `SIGNER_PRIVATE_KEY` you put here gives anyone who has it the power to mint HMZ rewards — treat it as secret as any production key.

---

## Step-by-step setup

This is a three-piece project. If you're starting from this repo, you still need to set up the other two. The full flow is below.

### Step 1: Clone all the repos

```bash
# in any working folder (e.g. C:/Users/you/dev/)
git clone https://github.com/tahabakri/crypto_class.git
git clone https://github.com/tahabakri/hamzacoin-website.git
```

You should end up with:

```text
your-dev-folder/
├── crypto_class/                  ← contracts
└── hamzacoin-website/
    ├── hamzacoin-react/           ← frontend
    └── hamzacoin-backend/         ← you are here
```

### Step 2: Set up the contracts

Follow the README in `crypto_class/` to:

1. `npm install` and create `.env` with `PRIVATE_KEY` + `SEPOLIA_RPC_URL`.
2. Deploy `HamzaCoin` (or reuse the existing `0x619F30ec004442cdc3BE060FC927A3688054e6c3`).
3. Deploy `HamzaFaucet` with `TRUSTED_SIGNER_ADDRESS` set to the public address of the wallet whose private key you'll put in *this* repo's `SIGNER_PRIVATE_KEY`.
4. Fund the faucet via `scripts/fund-faucet.js`.

Save the faucet address — you'll need it in the next step.

### Step 3: Set up this backend

```bash
# in hamzacoin-backend/
npm install
cp .env.example .env       # or `copy` on Windows
```

Fill in `.env`:

| Variable | What it is | Where to get it |
| --- | --- | --- |
| `GROQ_API_KEY` | Free API key for the LLM that writes the quiz. | [console.groq.com/keys](https://console.groq.com/keys) → Sign in → API Keys → Create API Key → copy. |
| `SIGNER_PRIVATE_KEY` | Private key of the wallet whose public address you set as `TRUSTED_SIGNER_ADDRESS` when deploying the faucet. With or without the `0x` prefix. **NEVER commit this.** | MetaMask → account name → **Account Details** → **Export Private Key**. Use a dev-only wallet. |
| `FAUCET_CONTRACT_ADDRESS` | The deployed HamzaFaucet address on Sepolia. | The address printed by `deploy-faucet.js` in Step 2. |
| `HMZ_CONTRACT_ADDRESS` | Optional. Defaults to the live HamzaCoin at `0x619F30ec004442cdc3BE060FC927A3688054e6c3`. | Only set if you deployed your own token. |
| `CHAIN_ID` | Optional. Defaults to `11155111` (Sepolia). | Only set if you're targeting a different chain. |
| `PORT` | Optional. Defaults to `3001`. | Only set if you're running on a different port. |

Start the backend:

```bash
# in hamzacoin-backend/
npm run dev
```

You should see:

```text
HamzaCoin backend listening on http://localhost:3001
  signer address:    0x...
  faucet contract:   0x...
  hmz token:         0x619F30ec004442cdc3BE060FC927A3688054e6c3
  chain id:          11155111
```

Smoke test:

```bash
curl http://localhost:3001/health
```

Expected:

```json
{
  "ok": true,
  "signerAddress": "0x...",
  "chainId": 11155111,
  "faucetAddress": "0x...",
  "hmzAddress": "0x619F30ec004442cdc3BE060FC927A3688054e6c3"
}
```

### Step 4: Set up the frontend

```bash
# in hamzacoin-react/
npm install
cp .env.example .env
```

Fill in:

| Variable | What it is | Value |
| --- | --- | --- |
| `VITE_BACKEND_URL` | URL of *this* backend. | `http://localhost:3001` |
| `VITE_FAUCET_ADDRESS` | Same faucet address you put in this backend's `.env`. | The faucet address from Step 2. |

Run it:

```bash
# in hamzacoin-react/
npm run dev
```

Open `http://localhost:5173` in your browser.

### Step 5: Test the full flow

1. Connect MetaMask. Accept the Sepolia network switch.
2. Click **Learn & Earn** in the header.
3. Pick an article.
4. Scroll to the bottom — **Start Quiz** activates.
5. Answer the 5 questions (`1`–`4` keys, or click).
6. Click **Grade my answers**. The backend grades and signs.
7. Click **Claim X HMZ**. Confirm in MetaMask.
8. Wait ~15 seconds for Sepolia to mine the transaction. Confetti fires.

If anything fails, watch the backend's terminal — every request logs a timestamp, endpoint, truncated address or IP, score, and cache hit/miss status.

### Step 6 (bonus): Use this as your own backend

This codebase is meant to be cloned and modified. The most common things you'll change:

1. **Prompt** — `src/lib/groq.ts` has the system + user prompts. Tweak them to ask different question types (free-text, true/false, longer explanations).
2. **Model** — change `model: "llama-3.3-70b-versatile"` to any Groq-supported model.
3. **Reward shape** — instead of `score × 1 HMZ`, you could pay a flat amount, or a sliding scale. The contract enforces `score × 1 ether`; if you want different math, change the contract too.
4. **Domain** — `src/lib/signer.ts` uses `domain.name = "HamzaFaucet"`. If you rename your faucet contract, you must change this string to match — or the recovered signer address will be wrong on chain.

---

## API endpoints

### `GET /health`

Returns boot-time configuration. Useful for confirming the right signer and faucet are wired up.

```json
{
  "ok": true,
  "signerAddress": "0x...",
  "chainId": 11155111,
  "faucetAddress": "0x...",
  "hmzAddress": "0x619F30ec004442cdc3BE060FC927A3688054e6c3"
}
```

### `POST /api/generate-quiz`

Body:

```json
{
  "articleText": "200..15000 chars of plain text from Wikipedia",
  "articleTitle": "Blockchain"
}
```

Response:

```json
{
  "articleHash": "0x9d…",
  "questions": [
    { "id": 1, "question": "...", "options": ["...", "...", "...", "..."] },
    /* 4 more */
  ]
}
```

The correct answer for each question stays on the server. `articleHash` is `keccak256(articleText)` — the exact same hash the contract uses, so the signature ties the score to the article you actually read.

Rate limit: 20 per hour per IP.

Curl example:

```bash
curl -X POST http://localhost:3001/api/generate-quiz \
  -H "Content-Type: application/json" \
  -d '{"articleText":"<paste 200+ chars>","articleTitle":"Blockchain"}'
```

### `POST /api/verify-and-sign`

Body:

```json
{
  "articleHash": "0x9d…",
  "userAddress": "0xUserWalletAddress",
  "answers": [0, 1, 2, 3, 0]
}
```

Response (`score > 0`):

```json
{
  "score": 4,
  "signature": "0x...",
  "articleHash": "0x9d…",
  "perAnswer": [true, true, false, true, true],
  "explanations": ["...", "...", "...", "...", "..."]
}
```

Response (`score === 0`):

```json
{
  "score": 0,
  "signature": null,
  "articleHash": "0x9d…",
  "perAnswer": [false, false, false, false, false],
  "explanations": ["...", "...", "...", "...", "..."],
  "message": "Try again with another article."
}
```

`HTTP 410` if the quiz isn't in the cache anymore (server restarted, or the 1-hour TTL expired). The frontend should re-fetch with `/api/generate-quiz`.

Rate limit: 50 per hour per `userAddress`.

---

## How the EIP-712 signature works

Both sides agree on a typed message shape. The backend signs:

```
domain = {
  name: "HamzaFaucet",
  version: "1",
  chainId: 11155111,
  verifyingContract: <your faucet address>
}

types = {
  Claim: [
    { name: "user",        type: "address" },
    { name: "score",       type: "uint8"   },
    { name: "articleHash", type: "bytes32" }
  ]
}

value = { user, score, articleHash }
```

The contract's constants:

```solidity
EIP712("HamzaFaucet", "1")
bytes32 CLAIM_TYPEHASH = keccak256("Claim(address user,uint8 score,bytes32 articleHash)")
```

If anything differs by even a byte — the domain name, the version, the field order, the whitespace in the type string — the recovered address will be wrong and the contract will revert with `Invalid signature`.

The contract calls `_hashTypedDataV4(structHash)` which adds the `\x19\x01` prefix and the cached domain separator. We never have to recompute the domain separator on the backend; ethers' `signTypedData` does the equivalent.

---

## Folder structure

```text
hamzacoin-backend/
├── src/
│   ├── server.ts            # Express bootstrap, CORS, /health, route mounting
│   ├── config.ts            # env validation on boot, derives signer address
│   ├── types.ts             # shared request/response types
│   ├── routes/
│   │   ├── quiz.ts          # POST /api/generate-quiz
│   │   └── verify.ts        # POST /api/verify-and-sign
│   └── lib/
│       ├── groq.ts          # Groq client + prompt + JSON validator
│       ├── cache.ts         # TTL Map<articleHash, CachedQuiz>
│       ├── rateLimit.ts     # in-memory sliding window
│       └── signer.ts        # EIP-712 signTypedData
├── package.json
├── tsconfig.json            # strict TS, ES2022, commonjs
├── nodemon.json
├── .env.example
├── .env                     # your secrets (gitignored — never commit)
├── .gitignore
└── README.md                # this file
```

---

## Common errors

| Error | What it means | Fix |
| --- | --- | --- |
| Backend crashes on boot with `Missing required env var: ...` | One of `GROQ_API_KEY`, `SIGNER_PRIVATE_KEY`, or `FAUCET_CONTRACT_ADDRESS` is empty in `.env`. | Open `.env` and fill it in. The `config.ts` validator is intentionally strict. |
| `SIGNER_PRIVATE_KEY could not be parsed` | Your private key isn't 64 hex characters. | Re-export it from MetaMask. With or without `0x` prefix is fine; spaces or quotes are not. |
| Frontend says `Invalid signature` after MetaMask confirms | The `SIGNER_PRIVATE_KEY` you set here doesn't match the `trustedSigner` address you passed when deploying the faucet. | Either redeploy the faucet with the correct signer, *or* update this backend's `.env` to use the matching private key. |
| Frontend says `Quiz expired or not found` (HTTP 410) | You restarted the backend while a quiz was in progress, or more than 1 hour passed. | Reload the article in the frontend to fetch a fresh quiz. |
| `429 Too Many Requests` from `/api/generate-quiz` | You hit the per-IP rate limit (20/hour). | Wait, or restart the backend to reset the in-memory limiter. |
| CORS error in the browser console | Frontend is running on an unexpected port. The default CORS allowlist is `5173` and `5174`. | Add your port in `src/server.ts` or run the frontend on the default port. |
| Groq returns 401 / 403 | `GROQ_API_KEY` is wrong or revoked. | Re-copy from [console.groq.com/keys](https://console.groq.com/keys). |
| Groq returns 502 | Groq had a hiccup. The backend doesn't retry — single attempt. | Reload and try again. |
| `Could not read faucet balance` in the frontend Hero card | The faucet contract address in your frontend `.env` is wrong, or you're not on Sepolia. | Check `VITE_FAUCET_ADDRESS` matches the address you deployed in Step 2. |

---

## Security warnings

- **Never push your `.env` file to GitHub.** The `.gitignore` already excludes it, but always double-check `git status` before committing.
- **Never paste `SIGNER_PRIVATE_KEY` into a chat with an AI assistant, support form, Discord channel, or Telegram group.** No one legitimate needs your private key, ever.
- **Use a fresh wallet for development.** Create a new MetaMask account that has never held mainnet money.
- **This is a testnet project.** HMZ has no monetary value. Sepolia ETH is free from faucets. Nothing here is real money.
- **`SIGNER_PRIVATE_KEY` controls who can mint rewards.** Anyone who has it can sign valid claims for any score for any user. If you suspect it's leaked, call `setTrustedSigner` on the faucet with a fresh address.
- **Fund the faucet only with what you're prepared to lose.** Even on testnet, a misconfigured signer key can drain the faucet's full balance.

---

## What I learned building this

- **Express + TypeScript strict** — error-handler signatures (the 4-arg version), CORS allowlists, request validation guards.
- **EIP-712 server-side signing** — `ethers.Wallet.signTypedData(domain, types, value)` and exactly which strings have to match the contract byte-for-byte.
- **Groq API + JSON-only prompts** — `response_format: { type: "json_object" }`, structural validation (5 items, 4 options, valid indices) before trusting model output.
- **Hashing strategies** — keccak256 of article text as a deterministic cache key that the contract can also compute on its end.
- **In-memory TTL caches and rate limiters** — when to use them (single-instance dev / demo), when they're not enough (multi-instance / serverless prod — need Redis or Vercel KV).
- **Failing fast on misconfig** — validating env vars at boot, deriving + logging the signer address so misconfiguration is visible immediately.
- **Privacy by design** — separating "what only the server knows" (correct answers, signing key) from "what the client gets" (questions, signed scores, never raw secrets).

---

## How to use this as a template for your own coin

To turn this backend into the signer for your own learn-to-earn token:

1. Deploy your own ERC20 + faucet from `crypto_class/` (see that repo's "How to use this as a template").
2. Update `FAUCET_CONTRACT_ADDRESS` and `HMZ_CONTRACT_ADDRESS` in this backend's `.env`.
3. Change `domain.name` in `src/lib/signer.ts` to match whatever you renamed your faucet contract to (e.g. `"AhmedFaucet"`). The contract's `EIP712("AhmedFaucet", "1")` line must match.
4. Optionally edit `src/lib/groq.ts` to change the prompt or the model.
5. Rename `name` in `package.json`.
6. Update this `README.md` to describe your project.
7. Deploy to a Node host: Railway / Fly / Render are easy. For Vercel, see the "Deploying to Vercel" notes below.

---

## Deploying to Vercel (notes, not implemented)

This codebase runs cleanly on a single Node host (Railway, Fly, Render). Going serverless on Vercel needs three changes:

1. Wrap the Express app for `@vercel/node` (export `default app` from `api/index.ts`).
2. Replace `src/lib/cache.ts` with Vercel KV (same shape, async wrappers).
3. Replace `src/lib/rateLimit.ts` with Upstash Redis or Vercel KV with TTL — current per-process buckets won't survive cold starts.

`SIGNER_PRIVATE_KEY` goes in Vercel's environment variables (encrypted at rest, never exposed to the client bundle since this is a server route). Treat that key with the same care as production payment credentials.

---

## License

[MIT](LICENSE) — use it, change it, ship something cool.

---

## Credits

- Built by [Taha Bakri](https://github.com/tahabakri) as a learning project.
- [Groq](https://groq.com) for fast LLM inference (Llama 3.3 70B).
- [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) for the EIP-712 base classes the signature signs against.
- [Wikipedia](https://www.wikipedia.org) for the article content (CC BY-SA).

---

## Companion repos

- **Smart contracts**: [github.com/tahabakri/crypto_class](https://github.com/tahabakri/crypto_class)
- **Frontend + backend monorepo (this lives here)**: [github.com/tahabakri/hamzacoin-website](https://github.com/tahabakri/hamzacoin-website)
  - `hamzacoin-react/` — React + Vite + ethers v6 dApp
  - `hamzacoin-backend/` — this folder
