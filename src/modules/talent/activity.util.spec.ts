import {
  ACTIVITY_FEED_LIMIT,
  interviewsToActivity,
  invitationsToActivity,
  mergeActivity,
  messagesToActivity,
  statusEventsToActivity,
} from "./activity.util";
import type {
  InterviewActivitySource,
  InvitationActivitySource,
  MessageActivitySource,
  StatusEventActivitySource,
} from "./activity.interfaces";

const job = {
  title: "Senior Backend Engineer",
  employer: { companyName: "Acme" },
};

describe("statusEventsToActivity", () => {
  it("labels the status and points at the talent dashboard", () => {
    const event: StatusEventActivitySource = {
      id: "evt-1",
      status: "SHORTLISTED",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      application: { id: "app-1", job },
    };
    const items = statusEventsToActivity([event]);
    expect(items[0]).toMatchObject({
      type: "APPLICATION_STATUS_CHANGED",
      title: "Shortlisted",
      body: "Senior Backend Engineer at Acme",
      link: "/applications/app-1",
    });
  });
});

describe("messagesToActivity", () => {
  it("truncates a long message body and links to the thread", () => {
    const longBody = "a".repeat(200);
    const message: MessageActivitySource = {
      id: "msg-1",
      body: longBody,
      createdAt: new Date("2026-08-02T00:00:00.000Z"),
      application: { id: "app-1", job },
    };
    const items = messagesToActivity([message]);
    expect(items[0]!.link).toBe("/applications/app-1/messages");
    expect(items[0]!.body).toContain("…");
    expect(items[0]!.body?.length).toBeLessThan(longBody.length);
  });

  it("leaves a short message body untouched", () => {
    const message: MessageActivitySource = {
      id: "msg-2",
      body: "When can you start?",
      createdAt: new Date("2026-08-02T00:00:00.000Z"),
      application: { id: "app-1", job },
    };
    const items = messagesToActivity([message]);
    expect(items[0]!.body).toBe(
      'Senior Backend Engineer at Acme: "When can you start?"',
    );
  });
});

describe("interviewsToActivity", () => {
  it("emits a single proposed entry for a still-pending interview", () => {
    const interview: InterviewActivitySource = {
      id: "iv-1",
      status: "PENDING",
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
      updatedAt: new Date("2026-08-03T00:00:00.000Z"),
      application: { id: "app-1", job },
    };
    const items = interviewsToActivity([interview]);
    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe("INTERVIEW_PROPOSED");
  });

  it("emits both a proposed and a confirmed entry for a confirmed interview", () => {
    const interview: InterviewActivitySource = {
      id: "iv-2",
      status: "CONFIRMED",
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
      updatedAt: new Date("2026-08-04T00:00:00.000Z"),
      application: { id: "app-1", job },
    };
    const items = interviewsToActivity([interview]);
    expect(items.map((i) => i.type)).toEqual([
      "INTERVIEW_PROPOSED",
      "INTERVIEW_CONFIRMED",
    ]);
    expect(items[1]!.createdAt).toEqual(interview.updatedAt);
  });
});

describe("invitationsToActivity", () => {
  it("links to the job the talent was invited to", () => {
    const invitation: InvitationActivitySource = {
      id: "inv-1",
      createdAt: new Date("2026-08-05T00:00:00.000Z"),
      job: { id: "job-1", title: job.title, employer: job.employer },
    };
    const items = invitationsToActivity([invitation]);
    expect(items[0]!.link).toBe("/jobs/job-1");
    expect(items[0]!.type).toBe("INVITATION_RECEIVED");
  });
});

describe("mergeActivity", () => {
  it("sorts every source newest-first", () => {
    const older = statusEventsToActivity([
      {
        id: "evt-1",
        status: "REVIEWING",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        application: { id: "app-1", job },
      },
    ]);
    const newer = invitationsToActivity([
      {
        id: "inv-1",
        createdAt: new Date("2026-08-05T00:00:00.000Z"),
        job: { id: "job-1", title: job.title, employer: job.employer },
      },
    ]);
    const merged = mergeActivity(older, newer);
    expect(merged.map((i) => i.id)).toEqual(["inv-1", "evt-1"]);
  });

  it("caps the merged result at ACTIVITY_FEED_LIMIT", () => {
    const many = Array.from({ length: ACTIVITY_FEED_LIMIT + 10 }, (_, i) =>
      statusEventsToActivity([
        {
          id: `evt-${i}`,
          status: "REVIEWING",
          createdAt: new Date(2026, 0, i + 1),
          application: { id: "app-1", job },
        },
      ]),
    ).flat();
    expect(mergeActivity(many)).toHaveLength(ACTIVITY_FEED_LIMIT);
  });
});
