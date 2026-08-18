export const MessageExample = {
  id: "cmsg1a2b0000ug0h9x1n1a2",
  senderId: "cmrxb30bh0023e9zef8nanby4",
  body: "Does 2pm ICT Thursday work for a quick call?",
  createdAt: "2026-08-18T09:12:00.000Z",
};

export const ThreadExample = {
  messages: [MessageExample],
  jobTitle: "Senior Backend Engineer",
  employerName: "Delta Payments",
  talentName: "Nguyen Van A",
};

export const SendMessageRequestExample = {
  body: "Does 2pm ICT Thursday work for a quick call?",
};

export const ValidationErrorExample = {
  error: "Validation failed",
  details: [{ path: "body", message: "Message can't be empty" }],
};
