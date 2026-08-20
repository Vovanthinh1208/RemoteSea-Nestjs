// Standalone by design: this only ever runs against a disposable local
// database (never the real DATABASE_URL — see README/CLAUDE.md for the
// live-Supabase warning), so it doesn't reuse any src/ app code. That avoids
// pulling `@/`-aliased imports through ts-node (which isn't configured with
// tsconfig-paths) and keeps this file runnable on its own with nothing but
// @prisma/client, bcrypt, and nanoid.
//
// Idempotency: this runs in two independently-gated phases rather than one
// blanket "already seeded?" check, because a database can legitimately be
// in a state where the base bulk data exists but the flagship scenario data
// (added later) doesn't yet — exactly what this database was in the first
// time this version ran. Skills/categories are cheap enough (~30 rows) to
// just upsert unconditionally every run.
//   Phase 1 (base bulk data — admin, companies, random talents/jobs/
//   applications): gated on ADMIN_EMAIL already existing.
//   Phase 2 (flagship scenario data — main company's multi-seat team, named
//   candidates, interviews, scorecards, messaging, notifications): gated
//   independently on candidate.strong@remotesea.dev already existing, and
//   always resolves the main/second company from the database rather than
//   from phase 1's in-memory arrays, so it works whether phase 1 ran in this
//   same invocation or ran (or was seeded some other way) long before.
// Neither phase upserts its own log-like rows (ApplicationStatusEvent,
// Message, Notification have no natural unique key) — once a phase's gate
// says "not yet run," it runs once, in full; that's the "idempotent when
// possible" this script aims for, not a row-by-row sync tool. To force a
// full reseed, wipe the database first (see the console output at the end
// of a run for the exact command).
import {
  PrismaClient,
  UserRole,
  JobType,
  ExperienceLevel,
  JobStatus,
  PlanType,
  ApplicationStatus,
  AlertFrequency,
  CompanyMemberRole,
  InterviewStatus,
  ScorecardRecommendation,
  NotificationType,
  ProfileHighlightType,
  TalentVerificationStatus,
  EmployerVerificationStatus,
  InvitationStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

// Every seeded user shares this password — a fixed, known credential is more
// useful for local testing than a unique one per row nobody will ever type in.
const SEED_PASSWORD = "Password123!";
const BCRYPT_SALT_ROUNDS = 12; // matches src/common/constants/bcrypt.constants.ts

const ADMIN_EMAIL = "admin@remotesea.dev";
const FLAGSHIP_MARKER_EMAIL = "candidate.strong@remotesea.dev";
const MAIN_COMPANY_OWNER_EMAIL = "employer1@remotesea.dev";
const SECOND_COMPANY_OWNER_EMAIL = "employer2@remotesea.dev";

// ─── Small helpers ──────────────────────────────────────────────────────────

const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const pick = <T>(arr: readonly T[]): T => {
  const item = arr[randomInt(0, arr.length - 1)];
  if (item === undefined) throw new Error("pick() called on an empty array");
  return item;
};

const shuffle = <T>(arr: readonly T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
};

const pickN = <T>(arr: readonly T[], min: number, max: number): T[] =>
  shuffle(arr).slice(0, Math.min(arr.length, randomInt(min, max)));

const maybe = (probability: number): boolean => Math.random() < probability;

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");

const uniqueSlug = (text: string): string => `${slugify(text)}-${nanoid(6)}`;

const daysAgo = (days: number): Date =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000);

// A Date `daysOffset` days from today (negative = past), pinned to a specific
// local hour — used for interview slots, since the Interview Agenda feature
// (grouping "Today"/"Tomorrow"/this week) reads calendar days off this exact
// value, not a relative duration.
const atHour = (daysOffset: number, hour: number, minute = 0): Date => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

// ─── Fixture data ─────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "An",
  "Binh",
  "Chi",
  "Dung",
  "Hoa",
  "Khanh",
  "Linh",
  "Minh",
  "Nam",
  "Phuong",
  "Quang",
  "Thao",
  "Trang",
  "Tuan",
  "Van",
  "Yen",
  "James",
  "Olivia",
  "Liam",
  "Emma",
  "Noah",
  "Ava",
  "Wei",
  "Siti",
];
const LAST_NAMES = [
  "Nguyen",
  "Tran",
  "Le",
  "Pham",
  "Hoang",
  "Vu",
  "Dang",
  "Bui",
  "Do",
  "Ho",
  "Smith",
  "Johnson",
  "Lee",
  "Tan",
  "Wong",
  "Rahman",
];

const COMPANY_NAMES = [
  "Mekong Digital",
  "Saigon Cloudworks",
  "Lotus Analytics",
  "Bamboo Labs",
  "Indochina Software",
  "Delta Payments",
  "Coral Bay Studio",
  "Pearl River Tech",
  "Everline Systems",
  "Northstar Robotics",
  "BluePeak Health",
  "Riverside Fintech",
  "Orchid Commerce",
  "Sunbelt Logistics",
  "Ironwood Security",
];

const CATEGORY_DEFS = [
  { name: "Engineering", icon: "💻" },
  { name: "Design", icon: "🎨" },
  { name: "Data", icon: "📊" },
  { name: "Product", icon: "🧭" },
  { name: "Marketing", icon: "📣" },
] as const;

const JOB_TITLES_BY_CATEGORY: Record<string, string[]> = {
  Engineering: [
    "Backend Engineer",
    "Frontend Developer",
    "Full-Stack Engineer",
    "Mobile Engineer (React Native)",
    "DevOps Engineer",
    "QA Automation Engineer",
    "Site Reliability Engineer",
  ],
  Design: [
    "Product Designer",
    "UX Researcher",
    "UI/Visual Designer",
    "Design Systems Lead",
  ],
  Data: [
    "Data Analyst",
    "Data Engineer",
    "Machine Learning Engineer",
    "Business Intelligence Analyst",
  ],
  Product: [
    "Product Manager",
    "Technical Program Manager",
    "Product Owner",
    "Growth Product Manager",
  ],
  Marketing: [
    "Content Marketing Manager",
    "Performance Marketing Specialist",
    "SEO Specialist",
    "Marketing Operations Manager",
  ],
};

const SKILL_NAMES = [
  "TypeScript",
  "JavaScript",
  "Node.js",
  "NestJS",
  "React",
  "Next.js",
  "PostgreSQL",
  "Prisma",
  "Docker",
  "Kubernetes",
  "AWS",
  "GraphQL",
  "Python",
  "Go",
  "Figma",
  "User Research",
  "SQL",
  "Data Visualization",
  "Machine Learning",
  "Product Strategy",
  "Agile/Scrum",
  "SEO",
  "Content Strategy",
  "Google Analytics",
];

