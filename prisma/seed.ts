// Standalone by design: this only ever runs against a disposable local
// database (never the real DATABASE_URL — see README/CLAUDE.md for the
// live-Supabase warning), so it doesn't reuse any src/ app code. That avoids
// pulling `@/`-aliased imports through ts-node (which isn't configured with
// tsconfig-paths) and keeps this file runnable on its own with nothing but
// @prisma/client, bcrypt, and nanoid.
import {
  PrismaClient,
  UserRole,
  JobType,
  ExperienceLevel,
  JobStatus,
  PlanType,
  ApplicationStatus,
  AlertFrequency,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

// Every seeded user shares this password — a fixed, known credential is more
// useful for local testing than a unique one per row nobody will ever type in.
const SEED_PASSWORD = "Password123!";
const BCRYPT_SALT_ROUNDS = 12;

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
  "Cattleya Games",
  "Meridian Data",
  "Harborlight Media",
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

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_SALT_ROUNDS);

  // ─── Admin ────────────────────────────────────────────────────────────
  await prisma.user.create({
    data: {
      email: "admin@remotesea.dev",
      name: "Admin User",
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  // ─── Skills & categories ──────────────────────────────────────────────
  const skills = await Promise.all(
    SKILL_NAMES.map((name) =>
      prisma.skill.create({ data: { name, slug: slugify(name) } }),
    ),
  );

  const categories = await Promise.all(
    CATEGORY_DEFS.map(({ name, icon }) =>
      prisma.category.create({ data: { name, slug: slugify(name), icon } }),
    ),
  );

  // ─── Employers ────────────────────────────────────────────────────────
  const employers: { id: string; userId: string }[] = [];
  for (let i = 0; i < EMPLOYER_COUNT; i += 1) {
    const companyName = COMPANY_NAMES[i % COMPANY_NAMES.length]!;
    const user = await prisma.user.create({
      data: {
        email: `employer${i + 1}@remotesea.dev`,
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
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
        description: `${companyName} builds remote-friendly products for teams across Southeast Asia.`,
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
        isVerified: maybe(0.6),
      },
    });
    employers.push({ id: profile.id, userId: user.id });
  }

  // ─── Talents ──────────────────────────────────────────────────────────
  const talents: { id: string; userId: string }[] = [];
  for (let i = 0; i < TALENT_COUNT; i += 1) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const name = `${firstName} ${lastName}`;
    const user = await prisma.user.create({
      data: {
        email: `talent${i + 1}@remotesea.dev`,
        name,
        passwordHash,
        role: UserRole.TALENT,
      },
    });
    const level = pick(EXPERIENCE_LEVELS);
    const profile = await prisma.talentProfile.create({
      data: {
        userId: user.id,
        slug: uniqueSlug(name),
        headline: `${level.charAt(0) + level.slice(1).toLowerCase()} ${pick(
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
        isOpenToWork: maybe(0.8),
        desiredSalaryMin: randomInt(500, 2000),
        desiredSalaryMax: randomInt(2500, 8000),
      },
    });

    await prisma.talentSkill.createMany({
      data: pickN(skills, 2, 5).map((skill) => ({
        talentId: profile.id,
        skillId: skill.id,
        yearsExp: randomInt(1, 8),
      })),
    });

    talents.push({ id: profile.id, userId: user.id });
  }

  // ─── Jobs ─────────────────────────────────────────────────────────────
  const jobIds: { id: string; status: string }[] = [];
  for (const employer of employers) {
    const jobCount = randomInt(3, 8);
    for (let i = 0; i < jobCount; i += 1) {
      const category = pick(CATEGORY_DEFS);
      const title = pick(JOB_TITLES_BY_CATEGORY[category.name]!);
      const company =
        COMPANY_NAMES[employers.indexOf(employer) % COMPANY_NAMES.length]!;
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
      const { description, requirements, responsibilities } = jobDescription(
        title,
        company,
      );

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
            status === JobStatus.ACTIVE ? daysFromNow(randomInt(10, 60)) : null,
        },
      });

      await prisma.jobCategory.create({
        data: {
          jobId: job.id,
          categoryId: categories.find((c) => c.name === category.name)!.id,
        },
      });
      if (maybe(0.3)) {
        const other = pick(categories.filter((c) => c.name !== category.name));
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

  // ─── Applications (only against ACTIVE/CLOSED jobs) ──────────────────
  const applicableJobs = jobIds.filter(
    (j) => j.status === JobStatus.ACTIVE || j.status === JobStatus.CLOSED,
  );
  const applicationStatuses = Object.values(ApplicationStatus);
  const applyCountByJob = new Map<string, number>();

  for (const job of applicableJobs) {
    if (!maybe(0.7)) continue;
    const applicants = pickN(talents, 0, 8);
    for (const talent of applicants) {
      await prisma.application.create({
        data: {
          jobId: job.id,
          talentId: talent.id,
          coverLetter: maybe(0.6)
            ? "I'd love to bring my remote-work experience to this role — happy to share references on request."
            : null,
          status: pick(applicationStatuses),
          appliedAt: daysAgo(randomInt(1, 60)),
        },
      });
      applyCountByJob.set(job.id, (applyCountByJob.get(job.id) ?? 0) + 1);
    }
  }

  await Promise.all(
    [...applyCountByJob.entries()].map(([jobId, applyCount]) =>
      prisma.job.update({ where: { id: jobId }, data: { applyCount } }),
    ),
  );

  // ─── Saved jobs ────────────────────────────────────────────────────────
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

  // ─── Job alerts ────────────────────────────────────────────────────────
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

  const jobCounts = {
    active: jobIds.filter((j) => j.status === JobStatus.ACTIVE).length,
    total: jobIds.length,
  };
  console.log(
    `Seeded ${employers.length} employers, ${talents.length} talents, ${jobCounts.total} jobs (${jobCounts.active} ACTIVE), ${skills.length} skills, ${categories.length} categories.`,
  );
  console.log(`All seeded users share the password: ${SEED_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
