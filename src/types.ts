// ============================================================================
// types.ts — shared TypeScript types used across the backend
// ============================================================================

// What Groq must return for each quiz question (raw, includes the answer).
export type RawQuestion = {
  id: number;
  question: string;
  options: string[]; // exactly 4
  correctIndex: number; // 0-3
  explanation: string;
};

// What the client sees — same as RawQuestion but without correctIndex.
export type PublicQuestion = Omit<RawQuestion, "correctIndex" | "explanation"> & {
  // Keep `id` and `question` and `options`; explanation is held back until
  // grading so the user can't peek at it during the quiz.
};

// Cached entry per article hash.
export type CachedQuiz = {
  questions: PublicQuestion[]; // safe shape returned to client
  correctAnswers: number[]; // length 5, each 0-3
  explanations: string[]; // length 5
  createdAt: number; // epoch ms
};

// Request bodies

export type GenerateQuizBody = {
  articleText: string;
  articleTitle: string;
};

export type VerifyAndSignBody = {
  articleHash: string;
  userAddress: string;
  answers: number[]; // length 5, each 0-3
};

// Response bodies

export type GenerateQuizResponse = {
  articleHash: string;
  questions: PublicQuestion[];
};

export type VerifyAndSignResponse = {
  score: number;
  signature: string | null;
  articleHash: string;
  perAnswer: boolean[];
  explanations?: string[]; // explanations for missed questions (revealed after grading)
  message?: string;
};

// ----------------------------------------------------------------------------
// Holders — GET /api/holders (Etherscan-backed all-time holder count)
// ----------------------------------------------------------------------------

export type HolderEntry = {
  address: string;
  /** Raw token base units (wei) as a decimal string; HMZ has 18 decimals. */
  balance: string;
};

export type HoldersResult = {
  holderCount: number;
  holders: HolderEntry[];
  /** Highest block number seen while scanning the Transfer log. */
  asOfBlock: number;
};

// Cached entry — mirrors CachedQuiz: payload + createdAt for lazy TTL eviction.
export type CachedHolders = HoldersResult & {
  createdAt: number; // epoch ms
};

// What GET /api/holders returns on success.
export type GetHoldersResponse = HoldersResult & {
  source: "etherscan";
};