const BACKEND_SKILLS = [
  "TypeScript",
  "Node.js",
  "NestJS",
  "PostgreSQL",
  "Prisma",
  "Docker",
  "AWS",
];

const COUNTRIES = [
  "Vietnam",
  "Singapore",
  "Indonesia",
  "Philippines",
  "Malaysia",
  "Thailand",
  "Australia",
  "United States",
];

const TIMEZONES = ["UTC+7", "UTC+8", "Async / anywhere", "UTC+10", "UTC-5"];

const PAST_EMPLOYERS = [
  "Grabtaxi Holdings",
  "Tiki Corporation",
  "VNG Corporation",
  "Shopee",
  "Sea Limited",
  "FPT Software",
  "Zalo",
  "Traveloka",
  "Gojek",
  "Sendo",
];

const UNIVERSITIES = [
  "Vietnam National University",
  "Ho Chi Minh City University of Technology",
  "National University of Singapore",
  "University of the Philippines",
  "Hanoi University of Science and Technology",
  "Universiti Malaya",
];

const DEGREES = [
  "B.Sc. Computer Science",
  "B.Eng. Software Engineering",
  "B.A. Design",
  "B.Sc. Information Systems",
  "M.Sc. Data Science",
];

const LANGUAGES: { name: string; level: string }[] = [
  { name: "English", level: "Fluent" },
  { name: "Vietnamese", level: "Native" },
  { name: "Mandarin", level: "Conversational" },
  { name: "Japanese", level: "Basic" },
];

const JOB_TYPES = Object.values(JobType);
const EXPERIENCE_LEVELS = Object.values(ExperienceLevel);

const EMPLOYER_COUNT = 15;
const TALENT_COUNT = 40;

function jobDescription(
  title: string,
  company: string,
): {
  description: string;
  requirements: string;
  responsibilities: string;
} {
  return {
    description: `${company} is hiring a ${title} to join our remote-first team. You'll work closely with a small, senior team shipping features used across Southeast Asia.`,
    requirements:
      "3+ years of relevant experience, strong communication skills, comfortable working async across timezones.",
    responsibilities:
      "Own features end to end, collaborate with design/product, participate in on-call rotation.",
  };
}

