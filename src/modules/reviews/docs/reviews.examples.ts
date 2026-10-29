/** Request/response example payloads for the Reviews module's Swagger docs. */

export const ReviewEligibilityEligibleExample = {
  eligible: true,
  reason: null,
  direction: "TALENT_TO_EMPLOYER",
  revieweeId: "cemp1a2b0000ug0h9x1n1a2",
  alreadyReviewed: false,
};

export const ReviewEligibilityNotEligibleExample = {
  eligible: false,
  reason: "INTERVIEW_NOT_YET_HELD",
  direction: null,
  revieweeId: null,
  alreadyReviewed: false,
};

export const CreateReviewRequestExample = {
  applicationId: "capp1a2b0000ug0h9x1n1a2",
  overallRating: 5,
  communicationRating: 5,
  professionalismRating: 5,
  interviewProcessRating: 4,
  title: "Smooth, well-organised process",
  comment: "Great communication throughout the interview process.",
};

export const ReviewResponseExample = {
  id: "crev1a2b0000ug0h9x1n1a2",
  applicationId: "capp1a2b0000ug0h9x1n1a2",
  direction: "TALENT_TO_EMPLOYER",
  reviewerId: "ctaluser1a2b0000ug0h9x1n1a2",
  revieweeId: "cempuser1a2b0000ug0h9x1n1a2",
  overallRating: 5,
  communicationRating: 5,
  professionalismRating: 5,
  interviewProcessRating: 4,
  reliabilityRating: null,
  title: "Smooth, well-organised process",
  comment: "Great communication throughout the interview process.",
  status: "PUBLISHED",
  createdAt: "2026-08-19T09:00:00.000Z",
  updatedAt: "2026-08-19T09:00:00.000Z",
};

export const ListUserReviewsResponseExample = {
  averageRating: 4.8,
  totalReviews: 24,
  distribution: { 1: 0, 2: 1, 3: 2, 4: 6, 5: 15 },
  ratings: {
    communication: 4.9,
    professionalism: 4.8,
    interviewProcess: 4.6,
    reliability: null,
  },
  reviews: [
    {
      id: "crev1a2b0000ug0h9x1n1a2",
      direction: "TALENT_TO_EMPLOYER",
      overallRating: 5,
      communicationRating: 5,
      professionalismRating: 5,
      interviewProcessRating: 4,
      reliabilityRating: null,
      title: "Reliable candidate",
      comment: "Very professional and reliable throughout the process.",
      createdAt: "2026-08-05T09:00:00.000Z",
      reviewer: { name: "Jane Doe", employer: null },
    },
  ],
  pagination: { page: 1, limit: 20, total: 24, pages: 2 },
};

export const ReviewValidationErrorExample = {
  error: {
    formErrors: [],
    fieldErrors: { overallRating: ["Number must be less than or equal to 5"] },
  },
};

export const ReviewNotEligibleExample = {
  error: "Not eligible to review this interaction",
};

export const ReviewAlreadyExistsExample = {
  error: "Already reviewed this interaction",
};

export const ApplicationNotFoundExample = { error: "Application not found" };
