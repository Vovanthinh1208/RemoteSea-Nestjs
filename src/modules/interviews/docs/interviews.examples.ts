export const ProposeInterviewRequestExample = {
  durationMinutes: 30,
  proposedSlots: ["2026-08-25T07:00:00.000Z", "2026-08-25T09:00:00.000Z"],
  meetingUrl: "https://meet.google.com/abc-defg-hij",
};

export const ConfirmInterviewRequestExample = {
  slot: "2026-08-25T07:00:00.000Z",
};

export const InterviewExample = {
  id: "cintv1a2b0000ug0h9x1n1a2",
  durationMinutes: 30,
  proposedSlots: ["2026-08-25T07:00:00.000Z", "2026-08-25T09:00:00.000Z"],
  confirmedSlot: null,
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  status: "PENDING",
  createdAt: "2026-08-18T09:12:00.000Z",
};

export const InterviewWithHeaderExample = {
  interview: InterviewExample,
  jobTitle: "Senior Backend Engineer",
  employerName: "Delta Payments",
  talentName: "Nguyen Van A",
};

export const ValidationErrorExample = {
  error: "Validation failed",
  details: [{ path: "durationMinutes", message: "Number must be >= 15" }],
};
