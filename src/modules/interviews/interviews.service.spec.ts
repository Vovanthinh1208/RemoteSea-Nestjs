import { InterviewsService } from "./interviews.service";
import type { InterviewsRepository } from "./interviews.repository";
import type { ApplicationParties } from "./interfaces";
import {
  BadRequestApiException,
  ConflictApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const notificationsService = {
  create: jest.fn().mockResolvedValue(undefined),
};

const companyMembershipService = {
  resolveMembership: jest.fn().mockResolvedValue(null),
};

const emailService = {
  sendInterviewProposedEmail: jest.fn().mockResolvedValue(undefined),
  sendInterviewConfirmedEmail: jest.fn().mockResolvedValue(undefined),
  sendInterviewCancelledEmail: jest.fn().mockResolvedValue(undefined),
};

const contacts = {
  talent: {
    name: "Talent One",
    email: "talent@example.com",
    emailEnabled: true,
  },
  employer: { name: "Acme Inc", email: "owner@acme.example" },
  interviewer: { name: "Interviewer One", email: "interviewer@acme.example" },
};

// runInBackground fire-and-forget: let queued e-mail tasks settle.
const flushBackground = () => new Promise((resolve) => setImmediate(resolve));

// PB60 AC2: title, platform and meeting link are part of every proposal.
const proposal = {
  title: "Vòng 1 - Kỹ thuật",
  platform: "GOOGLE_MEET" as const,
  meetingUrl: "https://meet.google.com/abc-defg-hij",
};

const makeService = (
  repoOverrides: Partial<InterviewsRepository> = {},
  companyMembershipOverrides: Record<string, jest.Mock> = {},
) => {
  const repo = {
    findContacts: jest.fn().mockResolvedValue(contacts),
    ...repoOverrides,
  } as unknown as InterviewsRepository;
  const company = {
    ...companyMembershipService,
    ...companyMembershipOverrides,
  };
  return {
    service: new InterviewsService(
      repo,
      notificationsService as never,
      company as never,
      emailService as never,
    ),
    repo,
    companyMembershipService: company,
  };
};

const parties: ApplicationParties = {
  id: "app-1",
  status: "INTERVIEW",
  talent: { userId: "talent-user-1", user: { name: "Talent One" } },
  job: {
    title: "Backend Engineer",
    employerId: "company-1",
    employer: { userId: "employer-user-1", companyName: "Acme Inc" },
  },
};

const futureSlot = () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
const pastSlot = () => new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  notificationsService.create.mockClear();
  emailService.sendInterviewProposedEmail.mockClear();
  emailService.sendInterviewConfirmedEmail.mockClear();
  emailService.sendInterviewCancelledEmail.mockClear();
});

