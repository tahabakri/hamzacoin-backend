// ============================================================================
// server.ts — Express bootstrap
// ============================================================================

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { config } from "./config";
import { quizRouter } from "./routes/quiz";
import { verifyRouter } from "./routes/verify";
import { signerAddress } from "./lib/signer";

const app = express();

// CORS — allow the Vite dev server (5173) and the alternate port (5174).
// Production deployments should narrow this further.
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }),
);

// Larger limit because article text can be 15 KB.
app.use(express.json({ limit: "64kb" }));

// Health check — never include secrets.
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    signerAddress: signerAddress(),
    chainId: config.CHAIN_ID,
    faucetAddress: config.FAUCET_CONTRACT_ADDRESS,
    hmzAddress: config.HMZ_CONTRACT_ADDRESS,
  });
});

app.use("/api", quizRouter);
app.use("/api", verifyRouter);

// 404 fallback.
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// Centralized error handler — Express needs the 4-arg signature, so the
// unused `_next` is intentional.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[error]", err.stack ?? err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.PORT, () => {
  console.log(`HamzaCoin backend listening on http://localhost:${config.PORT}`);
  console.log(`  signer address:    ${signerAddress()}`);
  console.log(`  faucet contract:   ${config.FAUCET_CONTRACT_ADDRESS}`);
  console.log(`  hmz token:         ${config.HMZ_CONTRACT_ADDRESS}`);
  console.log(`  chain id:          ${config.CHAIN_ID}`);
});
