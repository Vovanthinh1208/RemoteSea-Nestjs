export const CreateScorecardRequestExample = {
  technicalRating: 4,
  communicationRating: 3,
  cultureFitRating: 5,
  strengths: "Strong system design; clear trade-off reasoning.",
  improvements: "Probe testing strategy in the next round.",
  recommendation: "STRONGLY_RECOMMEND",
  note: "Sharp on system design, weak on the behavioral round.",
};

export const ScorecardExample = {
  id: "csc1a2b0000ug0h9x1n1a2",
  authorId: "cusr1a2b0000ug0h9x1n1a2",
  author: { name: "Nguyen Van B" },
  recommendation: "STRONGLY_RECOMMEND",
  technicalRating: 4,
  communicationRating: 3,
  cultureFitRating: 5,
  strengths: "Strong system design; clear trade-off reasoning.",
  improvements: "Probe testing strategy in the next round.",
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
      recommendation: "RECOMMEND",
      technicalRating: 4,
      communicationRating: 4,
      cultureFitRating: 4,
      strengths: "Pragmatic and communicates clearly.",
      improvements: "Limited exposure to large-scale systems.",
      note: null,
      createdAt: "2026-08-19T10:30:00.000Z",
    },
  ],
  summary: {
    total: 2,
    hireCount: 2,
    averages: { technical: 4, communication: 3.5, cultureFit: 4.5, overall: 4 },
    recommendations: {
      STRONGLY_RECOMMEND: 1,
      RECOMMEND: 1,
      NEUTRAL: 0,
      NOT_RECOMMEND: 0,
      STRONGLY_NOT_RECOMMEND: 0,
    },
  },
};

export const ValidationErrorExample = {
  error: "Validation failed",
  details: [{ path: "recommendation", message: "Invalid enum value" }],
};