describe("InterviewsService.propose", () => {
  it("rejects when the application isn't at the INTERVIEW stage", async () => {
    const { service } = makeService();

    const error = await service
      .propose(
        { ...parties, status: "SHORTLISTED" },
        {
          ...proposal,
          durationMinutes: 30,
          proposedSlots: [futureSlot().toISOString()],
        },
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.APPLICATION_NOT_AT_INTERVIEW_STAGE,
    });
  });

  it("rejects a proposed slot in the past", async () => {
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .propose(parties, {
        ...proposal,
        durationMinutes: 30,
        proposedSlots: [pastSlot().toISOString()],
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVALID_INTERVIEW_SLOT,
    });
  });

  it("rejects re-proposing onto an already-confirmed interview", async () => {
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue({
        id: "intv-1",
        status: "CONFIRMED",
      }),
    });

    const error = await service
      .propose(parties, {
        ...proposal,
        durationMinutes: 30,
        proposedSlots: [futureSlot().toISOString()],
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.INTERVIEW_ALREADY_CONFIRMED,
    });
  });

  it("upserts and notifies the talent on success", async () => {
    const slot = futureSlot();
    const upsertPending = jest.fn().mockResolvedValue({
      id: "intv-1",
      status: "PENDING",
      proposedSlots: [slot],
      title: proposal.title,
      platform: proposal.platform,
      durationMinutes: 45,
      meetingUrl: proposal.meetingUrl,
    });
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue(null),
      upsertPending,
    });

    await service.propose(parties, {
      ...proposal,
      durationMinutes: 45,
      proposedSlots: [slot.toISOString()],
    });
    await flushBackground();

    expect(upsertPending).toHaveBeenCalledWith({
      applicationId: "app-1",
      title: "Vòng 1 - Kỹ thuật",
      platform: "GOOGLE_MEET",
      durationMinutes: 45,
      proposedSlots: [slot],
      meetingUrl: "https://meet.google.com/abc-defg-hij",
    });
    expect(notificationsService.create).toHaveBeenCalledWith({
      userId: "talent-user-1",
      type: "INTERVIEW_PROPOSED",
      title: "Acme Inc proposed interview times",
      body: "Vòng 1 - Kỹ thuật: 1 option(s) for a 45-min interview for Backend Engineer.",
      link: "/applications/app-1/interview",
    });
    // PB60 AC5: e-mail as well as in-app.
    expect(emailService.sendInterviewProposedEmail).toHaveBeenCalledWith(
      "talent@example.com",
      "Talent One",
      expect.objectContaining({
        title: "Vòng 1 - Kỹ thuật",
        platform: "Google Meet",
        meetingUrl: proposal.meetingUrl,
      }),
      [slot],
      "app-1",
    );
  });

  it("skips the proposal e-mail when the talent turned application e-mails off", async () => {
    const slot = futureSlot();
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue(null),
      upsertPending: jest.fn().mockResolvedValue({
        id: "intv-1",
        status: "PENDING",
        proposedSlots: [slot],
        ...proposal,
        durationMinutes: 30,
      }),
      findContacts: jest.fn().mockResolvedValue({
        ...contacts,
        talent: { ...contacts.talent, emailEnabled: false },
      }),
    });

    await service.propose(parties, {
      ...proposal,
      durationMinutes: 30,
      proposedSlots: [slot.toISOString()],
    });
    await flushBackground();

    expect(notificationsService.create).toHaveBeenCalled();
    expect(emailService.sendInterviewProposedEmail).not.toHaveBeenCalled();
  });
});

describe("InterviewsService.confirm", () => {
  it.each([-1, 0])(
    "S3-PB61-TC05 rejects an expired proposed slot (offset %d ms) without side effects",
    async (offset) => {
      jest.useFakeTimers().setSystemTime(new Date("2026-10-16T08:00:00Z"));
      try {
        const slot = new Date(Date.now() + offset);
        const confirmSlot = jest
          .fn()
          .mockResolvedValue({ status: "CONFIRMED" });
        const { service } = makeService({
          findByApplicationId: jest.fn().mockResolvedValue({
            status: "PENDING",
            proposedSlots: [slot],
          }),
          confirmSlot,
        });
        await expect(
          service.confirm(parties, { slot: slot.toISOString() }),
        ).rejects.toThrow(BadRequestApiException);
        expect(confirmSlot).not.toHaveBeenCalled();
        expect(notificationsService.create).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it("throws INTERVIEW_NOT_FOUND when nothing has been proposed yet", async () => {
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .confirm(parties, { slot: futureSlot().toISOString() })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect((error as NotFoundApiException).getResponse()).toMatchObject({
      code: ErrorCode.INTERVIEW_NOT_FOUND,
    });
  });

  it("rejects a slot that wasn't one of the proposed options", async () => {
    const proposed = futureSlot();
    const somethingElse = new Date(proposed.getTime() + 60_000);
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue({
        id: "intv-1",
        status: "PENDING",
        proposedSlots: [proposed],
      }),
    });

    const error = await service
      .confirm(parties, { slot: somethingElse.toISOString() })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVALID_INTERVIEW_SLOT,
    });
  });

  it("throws INTERVIEW_ALREADY_CONFIRMED when the CAS write loses the race", async () => {
    const slot = futureSlot();
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue({
        id: "intv-1",
        status: "PENDING",
        proposedSlots: [slot],
      }),
      confirmSlot: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .confirm(parties, { slot: slot.toISOString() })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.INTERVIEW_ALREADY_CONFIRMED,
    });
  });

  it("confirms the slot and notifies the employer on success", async () => {
    const slot = futureSlot();
    const confirmSlot = jest.fn().mockResolvedValue({
      id: "intv-1",
      status: "CONFIRMED",
      confirmedSlot: slot,
      ...proposal,
      durationMinutes: 30,
    });
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue({
        id: "intv-1",
        status: "PENDING",
        proposedSlots: [slot],
      }),
      confirmSlot,
    });

    const result = await service.confirm(parties, { slot: slot.toISOString() });

    expect(confirmSlot).toHaveBeenCalledWith("app-1", slot);
    expect(result.status).toBe("CONFIRMED");
    expect(notificationsService.create).toHaveBeenCalledWith({
      userId: "employer-user-1",
      type: "INTERVIEW_CONFIRMED",
      title: "Interview confirmed",
      body: "Talent One confirmed the interview for Backend Engineer.",
      link: "/applications/app-1/interview",
    });

    // PB61 AC4: a confirmation with calendar.ics goes to both sides — the
    // talent, the company contact and the assigned interviewer.
    await flushBackground();
    const sent = emailService.sendInterviewConfirmedEmail.mock.calls;
    expect(sent.map((call) => call[0])).toEqual([
      "talent@example.com",
      "owner@acme.example",
      "interviewer@acme.example",
    ]);
    for (const call of sent) {
      expect(call[3]).toEqual(slot);
      const ics = (call[4] as string).replace(/\r\n /g, "");
      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain('ATTENDEE;CN="Talent One"');
    }
  });
});