type TalentRef = { id: string; userId: string; name: string };
type EmployerRef = {
  id: string;
  userId: string;
  companyName: string;
  ownerUserId: string;
};

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_SALT_ROUNDS);

  // ─── Skills & categories — always upserted, needed by both phases below
  // regardless of which have already run. ──────────────────────────────
  const skills = await Promise.all(
    SKILL_NAMES.map((name) =>
      prisma.skill.upsert({
        where: { name },
        update: {},
        create: { name, slug: slugify(name) },
      }),
    ),
  );
  const backendSkills = skills.filter((s) => BACKEND_SKILLS.includes(s.name));
  const categories = await Promise.all(
    CATEGORY_DEFS.map(({ name, icon }) =>
      prisma.category.upsert({
        where: { name },
        update: {},
        create: { name, slug: slugify(name), icon },
      }),
    ),
  );
  const engineeringCategory = categories.find(
    (c) => c.name === "Engineering",
  )!;

  // ─── Shared helpers (used by both phases) ──────────────────────────────
  const createTalent = async (
    email: string,
    name: string,
    opts: { level?: ExperienceLevel; headline?: string } = {},
  ): Promise<TalentRef> => {
    const level = opts.level ?? pick(EXPERIENCE_LEVELS);
    const user = await prisma.user.create({
      data: { email, name, passwordHash, role: UserRole.TALENT },
    });
    const isVerified = maybe(0.3);
    const profile = await prisma.talentProfile.create({
      data: {
        userId: user.id,
        slug: uniqueSlug(name),
        headline:
          opts.headline ??
          `${level.charAt(0) + level.slice(1).toLowerCase()} ${pick(
            Object.values(JOB_TITLES_BY_CATEGORY).flat(),
          )}`,
        bio: `${name} is a remote professional based in Southeast Asia with a track record of shipping product across distributed teams.`,
        location: pick(["Ho Chi Minh City", "Hanoi", "Da Nang", "Remote"]),
        country: pick(COUNTRIES),
        timezone: pick(TIMEZONES),
        yearsExperience: randomInt(1, 15),
        level,
        resumeUrl: maybe(0.7)
          ? `https://example.com/resumes/${user.id}.pdf`
          : null,
        portfolioUrl: maybe(0.4)
          ? `https://example.com/portfolio/${user.id}`
          : null,
        githubUrl: maybe(0.5) ? `https://github.com/${slugify(name)}` : null,
        linkedinUrl: maybe(0.5)
          ? `https://linkedin.com/in/${slugify(name)}`
          : null,
        isOpenToWork: maybe(0.8),
        desiredSalaryMin: randomInt(500, 2000),
        desiredSalaryMax: randomInt(2500, 8000),
        isVerified,
        verifiedAt: isVerified ? daysAgo(randomInt(5, 200)) : null,
        verificationStatus: isVerified
          ? TalentVerificationStatus.VERIFIED
          : TalentVerificationStatus.NOT_SUBMITTED,
      },
    });

    await prisma.talentSkill.createMany({
      data: pickN(skills, 2, 5).map((skill) => ({
        talentId: profile.id,
        skillId: skill.id,
        yearsExp: randomInt(1, 8),
      })),
    });

    return { id: profile.id, userId: user.id, name };
  };

  // Deeper profile data (work experience, education, languages) applied to a
  // realistic subset — every talent having 3+ of each would be repetitive
  // rather than "realistic."
  const enrichTalentProfile = async (talent: TalentRef): Promise<void> => {
    const roleTitle = pick(Object.values(JOB_TITLES_BY_CATEGORY).flat());
    const jobs = randomInt(1, 3);
    let cursor = randomInt(1, 4); // years ago the earliest role started
    for (let i = 0; i < jobs; i += 1) {
      const isCurrent = i === jobs - 1 && maybe(0.6);
      const startYearsAgo = cursor + randomInt(1, 3);
      const endYearsAgo = isCurrent ? 0 : cursor;
      cursor = startYearsAgo;
      await prisma.workExperience.create({
        data: {
          talentId: talent.id,
          company: pick(PAST_EMPLOYERS),
          title:
            i === jobs - 1
              ? roleTitle
              : pick(Object.values(JOB_TITLES_BY_CATEGORY).flat()),
          location: pick(["Ho Chi Minh City", "Hanoi", "Remote", "Singapore"]),
          startDate: daysAgo(startYearsAgo * 365),
          endDate: isCurrent ? null : daysAgo(endYearsAgo * 365),
          description:
            "Shipped features end to end in a small cross-functional team, working async across timezones.",
        },
      });
    }

    await prisma.profileHighlight.create({
      data: {
        talentId: talent.id,
        type: ProfileHighlightType.EDUCATION,
        title: pick(UNIVERSITIES),
        subtitle: pick(DEGREES),
        startYear: 2012 + randomInt(0, 6),
        endYear: 2016 + randomInt(0, 6),
      },
    });

    for (const lang of pickN(LANGUAGES, 1, 3)) {
      await prisma.profileHighlight.create({
        data: {
          talentId: talent.id,
          type: ProfileHighlightType.LANGUAGE,
          title: lang.name,
          subtitle: lang.level,
        },
      });
    }

    if (maybe(0.4)) {
      await prisma.profileHighlight.create({
        data: {
          talentId: talent.id,
          type: ProfileHighlightType.PORTFOLIO,
          title: pick([
            "Analytics Dashboard",
            "Checkout Redesign",
            "Internal Tooling",
            "Mobile Onboarding",
          ]),
          subtitle: `${roleTitle} · ${randomInt(2, 8)} months`,
          description:
            "Led design and delivery from spec to launch, partnering closely with engineering and product.",
          tag: pick(["Product · Production", "Side project", "Client work"]),
          url: `https://example.com/work/${nanoid(8)}`,
        },
      });
    }
  };

  // A running total of applications per job, updated across whichever
  // phases actually run this invocation, flushed to Job.applyCount once at
  // the end.
  const applyCountByJob = new Map<string, number>();

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 1 — base bulk data: admin, companies (+ OWNER seat backfill),
  // random talent pool, random jobs, random applications, saved jobs, job
  // alerts. Gated on ADMIN_EMAIL already existing.
  // ══════════════════════════════════════════════════════════════════════
  const adminExists = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (!adminExists) {
    // ─── USERS — admin ────────────────────────────────────────────────
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: "Admin User",
        passwordHash,
        role: UserRole.ADMIN,
      },
    });

    // ─── COMPANIES — EmployerProfile per employer. Index 0 ("Mekong
    // Digital") is the flagship "main company" used for phase 2's
    // multi-seat/interview/scorecard scenarios; the rest are single-owner
    // companies, same as production's common case. ─────────────────────
    const employers: EmployerRef[] = [];
    for (let i = 0; i < EMPLOYER_COUNT; i += 1) {
      const companyName = COMPANY_NAMES[i % COMPANY_NAMES.length]!;
      const isMainCompany = i === 0;
      const ownerName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

      const user = await prisma.user.create({
        data: {
          email: `employer${i + 1}@remotesea.dev`,
          name: ownerName,
          passwordHash,
          role: UserRole.EMPLOYER,
        },
      });
      const profile = await prisma.employerProfile.create({
        data: {
          userId: user.id,
          companyName,
          slug: uniqueSlug(companyName),
          websiteUrl: `https://${slugify(companyName)}.example.com`,
          description: isMainCompany
            ? "Mekong Digital builds remote-hiring infrastructure for fast-growing Southeast Asian startups — think ATS, payroll, and compliance tooling for distributed teams."
            : `${companyName} builds remote-friendly products for teams across Southeast Asia.`,
          industry: pick([
            "Software",
            "Fintech",
            "E-commerce",
            "Healthtech",
            "Gaming",
            "Logistics",
          ]),
          size: pick(["1-10", "11-50", "51-200", "201-500"]),
          founded: randomInt(2008, 2023),
          hqCountry: pick(COUNTRIES),
          hqCity: pick(["Ho Chi Minh City", "Hanoi", "Singapore", "Jakarta"]),
          isVerified: isMainCompany || maybe(0.6),
          verifiedAt: isMainCompany ? daysAgo(120) : undefined,
          verificationStatus: isMainCompany
            ? EmployerVerificationStatus.VERIFIED
            : EmployerVerificationStatus.NOT_SUBMITTED,
        },
      });
      employers.push({
        id: profile.id,
        userId: user.id,
        companyName,
        ownerUserId: user.id,
      });
    }

    // ─── MEMBERSHIPS — every EmployerProfile's creator gets an OWNER seat.
    // This mirrors the real add_company_members migration's backfill:
    // authorization reads CompanyMember exclusively, so a creator with no
    // seat can't access their own employer/* endpoints. ─────────────────
    await Promise.all(
      employers.map((employer) =>
        prisma.companyMember.create({
          data: {
            userId: employer.ownerUserId,
            employerId: employer.id,
            role: CompanyMemberRole.OWNER,
          },
        }),
      ),
    );

    // ─── USERS — talents (random pool) + PROFILE DATA for a realistic
    // subset ─────────────────────────────────────────────────────────
    const talents: TalentRef[] = [];
    for (let i = 0; i < TALENT_COUNT; i += 1) {
      const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      const talent = await createTalent(`talent${i + 1}@remotesea.dev`, name);
      talents.push(talent);
      if (i < 20) await enrichTalentProfile(talent);
    }

    // ─── JOBS — random variety per employer ────────────────────────────
    const jobIds: { id: string; status: JobStatus }[] = [];
    for (const employer of employers) {
      const jobCount = randomInt(3, 8);
      for (let i = 0; i < jobCount; i += 1) {
        const category = pick(CATEGORY_DEFS);
        const title = pick(JOB_TITLES_BY_CATEGORY[category.name]!);
        const status = pick([
          JobStatus.ACTIVE,
          JobStatus.ACTIVE,
          JobStatus.ACTIVE,
          JobStatus.PENDING_REVIEW,
          JobStatus.DRAFT,
          JobStatus.CLOSED,
          JobStatus.REJECTED,
        ]);
        const isPublished =
          status === JobStatus.ACTIVE || status === JobStatus.CLOSED;
        const salaryMin = randomInt(600, 3000);
        const { description, requirements, responsibilities } =
          jobDescription(title, employer.companyName);

        const job = await prisma.job.create({
          data: {
            employerId: employer.id,
            title,
            slug: uniqueSlug(title),
            description,
            requirements,
            responsibilities,
            jobType: pick(JOB_TYPES),
            level: pick(EXPERIENCE_LEVELS),
            salaryMin,
            salaryMax: salaryMin + randomInt(300, 3000),
            isRemote: true,
            timezone: pick(TIMEZONES),
            country: pick(COUNTRIES),
            status,
            planType: pick([
              PlanType.STANDARD,
              PlanType.STANDARD,
              PlanType.FEATURED,
              PlanType.HANDS_ON,
            ]),
            planPaid: maybe(0.5),
            benefits: pickN(
              [
                "Remote-first",
                "Flexible hours",
                "Health insurance",
                "Annual retreat",
                "Learning budget",
                "Equipment allowance",
              ],
              1,
              4,
            ),
            isFeatured: status === JobStatus.ACTIVE && maybe(0.15),
            viewCount: isPublished ? randomInt(0, 500) : 0,
            publishedAt: isPublished ? daysAgo(randomInt(1, 90)) : null,
            expiresAt:
              status === JobStatus.ACTIVE
                ? daysFromNow(randomInt(10, 60))
                : null,
          },
        });

        await prisma.jobCategory.create({
          data: {
            jobId: job.id,
            categoryId: categories.find((c) => c.name === category.name)!.id,
          },
        });
        if (maybe(0.3)) {
          const other = pick(
            categories.filter((c) => c.name !== category.name),
          );
          await prisma.jobCategory.create({
            data: { jobId: job.id, categoryId: other.id },
          });
        }

        await prisma.jobSkill.createMany({
          data: pickN(skills, 2, 6).map((skill) => ({
            jobId: job.id,
            skillId: skill.id,
            isRequired: maybe(0.7),
          })),
        });

        jobIds.push({ id: job.id, status });
      }
    }

    // ─── APPLICATIONS — random pipeline coverage across all statuses,
    // plus each application's own status-event trail (PENDING at apply
    // time, and one more event if it has since moved on). ──────────────
    const applicationStatuses = Object.values(ApplicationStatus);
    const createApplicationWithTrail = async (
      jobId: string,
      talentId: string,
      status: ApplicationStatus,
      appliedAt: Date,
    ) => {
      const application = await prisma.application.create({
        data: {
          jobId,
          talentId,
          coverLetter: maybe(0.6)
            ? "I'd love to bring my remote-work experience to this role — happy to share references on request."
            : null,
          resumeUrl: maybe(0.5)
            ? `https://example.com/resumes/${talentId}.pdf`
            : null,
          status,
          appliedAt,
          viewedAt:
            status !== ApplicationStatus.PENDING
              ? daysAgo(randomInt(0, 5))
              : null,
        },
      });
      await prisma.applicationStatusEvent.create({
        data: {
          applicationId: application.id,
          status: ApplicationStatus.PENDING,
          createdAt: appliedAt,
        },
      });
      if (status !== ApplicationStatus.PENDING) {
        await prisma.applicationStatusEvent.create({
          data: {
            applicationId: application.id,
            status,
            createdAt: new Date(
              appliedAt.getTime() + randomInt(1, 5) * 86_400_000,
            ),
          },
        });
      }
      applyCountByJob.set(jobId, (applyCountByJob.get(jobId) ?? 0) + 1);
      return application;
    };

    const applicableJobs = jobIds.filter(
      (j) => j.status === JobStatus.ACTIVE || j.status === JobStatus.CLOSED,
    );
    for (const job of applicableJobs) {
      if (!maybe(0.7)) continue;
      for (const talent of pickN(talents, 0, 8)) {
        await createApplicationWithTrail(
          job.id,
          talent.id,
          pick(applicationStatuses),
          daysAgo(randomInt(1, 60)),
        );
      }
    }

    // ─── Saved jobs & job alerts ────────────────────────────────────────
    for (const talent of pickN(talents, 15, 25)) {
      const saved = pickN(
        jobIds.filter((j) => j.status === JobStatus.ACTIVE),
        1,
        5,
      );
      for (const job of saved) {
        await prisma.savedJob
          .create({ data: { userId: talent.userId, jobId: job.id } })
          .catch(() => undefined); // unique[userId, jobId] — a rare repeat pick is a harmless no-op
      }
    }

    for (const talent of pickN(talents, 10, 18)) {
      const alert = await prisma.jobAlert.create({
        data: {
          userId: talent.userId,
          name: `${pick(["Backend", "Design", "Data", "Product", "Marketing"])} roles`,
          keywords: maybe(0.5) ? pick(SKILL_NAMES) : null,
          jobType: maybe(0.4) ? pick(JOB_TYPES) : null,
          level: maybe(0.4) ? pick(EXPERIENCE_LEVELS) : null,
          salaryMin: maybe(0.3) ? randomInt(1000, 3000) : null,
          country: maybe(0.3) ? pick(COUNTRIES) : null,
          frequency: pick(Object.values(AlertFrequency)),
          isActive: maybe(0.85),
        },
      });

      for (const category of pickN(categories, 0, 3)) {
        await prisma.alertCategory.create({
          data: { alertId: alert.id, categoryId: category.id },
        });
      }
    }

    console.log(
      `Phase 1 done: ${employers.length} companies, ${talents.length} talents, ${jobIds.length} jobs.`,
    );
  } else {
    console.log(
      `Phase 1 skipped — base bulk data already present (found ${ADMIN_EMAIL}).`,
    );
  }

  // Always resolve the main/second company from the database — works
  // whether phase 1 just created them in this same run, or they (and
  // everything since) already existed from a previous run.
  const mainCompanyUser = await prisma.user.findUniqueOrThrow({
    where: { email: MAIN_COMPANY_OWNER_EMAIL },
    include: { employer: true },
  });
  const secondCompanyUser = await prisma.user.findUniqueOrThrow({
    where: { email: SECOND_COMPANY_OWNER_EMAIL },
    include: { employer: true },
  });
  const mainCompany: EmployerRef = {
    id: mainCompanyUser.employer!.id,
    userId: mainCompanyUser.id,
    companyName: mainCompanyUser.employer!.companyName,
    ownerUserId: mainCompanyUser.id,
  };
  const secondCompany: EmployerRef = {
    id: secondCompanyUser.employer!.id,
    userId: secondCompanyUser.id,
    companyName: secondCompanyUser.employer!.companyName,
    ownerUserId: secondCompanyUser.id,
  };
  const ownerUser = {
    id: mainCompanyUser.id,
    name: mainCompanyUser.name ?? "Company owner",
  };

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 2 — flagship scenario data: main company's multi-seat team, one
  // guaranteed-ACTIVE job, named candidates covering the interview-agenda
  // and scorecard-summary test scenarios. Gated independently of phase 1 on
  // FLAGSHIP_MARKER_EMAIL already existing.
  // ══════════════════════════════════════════════════════════════════════
  const scenarioExists = await prisma.user.findUnique({
    where: { email: FLAGSHIP_MARKER_EMAIL },
  });

  if (!scenarioExists) {
    // ─── MEMBERSHIPS — main company gets a full RECRUITER/HIRING_MANAGER/
    // INTERVIEWER×2 team; the second company gets one extra RECRUITER for
    // lighter multi-seat coverage. ──────────────────────────────────────
    const createTeamMember = async (
      employerId: string,
      email: string,
      name: string,
      role: CompanyMemberRole,
    ) => {
      const user = await prisma.user.create({
        data: { email, name, passwordHash, role: UserRole.EMPLOYER },
      });
      await prisma.companyMember.create({
        data: { userId: user.id, employerId, role },
      });
      return user;
    };

    const recruiterUser = await createTeamMember(
      mainCompany.id,
      "recruiter1@remotesea.dev",
      "Thu Le",
      CompanyMemberRole.RECRUITER,
    );
    const hiringManagerUser = await createTeamMember(
      mainCompany.id,
      "hiringmanager1@remotesea.dev",
      "Duc Pham",
      CompanyMemberRole.HIRING_MANAGER,
    );
    const interviewer1User = await createTeamMember(
      mainCompany.id,
      "interviewer1@remotesea.dev",
      "Linh Vu",
      CompanyMemberRole.INTERVIEWER,
    );
    const interviewer2User = await createTeamMember(
      mainCompany.id,
      "interviewer2@remotesea.dev",
      "Khanh Hoang",
      CompanyMemberRole.INTERVIEWER,
    );
    await createTeamMember(
      secondCompany.id,
      "recruiter2@remotesea.dev",
      "Yen Dang",
      CompanyMemberRole.RECRUITER,
    );

    // ─── Named scenario candidates — fixed identities so the
    // interview-agenda and scorecard-summary test scenarios below are
    // deterministic and memorable, not buried in a random pool. ────────
    const candidateStrong = await createTalent(
      FLAGSHIP_MARKER_EMAIL,
      "Mai Nguyen",
      { level: ExperienceLevel.SENIOR, headline: "Senior Backend Engineer" },
    );
    const candidateMixed = await createTalent(
      "candidate.mixed@remotesea.dev",
      "Khoa Tran",
      { level: ExperienceLevel.MID, headline: "Backend Engineer" },
    );
    const candidateRejected = await createTalent(
      "candidate.rejected@remotesea.dev",
      "Duy Le",
      { level: ExperienceLevel.MID, headline: "Backend Engineer" },
    );
    const candidateFullPanel = await createTalent(
      "candidate.fullpanel@remotesea.dev",
      "Huyen Pham",
      { level: ExperienceLevel.SENIOR, headline: "Senior Backend Engineer" },
    );
    const upcomingCandidateNames: [string, string][] = [
      ["upcoming1@remotesea.dev", "Anh Vo"],
      ["upcoming2@remotesea.dev", "Bao Dinh"],
      ["upcoming3@remotesea.dev", "Chau Ly"],
      ["upcoming4@remotesea.dev", "Dat Truong"],
      ["upcoming5@remotesea.dev", "Giang Mai"],
      ["upcoming6@remotesea.dev", "Hai Doan"],
    ];
    const upcomingCandidates: TalentRef[] = [];
    for (const [email, name] of upcomingCandidateNames) {
      upcomingCandidates.push(
        await createTalent(email, name, {
          level: ExperienceLevel.MID,
          headline: "Backend Engineer",
        }),
      );
    }
    const invitedTalent = await createTalent(
      "invited.candidate@remotesea.dev",
      "Trang Bui",
      { level: ExperienceLevel.MID, headline: "Backend Engineer" },
    );
    for (const talent of [
      candidateStrong,
      candidateMixed,
      candidateRejected,
      candidateFullPanel,
      ...upcomingCandidates,
      invitedTalent,
    ]) {
      await enrichTalentProfile(talent);
    }

    // ─── JOBS — one guaranteed-ACTIVE, fully-fleshed-out flagship role
    // that every named candidate above applies to. ─────────────────────
    const flagshipJob = await prisma.job.create({
      data: {
        employerId: mainCompany.id,
        title: "Senior Backend Engineer",
        slug: uniqueSlug("Senior Backend Engineer Mekong Digital"),
        description:
          "Mekong Digital is hiring a Senior Backend Engineer to own our core hiring-platform APIs (NestJS + Prisma + Postgres). You'll work directly with our founding engineers on a small, senior remote team.",
        requirements:
          "5+ years building production backend systems, strong TypeScript/Node.js, comfortable owning a service end to end.",
        responsibilities:
          "Design and ship API features, mentor junior engineers, participate in interviews and on-call rotation.",
        jobType: JobType.FULL_TIME,
        level: ExperienceLevel.SENIOR,
        salaryMin: 2800,
        salaryMax: 4500,
        isRemote: true,
        timezone: "UTC+7",
        country: "Vietnam",
        status: JobStatus.ACTIVE,
        planType: PlanType.FEATURED,
        planPaid: true,
        paidAt: daysAgo(20),
        isFeatured: true,
        benefits: [
          "Remote-first",
          "Health insurance",
          "Learning budget",
          "Annual retreat",
        ],
        viewCount: randomInt(200, 900),
        publishedAt: daysAgo(18),
        expiresAt: daysFromNow(42),
      },
    });
    await prisma.jobCategory.create({
      data: { jobId: flagshipJob.id, categoryId: engineeringCategory.id },
    });
    await prisma.jobSkill.createMany({
      data: backendSkills.map((skill, i) => ({
        jobId: flagshipJob.id,
        skillId: skill.id,
        isRequired: i < 4,
      })),
    });

    // ─── APPLICATIONS — a fuller, more realistic multi-step trail for
    // the flagship demo candidates than the random pool gets, since
    // these are the records a reviewer will actually click into. ───────
    const createScenarioApplication = async (
      talentId: string,
      finalStatus: ApplicationStatus,
      appliedDaysAgo: number,
    ) => {
      const appliedAt = daysAgo(appliedDaysAgo);
      const application = await prisma.application.create({
        data: {
          jobId: flagshipJob.id,
          talentId,
          coverLetter:
            "I've spent the last few years building backend systems for remote-first teams and would love to bring that experience to Mekong Digital.",
          resumeUrl: `https://example.com/resumes/${talentId}.pdf`,
          status: finalStatus,
          appliedAt,
          viewedAt: daysAgo(appliedDaysAgo - 1),
        },
      });
      const pipeline: ApplicationStatus[] = [
        ApplicationStatus.PENDING,
        ApplicationStatus.REVIEWING,
        ApplicationStatus.SHORTLISTED,
        ApplicationStatus.INTERVIEW,
      ];
      if (
        finalStatus === ApplicationStatus.OFFERED ||
        finalStatus === ApplicationStatus.REJECTED
      ) {
        pipeline.push(finalStatus);
      }
      let cursor = appliedAt.getTime();
      for (const status of pipeline) {
        await prisma.applicationStatusEvent.create({
          data: {
            applicationId: application.id,
            status,
            createdAt: new Date(cursor),
          },
        });
        cursor += randomInt(1, 3) * 86_400_000;
      }
      applyCountByJob.set(
        flagshipJob.id,
        (applyCountByJob.get(flagshipJob.id) ?? 0) + 1,
      );
      return application;
    };

    const appStrong = await createScenarioApplication(
      candidateStrong.id,
      ApplicationStatus.OFFERED,
      14,
    );
    const appMixed = await createScenarioApplication(
      candidateMixed.id,
      ApplicationStatus.INTERVIEW,
      10,
    );
    const appRejected = await createScenarioApplication(
      candidateRejected.id,
      ApplicationStatus.REJECTED,
      16,
    );
    const appFullPanel = await createScenarioApplication(
      candidateFullPanel.id,
      ApplicationStatus.INTERVIEW,
      9,
    );
    const upcomingApps: { application: { id: string }; talent: TalentRef }[] =
      [];
    for (const talent of upcomingCandidates) {
      const application = await createScenarioApplication(
        talent.id,
        ApplicationStatus.INTERVIEW,
        randomInt(3, 7),
      );
      upcomingApps.push({ application, talent });
    }

    // ─── INTERVIEWS — completed (past, feeding the scorecard scenarios
    // below) and upcoming (feeding the Interview Agenda scenarios: today,
    // tomorrow, later this week, spread across two different interviewers
    // plus other roles, since any company member — not just role
    // INTERVIEWER — can be assigned). ───────────────────────────────────
    await prisma.interview.create({
      data: {
        applicationId: appStrong.id,
        durationMinutes: 45,
        proposedSlots: [atHour(-6, 14), atHour(-6, 16)],
        confirmedSlot: atHour(-5, 14),
        meetingUrl: "https://meet.google.com/mek-strong-01",
        status: InterviewStatus.CONFIRMED,
        interviewerId: interviewer1User.id,
      },
    });
    await prisma.interview.create({
      data: {
        applicationId: appMixed.id,
        durationMinutes: 30,
        proposedSlots: [atHour(-4, 10), atHour(-4, 13)],
        confirmedSlot: atHour(-3, 10),
        meetingUrl: "https://meet.google.com/mek-mixed-01",
        status: InterviewStatus.CONFIRMED,
        interviewerId: interviewer2User.id,
      },
    });
    await prisma.interview.create({
      data: {
        applicationId: appRejected.id,
        durationMinutes: 30,
        proposedSlots: [atHour(-8, 15)],
        confirmedSlot: atHour(-7, 15),
        meetingUrl: "https://meet.google.com/mek-reject-01",
        status: InterviewStatus.CONFIRMED,
        interviewerId: interviewer1User.id,
      },
    });
    await prisma.interview.create({
      data: {
        applicationId: appFullPanel.id,
        durationMinutes: 60,
        proposedSlots: [atHour(-3, 11), atHour(-3, 15)],
        confirmedSlot: atHour(-2, 11),
        meetingUrl: "https://meet.google.com/mek-panel-01",
        status: InterviewStatus.CONFIRMED,
        interviewerId: interviewer2User.id,
      },
    });

    // Upcoming — 2 today, 2 tomorrow, 2 later this week, alternating
    // between interviewer1/interviewer2/hiringManager/owner as assignee.
    const upcomingSlots: {
      daysOffset: number;
      hour: number;
      interviewerId: string;
    }[] = [
      { daysOffset: 0, hour: 10, interviewerId: interviewer1User.id },
      { daysOffset: 0, hour: 15, interviewerId: interviewer2User.id },
      { daysOffset: 1, hour: 9, interviewerId: interviewer1User.id },
      { daysOffset: 1, hour: 14, interviewerId: hiringManagerUser.id },
      { daysOffset: 4, hour: 11, interviewerId: interviewer2User.id },
      { daysOffset: 6, hour: 13, interviewerId: ownerUser.id },
    ];
    for (let i = 0; i < upcomingApps.length; i += 1) {
      const { application } = upcomingApps[i]!;
      const slot = upcomingSlots[i]!;
      await prisma.interview.create({
        data: {
          applicationId: application.id,
          durationMinutes: pick([30, 45, 60]),
          proposedSlots: [atHour(slot.daysOffset, slot.hour)],
          confirmedSlot: atHour(slot.daysOffset, slot.hour),
          meetingUrl: `https://meet.google.com/mek-upcoming-${i + 1}`,
          status: InterviewStatus.CONFIRMED,
          interviewerId: slot.interviewerId,
        },
      });
    }

    // One still-PENDING interview (proposed, not yet confirmed) for
    // status variety, on a randomly generated (non-flagship) INTERVIEW-
    // stage application if one exists.
    const pendingCandidateApp = await prisma.application.findFirst({
      where: {
        status: ApplicationStatus.INTERVIEW,
        jobId: { not: flagshipJob.id },
        interview: null,
      },
    });
    if (pendingCandidateApp) {
      await prisma.interview.create({
        data: {
          applicationId: pendingCandidateApp.id,
          durationMinutes: 30,
          proposedSlots: [daysFromNow(2), daysFromNow(3)],
          status: InterviewStatus.PENDING,
        },
      });
    }

    // ─── SCORECARDS — the three named recommendation-mix scenarios plus
    // a full-panel "4/4 submitted" example. APPLICATION_REVIEW_ROLES
    // (OWNER/RECRUITER/HIRING_MANAGER) always have access; an INTERVIEWER
    // only has access on an application they're the assigned interviewer
    // for — the author sets below respect that exactly as the real
    // authorization would. ──────────────────────────────────────────────
    // Strong candidate: 3/4 recommend hire.
    await prisma.interviewScorecard.createMany({
      data: [
        {
          applicationId: appStrong.id,
          authorId: ownerUser.id,
          recommendation: ScorecardRecommendation.STRONG_YES,
          note: "Excellent system-design answers, clearly senior-level. Easy yes.",
        },
        {
          applicationId: appStrong.id,
          authorId: recruiterUser.id,
          recommendation: ScorecardRecommendation.YES,
          note: "Strong communicator, salary expectations line up with our range.",
        },
        {
          applicationId: appStrong.id,
          authorId: hiringManagerUser.id,
          recommendation: ScorecardRecommendation.YES,
          note: "Would slot straight into the platform team. Move to offer.",
        },
        {
          applicationId: appStrong.id,
          authorId: interviewer1User.id,
          recommendation: ScorecardRecommendation.NO,
          note: "Solid fundamentals but light on distributed-systems experience for this scope.",
        },
      ],
    });

    // Mixed candidate: 2/3 submitted recommend hire, interviewer2 (the
    // assigned interviewer) hasn't submitted yet — a genuinely pending review.
    await prisma.interviewScorecard.createMany({
      data: [
        {
          applicationId: appMixed.id,
          authorId: ownerUser.id,
          recommendation: ScorecardRecommendation.YES,
          note: "Good culture fit, asked sharp questions about our roadmap.",
        },
        {
          applicationId: appMixed.id,
          authorId: recruiterUser.id,
          recommendation: ScorecardRecommendation.YES,
          note: "Very responsive throughout the process, clearly motivated.",
        },
        {
          applicationId: appMixed.id,
          authorId: hiringManagerUser.id,
          recommendation: ScorecardRecommendation.NO,
          note: "Struggled with the debugging exercise — would want a second technical round.",
        },
      ],
    });

    // Rejected candidate: mostly NO/STRONG_NO.
    await prisma.interviewScorecard.createMany({
      data: [
        {
          applicationId: appRejected.id,
          authorId: ownerUser.id,
          recommendation: ScorecardRecommendation.NO,
          note: "Didn't demonstrate ownership in past projects, mostly reactive work.",
        },
        {
          applicationId: appRejected.id,
          authorId: recruiterUser.id,
          recommendation: ScorecardRecommendation.STRONG_NO,
          note: "Missed the technical bar by a wide margin in the live-coding round.",
        },
        {
          applicationId: appRejected.id,
          authorId: hiringManagerUser.id,
          recommendation: ScorecardRecommendation.NO,
          note: "Not ready for the senior scope of this role today.",
        },
      ],
    });

    // Full-panel candidate: 4/4 submitted, strong consensus to hire.
    await prisma.interviewScorecard.createMany({
      data: [
        {
          applicationId: appFullPanel.id,
          authorId: ownerUser.id,
          recommendation: ScorecardRecommendation.STRONG_YES,
          note: "Best candidate we've seen for this role. Fast-track the offer.",
        },
        {
          applicationId: appFullPanel.id,
          authorId: recruiterUser.id,
          recommendation: ScorecardRecommendation.YES,
          note: "Enthusiastic, negotiable on comp, ready to start within 2 weeks.",
        },
        {
          applicationId: appFullPanel.id,
          authorId: hiringManagerUser.id,
          recommendation: ScorecardRecommendation.YES,
          note: "Would be a strong mentor for our two junior engineers.",
        },
        {
          applicationId: appFullPanel.id,
          authorId: interviewer2User.id,
          recommendation: ScorecardRecommendation.YES,
          note: "Handled the system-design round confidently, good tradeoff reasoning.",
        },
      ],
    });

    // ─── MESSAGING — a few threads (1:1 per application) with realistic
    // back-and-forth, each paired with a MESSAGE_RECEIVED notification so
    // both read and unread states exist (Message itself has no readAt
    // column — unread signaling lives entirely in Notification, same as
    // production). ──────────────────────────────────────────────────────
    const sendMessage = async (
      applicationId: string,
      senderId: string,
      recipientId: string,
      body: string,
      createdAt: Date,
      recipientHasRead: boolean,
    ) => {
      await prisma.message.create({
        data: { applicationId, senderId, body, createdAt },
      });
      await prisma.notification.create({
        data: {
          userId: recipientId,
          type: NotificationType.MESSAGE_RECEIVED,
          title: "New message",
          body: body.length > 80 ? `${body.slice(0, 77)}...` : body,
          link: `/applications/${applicationId}/messages`,
          readAt: recipientHasRead
            ? new Date(createdAt.getTime() + 3_600_000)
            : null,
          createdAt,
        },
      });
    };

    await sendMessage(
      appStrong.id,
      recruiterUser.id,
      candidateStrong.userId,
      "Hi Mai — thanks for the great conversation today! We're moving you forward, I'll be in touch with next steps shortly.",
      daysAgo(4),
      true,
    );
    await sendMessage(
      appStrong.id,
      candidateStrong.userId,
      recruiterUser.id,
      "Thank you, Thu! Really enjoyed the conversation with the team — looking forward to hearing more.",
      daysAgo(4),
      true,
    );

    await sendMessage(
      appMixed.id,
      hiringManagerUser.id,
      candidateMixed.userId,
      "Hi Khoa, quick follow-up — could you share a bit more detail on the caching approach you mentioned in the debugging round?",
      daysAgo(2),
      false,
    );

    const upcomingFirst = upcomingApps[0]!;
    await sendMessage(
      upcomingFirst.application.id,
      recruiterUser.id,
      upcomingFirst.talent.userId,
      "Looking forward to our call today — here's the meeting link again in case it's easier to find: https://meet.google.com/mek-upcoming-1",
      atHour(0, 8),
      false,
    );

    // ─── NOTIFICATIONS — application-status changes and interview events
    // for the named scenarios (message notifications already created
    // above), mixing read and unread. ───────────────────────────────────
    await prisma.notification.createMany({
      data: [
        {
          userId: candidateStrong.userId,
          type: NotificationType.APPLICATION_STATUS_CHANGED,
          title: "Your application status changed",
          body: `Your application for ${flagshipJob.title} is now Offered.`,
          link: `/applications/${appStrong.id}`,
          createdAt: daysAgo(1),
          readAt: null,
        },
        {
          userId: candidateRejected.userId,
          type: NotificationType.APPLICATION_STATUS_CHANGED,
          title: "Your application status changed",
          body: `Your application for ${flagshipJob.title} is now Rejected.`,
          link: `/applications/${appRejected.id}`,
          createdAt: daysAgo(6),
          readAt: daysAgo(5),
        },
        {
          userId: mainCompany.ownerUserId,
          type: NotificationType.INTERVIEW_CONFIRMED,
          title: "Interview confirmed",
          body: `Mai Nguyen confirmed the interview for ${flagshipJob.title}.`,
          link: `/employer/applications/${appStrong.id}/interview`,
          createdAt: daysAgo(6),
          readAt: daysAgo(6),
        },
      ],
    });
    for (const { application, talent } of upcomingApps) {
      await prisma.notification.create({
        data: {
          userId: talent.userId,
          type: NotificationType.INTERVIEW_PROPOSED,
          title: `${mainCompany.companyName} proposed interview times`,
          body: `1 option for a 30-min interview for ${flagshipJob.title}.`,
          link: `/applications/${application.id}/interview`,
          createdAt: daysAgo(randomInt(2, 5)),
          readAt: maybe(0.5) ? daysAgo(1) : null,
        },
      });
    }

    // ─── An invitation, to back an INVITATION_RECEIVED notification ────
    await prisma.jobInvitation.create({
      data: {
        jobId: flagshipJob.id,
        talentId: invitedTalent.id,
        employerId: mainCompany.id,
        message:
          "Your profile stood out to our hiring team — we'd love for you to apply for our Senior Backend Engineer role.",
        status: InvitationStatus.PENDING,
      },
    });
    await prisma.notification.create({
      data: {
        userId: invitedTalent.userId,
        type: NotificationType.INVITATION_RECEIVED,
        title: `${mainCompany.companyName} invited you to apply`,
        body: `They think you'd be a great fit for ${flagshipJob.title}.`,
        link: `/jobs/${flagshipJob.id}`,
        createdAt: daysAgo(1),
        readAt: null,
      },
    });

    // Notification preferences for the flagship cast — not required to
    // exist (created lazily on first read in the real app), but harmless
    // and gives Settings > Notifications something real to render.
    for (const userId of [
      candidateStrong.userId,
      candidateMixed.userId,
      ownerUser.id,
      recruiterUser.id,
    ]) {
      await prisma.notificationPreference
        .create({ data: { userId } })
        .catch(() => undefined); // userId is unique — harmless no-op if already present
    }

    console.log("Phase 2 done: flagship scenario data created.");
  } else {
    console.log(
      `Phase 2 skipped — flagship scenario data already present (found ${FLAGSHIP_MARKER_EMAIL}).`,
    );
  }

  // Flush accumulated applyCount updates from whichever phases ran.
  await Promise.all(
    [...applyCountByJob.entries()].map(([jobId, applyCount]) =>
      prisma.job.update({ where: { id: jobId }, data: { applyCount } }),
    ),
  );

  // ══════════════════════════════════════════════════════════════════════
  // Summary — always DB-driven counts, correct regardless of which phases
  // ran in this particular invocation.
  // ══════════════════════════════════════════════════════════════════════
  const [
    companyCount,
    talentCount,
    jobTotal,
    jobActive,
    totalApplications,
    totalInterviews,
    totalScorecards,
    totalMessages,
    totalNotifications,
  ] = await Promise.all([
    prisma.employerProfile.count(),
    prisma.talentProfile.count(),
    prisma.job.count(),
    prisma.job.count({ where: { status: JobStatus.ACTIVE } }),
    prisma.application.count(),
    prisma.interview.count(),
    prisma.interviewScorecard.count(),
    prisma.message.count(),
    prisma.notification.count(),
  ]);

  console.log("\n─── Seed complete ───────────────────────────────────────");
  console.log(`Password for every seeded account: ${SEED_PASSWORD}`);
  console.log(`Admin:        ${ADMIN_EMAIL}`);
  console.log(
    `Main company: ${mainCompany.companyName} — ${MAIN_COMPANY_OWNER_EMAIL} (OWNER, ${ownerUser.name})`,
  );
  console.log("  Team: recruiter1@remotesea.dev (RECRUITER, Thu Le)");
  console.log(
    "        hiringmanager1@remotesea.dev (HIRING_MANAGER, Duc Pham)",
  );
  console.log("        interviewer1@remotesea.dev (INTERVIEWER, Linh Vu)");
  console.log(
    "        interviewer2@remotesea.dev (INTERVIEWER, Khanh Hoang)",
  );
  console.log(
    `Second company: ${secondCompany.companyName} — ${SECOND_COMPANY_OWNER_EMAIL} (OWNER) + recruiter2@remotesea.dev (RECRUITER)`,
  );
  console.log(
    `${companyCount} companies total, ${talentCount} talents, ${jobTotal} jobs (${jobActive} ACTIVE), ${skills.length} skills, ${categories.length} categories.`,
  );
  console.log(
    `${totalApplications} applications, ${totalInterviews} interviews, ${totalScorecards} scorecards.`,
  );
  console.log(
    `${totalMessages} messages, ${totalNotifications} notifications.`,
  );
  console.log(
    "\nFlagship scenarios (Mekong Digital → Senior Backend Engineer):",
  );
  console.log(
    `  Strong candidate     — Mai Nguyen (candidate.strong@remotesea.dev): 3/4 recommend hire, status OFFERED`,
  );
  console.log(
    `  Mixed candidate      — Khoa Tran (candidate.mixed@remotesea.dev): 2/3 recommend hire, 1 pending (interviewer2)`,
  );
  console.log(
    `  Rejected candidate   — Duy Le (candidate.rejected@remotesea.dev): 0/3 recommend hire, status REJECTED`,
  );
  console.log(
    `  Full-panel candidate — Huyen Pham (candidate.fullpanel@remotesea.dev): 4/4 recommend hire, unanimous`,
  );
  console.log(
    "  Upcoming interviews  — Anh Vo & Bao Dinh today, Chau Ly & Dat Truong tomorrow, Giang Mai & Hai Doan later this week.",
  );
  console.log(
    "    interviewer1@remotesea.dev's agenda: Anh Vo (today), Chau Ly (tomorrow)",
  );
  console.log(
    "    interviewer2@remotesea.dev's agenda: Bao Dinh (today), Giang Mai (this week)",
  );
  console.log(
    "\nTo force a full reseed: wipe the database (`npx prisma migrate reset`), then rerun `npx prisma db seed`.",
  );
  console.log("─────────────────────────────────────────────────────────\n");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
