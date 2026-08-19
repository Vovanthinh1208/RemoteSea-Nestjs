export const CreateScorecardRequestExample = {
  recommendation: "STRONG_YES",
  note: "Sharp on system design, weak on the behavioral round.",
};

export const ScorecardExample = {
  id: "csc1a2b0000ug0h9x1n1a2",
  authorId: "cusr1a2b0000ug0h9x1n1a2",
  author: { name: "Nguyen Van B" },
  recommendation: "STRONG_YES",
  note: "Sharp on system design, weak on the behavioral round.",
  createdAt: "2026-08-19T09:12:00.000Z",
};

export const ScorecardListExample = {
  scorecards: [
    ScorecardExample,
    {
      id: "csc1a2b0000ug0h9x1n1a3",
      authorId: "cusr1a2b0000ug0h9x1n1a3",
      author: { name: "Tran Thi C" },
      recommendation: "YES",
      note: null,
      createdAt: "2026-08-19T10:30:00.000Z",
    },
  ],
  summary: { total: 2, hireCount: 2 },
};

export const ValidationErrorExample = {
  error: "Validation failed",
  details: [{ path: "recommendation", message: "Invalid enum value" }],
};