describe("InterviewsService.cancel", () => {
  it("stores the reason, notifies in-app and e-mails the talent the reason", async () => {
    const cancel = jest.fn().mockResolvedValue({
      id: "intv-1",
      status: "CANCELLED",
      cancelReason: "The hiring manager is unavailable.",
      ...proposal,
      durationMinutes: 30,
    });
    const { service } = makeService({ cancel });

    const result = await service.cancel(parties, {
      reason: "The hiring manager is unavailable.",
    });
    await flushBackground();

    expect(cancel).toHaveBeenCalledWith(
      "app-1",
      "The hiring manager is unavailable.",
    );
    expect(result.status).toBe("CANCELLED");
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "talent-user-1",
        type: "INTERVIEW_CANCELLED",
        body: expect.stringContaining(
          "Reason: The hiring manager is unavailable.",
        ),
      }),
    );
    expect(emailService.sendInterviewCancelledEmail).toHaveBeenCalledWith(
      "talent@example.com",
      "Talent One",
      expect.objectContaining({ title: "Vòng 1 - Kỹ thuật" }),
      "The hiring manager is unavailable.",
    );
  });

  it("404s when there is nothing left to cancel", async () => {
    const { service } = makeService({
      cancel: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .cancel(parties, { reason: "No longer needed." })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect(emailService.sendInterviewCancelledEmail).not.toHaveBeenCalled();
  });
});

describe("InterviewsService.isComplete", () => {
  it("is false when there's no interview for the application", async () => {
    const { service } = makeService({
      findEligibilityByApplicationId: jest.fn().mockResolvedValue(null),
    });

    expect(await service.isComplete("app-1")).toBe(false);
  });

  it("is false while still PENDING", async () => {
    const { service } = makeService({
      findEligibilityByApplicationId: jest
        .fn()
        .mockResolvedValue({ status: "PENDING", confirmedSlot: null }),
    });

    expect(await service.isComplete("app-1")).toBe(false);
  });

  it("is false when CONFIRMED but the slot hasn't happened yet", async () => {
    const { service } = makeService({
      findEligibilityByApplicationId: jest.fn().mockResolvedValue({
        status: "CONFIRMED",
        confirmedSlot: futureSlot(),
      }),
    });

    expect(await service.isComplete("app-1")).toBe(false);
  });

  it("is true once CONFIRMED and the slot has passed", async () => {
    const { service } = makeService({
      findEligibilityByApplicationId: jest.fn().mockResolvedValue({
        status: "CONFIRMED",
        confirmedSlot: pastSlot(),
      }),
    });

    expect(await service.isComplete("app-1")).toBe(true);
  });
});

const upcomingRow = (overrides: Record<string, unknown> = {}) => ({
  id: "intv-1",
  title: null,
  applicationId: "app-1",
  confirmedSlot: futureSlot(),
  durationMinutes: 30,
  meetingUrl: null,
  interviewerId: "interviewer-1",
  interviewer: { name: "Interviewer One" },
  application: {
    talent: { user: { name: "Talent One" } },
    job: { title: "Backend Engineer" },
  },
  ...overrides,
});

describe("InterviewsService.listUpcomingForCompany", () => {
  it("passes no interviewerId filter (and returns scope-agnostic rows) for a non-INTERVIEWER role", async () => {
    const findUpcomingForCompany = jest.fn().mockResolvedValue([upcomingRow()]);
    const { service } = makeService({ findUpcomingForCompany });

    const result = await service.listUpcomingForCompany(
      "company-1",
      "RECRUITER",
      "viewer-1",
    );

    expect(findUpcomingForCompany).toHaveBeenCalledWith("company-1", undefined);
    expect(result).toEqual({
      scope: "team",
      interviews: [
        {
          id: "intv-1",
          title: null,
          applicationId: "app-1",
          confirmedSlot: expect.any(Date),
          durationMinutes: 30,
          meetingUrl: null,
          talentName: "Talent One",
          jobTitle: "Backend Engineer",
          interviewerId: "interviewer-1",
          interviewerName: "Interviewer One",
        },
      ],
    });
  });

  it("narrows to the viewer's own interviews and reports scope 'mine' for an INTERVIEWER role", async () => {
    const findUpcomingForCompany = jest.fn().mockResolvedValue([]);
    const { service } = makeService({ findUpcomingForCompany });

    const result = await service.listUpcomingForCompany(
      "company-1",
      "INTERVIEWER",
      "viewer-1",
    );

    expect(findUpcomingForCompany).toHaveBeenCalledWith(
      "company-1",
      "viewer-1",
    );
    expect(result.scope).toBe("mine");
  });

  it("flattens a row with no assigned interviewer", async () => {
    const { service } = makeService({
      findUpcomingForCompany: jest
        .fn()
        .mockResolvedValue([
          upcomingRow({ interviewerId: null, interviewer: null }),
        ]),
    });

    const { interviews } = await service.listUpcomingForCompany(
      "company-1",
      "OWNER",
      "viewer-1",
    );

    expect(interviews[0]?.interviewerId).toBeNull();
    expect(interviews[0]?.interviewerName).toBeNull();
  });
});

describe("InterviewsService.getIcsFile", () => {
  it("rejects when no interview has been proposed yet", async () => {
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue(null),
    });

    const error = await service.getIcsFile(parties).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect((error as NotFoundApiException).getResponse()).toMatchObject({
      code: ErrorCode.INTERVIEW_NOT_FOUND,
    });
  });

  it("rejects a PENDING (not yet confirmed) interview", async () => {
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue({
        id: "intv-1",
        status: "PENDING",
        confirmedSlot: null,
        durationMinutes: 30,
        meetingUrl: null,
      }),
    });

    const error = await service.getIcsFile(parties).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.INTERVIEW_NOT_CONFIRMED,
    });
  });

  it("generates an .ics file for a CONFIRMED interview with its confirmedSlot", async () => {
    const slot = futureSlot();
    const { service } = makeService({
      findByApplicationId: jest.fn().mockResolvedValue({
        id: "intv-1",
        status: "CONFIRMED",
        confirmedSlot: slot,
        durationMinutes: 30,
        meetingUrl: "https://meet.example.com/room",
      }),
    });

    const ics = await service.getIcsFile(parties);

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("interview-intv-1@remotesea.io");
    expect(ics).toContain(parties.job.title);
    expect(ics).toContain(parties.job.employer.companyName);
    // PB63 AC3: participants. Long lines are folded per RFC 5545 §3.1, so
    // compare against the unfolded text.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(
      'ORGANIZER;CN="Acme Inc":mailto:owner@acme.example',
    );
    expect(unfolded).toContain("mailto:talent@example.com");
    expect(unfolded).toContain("mailto:interviewer@acme.example");
  });
});
