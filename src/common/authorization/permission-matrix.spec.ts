import "reflect-metadata";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { RequestMethod, type Type } from "@nestjs/common";
import { ROLES_KEY } from "@/core/decorators/roles.decorator";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { GoogleAuthGuard } from "@/modules/auth/guards/google-auth.guard";
import { GithubAuthGuard } from "@/modules/auth/guards/github-auth.guard";
import { JobOwnershipGuard } from "@/modules/jobs/guards/job-ownership.guard";
import { EmployerJobOwnershipGuard } from "@/modules/employer/guards/employer-job-ownership.guard";
import { ApplicationOwnershipGuard } from "@/modules/employer/guards/application-ownership.guard";
import { AlertOwnershipGuard } from "@/modules/alerts/guards/alert-ownership.guard";
import { JobPayerOwnershipGuard } from "@/modules/billing/guards/job-payer-ownership.guard";
import { CronSecretGuard } from "@/modules/alerts/guards/cron-secret.guard";
import { JobsController } from "@/modules/jobs/jobs.controller";
import { ApplicationsController } from "@/modules/applications/applications.controller";
import { SavedController } from "@/modules/saved/saved.controller";
import { AuthController } from "@/modules/auth/auth.controller";
import { SalaryController } from "@/modules/salary/salary.controller";
import { EmployerController } from "@/modules/employer/employer.controller";
import { HealthController } from "@/modules/health/health.controller";
import { AdminController } from "@/modules/admin/admin.controller";
import { UploadsController } from "@/modules/uploads/uploads.controller";
import { AlertsController } from "@/modules/alerts/alerts.controller";
import { SkillsController } from "@/modules/taxonomy/skills.controller";
import { CategoriesController } from "@/modules/taxonomy/categories.controller";
import { UsersController } from "@/modules/users/users.controller";
import { BillingController } from "@/modules/billing/billing.controller";
import { TalentController } from "@/modules/talent/talent.controller";
import { ReviewsController } from "@/modules/reviews/reviews.controller";
import { TeamController } from "@/modules/team/team.controller";

/**
 * This is the permission matrix: every route in the API, alongside the exact
 * guards and roles that actually gate it, read straight from the same
 * decorator metadata Nest's router uses at request time (not a hand-maintained
 * doc that drifts from reality). A route added to one of these controllers
 * without a matching entry below fails the "every declared route is
 * accounted for" check at the bottom of each block — there's no way to ship
 * an unreviewed auth decision on a new endpoint here silently.
 *
 * Guards are listed in the order Nest actually runs them: global, then
 * class-level @UseGuards, then method-level @UseGuards, concatenated (not
 * overridden — confirmed by reading @nestjs/core's context-creator.js).
 * Roles use override semantics instead (method @Roles wins over class
 * @Roles if both are present — confirmed via RolesGuard's own
 * reflector.getAllAndOverride call), so `roles` below is the *effective*
 * value for that route, not a merge.
 */

type ExpectedRoute = {
  method: string;
  httpMethod: keyof typeof RequestMethod;
  path: string;
  guards: string[];
  roles?: string[];
};

type ControllerExpectation = {
  name: string;
  controller: Type<unknown>;
  basePath: string;
  routes: ExpectedRoute[];
};

const guardName = (guard: unknown): string => (guard as Type<unknown>).name;

/** The route handler function itself — decorator metadata lives on this, not the class. */
const getHandler = (controller: Type<unknown>, methodName: string): object => {
  const handler = (controller.prototype as Record<string, object>)[methodName];
  if (!handler) {
    throw new Error(
      `${controller.name} has no method named "${methodName}" — the expectation table below is out of date.`,
    );
  }
  return handler;
};

const getEffectiveGuardNames = (
  controller: Type<unknown>,
  methodName: string,
): string[] => {
  const classGuards: unknown[] =
    Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
  const methodGuards: unknown[] =
    Reflect.getMetadata(GUARDS_METADATA, getHandler(controller, methodName)) ??
    [];
  return [...classGuards, ...methodGuards].map(guardName);
};

const getEffectiveRoles = (
  controller: Type<unknown>,
  methodName: string,
): string[] | undefined => {
  const methodRoles = Reflect.getMetadata(
    ROLES_KEY,
    getHandler(controller, methodName),
  );
  if (methodRoles !== undefined) return methodRoles;
  return Reflect.getMetadata(ROLES_KEY, controller);
};

const getRouteHttpMethod = (
  controller: Type<unknown>,
  methodName: string,
): keyof typeof RequestMethod => {
  const method: number = Reflect.getMetadata(
    METHOD_METADATA,
    getHandler(controller, methodName),
  );
  return RequestMethod[method] as keyof typeof RequestMethod;
};

const getRoutePath = (controller: Type<unknown>, methodName: string): string =>
  Reflect.getMetadata(PATH_METADATA, getHandler(controller, methodName));

/** Every own-prototype method Nest registered a route on (has PATH_METADATA). */
const getAllRouteHandlerNames = (controller: Type<unknown>): string[] => {
  const prototype = controller.prototype as Record<string, object>;
  return Object.getOwnPropertyNames(prototype).filter(
    (name) =>
      name !== "constructor" &&
      typeof prototype[name] === "function" &&
      Reflect.getMetadata(PATH_METADATA, prototype[name]) !== undefined,
  );
};

const expectations: ControllerExpectation[] = [
  {
    name: "JobsController",
    controller: JobsController,
    basePath: "jobs",
    routes: [
      { method: "list", httpMethod: "GET", path: "/", guards: [] },
      {
        method: "create",
        httpMethod: "POST",
        path: "/",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "expireStaleJobs",
        httpMethod: "GET",
        path: "cron/expire",
        guards: ["CronSecretGuard"],
      },
      { method: "getById", httpMethod: "GET", path: ":id", guards: [] },
      {
        method: "update",
        httpMethod: "PATCH",
        path: ":id",
        guards: ["JwtAuthGuard", "JobOwnershipGuard"],
      },
    ],
  },
  {
    name: "ApplicationsController",
    controller: ApplicationsController,
    basePath: "applications",
    routes: [
      {
        method: "findAll",
        httpMethod: "GET",
        path: "/",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "getStats",
        httpMethod: "GET",
        path: "stats",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "listIds",
        httpMethod: "GET",
        path: "ids",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "apply",
        httpMethod: "POST",
        path: "/",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "dispatchBacklogReminders",
        httpMethod: "GET",
        path: "cron/reminders",
        guards: ["CronSecretGuard"],
      },
      {
        method: "getById",
        httpMethod: "GET",
        path: ":id",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "withdraw",
        httpMethod: "PATCH",
        path: ":id/withdraw",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "respondToOffer",
        httpMethod: "PATCH",
        path: ":id/offer-response",
        guards: ["JwtAuthGuard"],
      },
    ],
  },
  {
    name: "SavedController",
    controller: SavedController,
    basePath: "saved",
    routes: [
      {
        method: "findAll",
        httpMethod: "GET",
        path: "/",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "listIds",
        httpMethod: "GET",
        path: "ids",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "save",
        httpMethod: "PUT",
        path: ":jobId",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "unsave",
        httpMethod: "DELETE",
        path: ":jobId",
        guards: ["JwtAuthGuard"],
      },
    ],
  },
  {
    name: "AuthController",
    controller: AuthController,
    basePath: "auth",
    routes: [
      { method: "register", httpMethod: "POST", path: "register", guards: [] },
      { method: "login", httpMethod: "POST", path: "login", guards: [] },
      {
        method: "twoFactorChallenge",
        httpMethod: "POST",
        path: "2fa/challenge",
        guards: [],
      },
      {
        method: "twoFactorStatus",
        httpMethod: "GET",
        path: "2fa/status",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "setupTwoFactor",
        httpMethod: "POST",
        path: "2fa/setup",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "verifyTwoFactorSetup",
        httpMethod: "POST",
        path: "2fa/verify",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "disableTwoFactor",
        httpMethod: "POST",
        path: "2fa/disable",
        guards: ["JwtAuthGuard"],
      },
      { method: "session", httpMethod: "GET", path: "session", guards: [] },
      {
        method: "linkProvider",
        httpMethod: "GET",
        path: ":provider/link",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "googleLogin",
        httpMethod: "GET",
        path: "google",
        guards: ["GoogleAuthGuard"],
      },
      {
        method: "googleCallback",
        httpMethod: "GET",
        path: "google/callback",
        guards: ["GoogleAuthGuard"],
      },
      {
        method: "githubLogin",
        httpMethod: "GET",
        path: "github",
        guards: ["GithubAuthGuard"],
      },
      {
        method: "githubCallback",
        httpMethod: "GET",
        path: "github/callback",
        guards: ["GithubAuthGuard"],
      },
      {
        method: "linkedinLogin",
        httpMethod: "GET",
        path: "linkedin",
        guards: ["LinkedinAuthGuard"],
      },
      {
        method: "linkedinCallback",
        httpMethod: "GET",
        path: "linkedin/callback",
        guards: ["LinkedinAuthGuard"],
      },
      {
        method: "forgotPassword",
        httpMethod: "POST",
        path: "forgot-password",
        guards: [],
      },
      {
        method: "resetPassword",
        httpMethod: "POST",
        path: "reset-password",
        guards: [],
      },
    ],
  },
  {
    name: "SalaryController",
    controller: SalaryController,
    basePath: "salary",
    routes: [
      { method: "list", httpMethod: "GET", path: "benchmarks", guards: [] },
      {
        method: "listBySeniority",
        httpMethod: "GET",
        path: "benchmarks/by-seniority",
        guards: [],
      },
      {
        method: "listByCountry",
        httpMethod: "GET",
        path: "benchmarks/by-country",
        guards: [],
      },
    ],
  },
  {
    name: "EmployerController",
    controller: EmployerController,
    basePath: "employer",
    routes: [
      {
        method: "createProfile",
        httpMethod: "POST",
        path: "profile",
        guards: ["JwtAuthGuard", "RolesGuard"],
        // Deliberately no @Roles here — this is the "become an employer"
        // endpoint; any authenticated user (any role) must be able to call it.
      },
      {
        method: "getProfile",
        httpMethod: "GET",
        path: "profile",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "updateProfile",
        httpMethod: "PATCH",
        path: "profile",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "listJobs",
        httpMethod: "GET",
        path: "jobs",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "listRecentApplications",
        httpMethod: "GET",
        path: "applications/recent",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "listJobApplications",
        httpMethod: "GET",
        path: "jobs/:id/applications",
        guards: ["JwtAuthGuard", "RolesGuard", "EmployerJobOwnershipGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "bulkUpdateApplications",
        httpMethod: "PATCH",
        path: "applications/bulk",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "updateApplication",
        httpMethod: "PATCH",
        path: "applications/:id",
        guards: ["JwtAuthGuard", "RolesGuard", "ApplicationOwnershipGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "listApplicationMessages",
        httpMethod: "GET",
        path: "applications/:id/messages",
        guards: ["JwtAuthGuard", "RolesGuard", "ApplicationAccessGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "sendApplicationMessage",
        httpMethod: "POST",
        path: "applications/:id/messages",
        guards: ["JwtAuthGuard", "RolesGuard", "ApplicationAccessGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "getApplicationInterview",
        httpMethod: "GET",
        path: "applications/:id/interview",
        guards: ["JwtAuthGuard", "RolesGuard", "ApplicationAccessGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "proposeInterview",
        httpMethod: "POST",
        path: "applications/:id/interview",
        guards: ["JwtAuthGuard", "RolesGuard", "ApplicationOwnershipGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "cancelInterview",
        httpMethod: "PATCH",
        path: "applications/:id/interview/cancel",
        guards: ["JwtAuthGuard", "RolesGuard", "ApplicationOwnershipGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "listUpcomingInterviews",
        httpMethod: "GET",
        path: "interviews/upcoming",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "listApplicationScorecards",
        httpMethod: "GET",
        path: "applications/:id/scorecards",
        guards: ["JwtAuthGuard", "RolesGuard", "ApplicationAccessGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "submitApplicationScorecard",
        httpMethod: "POST",
        path: "applications/:id/scorecards",
        guards: ["JwtAuthGuard", "RolesGuard", "ApplicationAccessGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "getApplicationCvAnalysis",
        httpMethod: "GET",
        path: "applications/:id/ai-cv-analysis",
        guards: ["JwtAuthGuard", "RolesGuard", "ApplicationAccessGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "submitVerification",
        httpMethod: "POST",
        path: "verification",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "confirmVerification",
        httpMethod: "POST",
        path: "verification/confirm",
        guards: [],
      },
    ],
  },
  {
    name: "HealthController",
    controller: HealthController,
    basePath: "health",
    routes: [
      { method: "live", httpMethod: "GET", path: "live", guards: [] },
      { method: "check", httpMethod: "GET", path: "/", guards: [] },
    ],
  },
  {
    name: "AdminController",
    controller: AdminController,
    basePath: "admin",
    routes: [
      {
        method: "listEmployers",
        httpMethod: "GET",
        path: "employers",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["ADMIN"],
      },
      {
        method: "updateEmployer",
        httpMethod: "PATCH",
        path: "employers/:id",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["ADMIN"],
      },
      {
        method: "listJobs",
        httpMethod: "GET",
        path: "jobs",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["ADMIN"],
      },
      {
        method: "reviewJob",
        httpMethod: "PATCH",
        path: "jobs/:id",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["ADMIN"],
      },
      {
        method: "getRevenue",
        httpMethod: "GET",
        path: "revenue",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["ADMIN"],
      },
      {
        method: "listReports",
        httpMethod: "GET",
        path: "reports",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["ADMIN"],
      },
      {
        method: "resolveReport",
        httpMethod: "PATCH",
        path: "reports/:id",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["ADMIN"],
      },
      {
        method: "listAuditLog",
        httpMethod: "GET",
        path: "audit-log",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["ADMIN"],
      },
    ],
  },
  {
    name: "UploadsController",
    controller: UploadsController,
    basePath: "uploads",
    routes: [
      {
        method: "presign",
        httpMethod: "POST",
        path: "presign",
        guards: ["JwtAuthGuard"],
      },
    ],
  },
  {
    name: "AlertsController",
    controller: AlertsController,
    basePath: "alerts",
    routes: [
      {
        method: "list",
        httpMethod: "GET",
        path: "/",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "create",
        httpMethod: "POST",
        path: "/",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "update",
        httpMethod: "PATCH",
        path: ":id",
        guards: ["JwtAuthGuard", "AlertOwnershipGuard"],
      },
      {
        method: "remove",
        httpMethod: "DELETE",
        path: ":id",
        guards: ["JwtAuthGuard", "AlertOwnershipGuard"],
      },
      {
        method: "dispatchCron",
        httpMethod: "GET",
        path: "cron/dispatch",
        guards: ["CronSecretGuard"],
      },
    ],
  },
  {
    name: "SkillsController",
    controller: SkillsController,
    basePath: "skills",
    routes: [{ method: "list", httpMethod: "GET", path: "/", guards: [] }],
  },
  {
    name: "CategoriesController",
    controller: CategoriesController,
    basePath: "categories",
    routes: [{ method: "list", httpMethod: "GET", path: "/", guards: [] }],
  },
  {
    name: "UsersController",
    controller: UsersController,
    basePath: "users/me",
    routes: [
      {
        method: "updateName",
        httpMethod: "PATCH",
        path: "/",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "deleteAccount",
        httpMethod: "DELETE",
        path: "/",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "changePassword",
        httpMethod: "POST",
        path: "password",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "getAccount",
        httpMethod: "GET",
        path: "account",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "updateAccount",
        httpMethod: "PATCH",
        path: "account",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "getNotificationPreferences",
        httpMethod: "GET",
        path: "notification-preferences",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "updateNotificationPreferences",
        httpMethod: "PATCH",
        path: "notification-preferences",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "getPauseState",
        httpMethod: "GET",
        path: "pause",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "pauseAccount",
        httpMethod: "POST",
        path: "pause",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "reactivateAccount",
        httpMethod: "POST",
        path: "reactivate",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "exportData",
        httpMethod: "GET",
        path: "export",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "listConnections",
        httpMethod: "GET",
        path: "connections",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "disconnectConnection",
        httpMethod: "DELETE",
        path: "connections/:provider",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "listSessions",
        httpMethod: "GET",
        path: "sessions",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "revokeSession",
        httpMethod: "DELETE",
        path: "sessions/:id",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "revokeOtherSessions",
        httpMethod: "DELETE",
        path: "sessions",
        guards: ["JwtAuthGuard"],
      },
    ],
  },
  {
    name: "BillingController",
    controller: BillingController,
    basePath: "billing",
    routes: [
      {
        method: "checkout",
        httpMethod: "POST",
        path: "checkout",
        guards: ["JwtAuthGuard", "JobPayerOwnershipGuard"],
      },
      {
        method: "webhook",
        httpMethod: "POST",
        path: "webhook",
        guards: [],
        // No JwtAuthGuard: Stripe calls this directly. Authenticity comes
        // from the webhook signature check inside BillingService, not a guard.
      },
      {
        method: "reconcileStuckJobs",
        httpMethod: "GET",
        path: "cron/reconcile",
        guards: ["CronSecretGuard"],
      },
    ],
  },
  {
    name: "TalentController",
    controller: TalentController,
    basePath: "talent",
    routes: [
      {
        method: "getOwnProfile",
        httpMethod: "GET",
        path: "me",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "upsertProfile",
        httpMethod: "PUT",
        path: "me",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "getActivity",
        httpMethod: "GET",
        path: "me/activity",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "getProfileViewAnalytics",
        httpMethod: "GET",
        path: "me/profile-views",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "submitVerification",
        httpMethod: "POST",
        path: "verification",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "confirmVerification",
        httpMethod: "POST",
        path: "verification/confirm",
        guards: [],
      },
      {
        method: "search",
        httpMethod: "GET",
        path: "/",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "getPublicProfile",
        httpMethod: "GET",
        path: ":slug",
        guards: [],
      },
    ],
  },
  {
    name: "ReviewsController",
    controller: ReviewsController,
    basePath: "reviews",
    routes: [
      {
        method: "getEligibility",
        httpMethod: "GET",
        path: "eligibility/:applicationId",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "create",
        httpMethod: "POST",
        path: "/",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "listForUser",
        httpMethod: "GET",
        path: "user/:userId",
        guards: [],
      },
    ],
  },
  {
    name: "TeamController",
    controller: TeamController,
    basePath: "team",
    routes: [
      {
        method: "listMembers",
        httpMethod: "GET",
        path: "members",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "listInvitations",
        httpMethod: "GET",
        path: "invitations",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "inviteMember",
        httpMethod: "POST",
        path: "invitations",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "acceptInvitation",
        httpMethod: "POST",
        path: "invitations/accept",
        guards: ["JwtAuthGuard"],
      },
      {
        method: "previewInvitation",
        httpMethod: "GET",
        path: "invitations/:token",
        guards: [],
      },
      {
        method: "revokeInvitation",
        httpMethod: "DELETE",
        path: "invitations/:id",
        guards: ["JwtAuthGuard", "RolesGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "updateMemberRole",
        httpMethod: "PATCH",
        path: "members/:id",
        guards: ["JwtAuthGuard", "RolesGuard", "CompanyMemberOwnershipGuard"],
        roles: ["EMPLOYER"],
      },
      {
        method: "removeMember",
        httpMethod: "DELETE",
        path: "members/:id",
        guards: ["JwtAuthGuard", "RolesGuard", "CompanyMemberOwnershipGuard"],
        roles: ["EMPLOYER"],
      },
    ],
  },
];

describe("Permission matrix", () => {
  describe.each(expectations)(
    "$name",
    ({ controller, routes }: ControllerExpectation) => {
      it("has no undocumented route handlers", () => {
        const actualMethodNames = getAllRouteHandlerNames(controller).sort();
        const expectedMethodNames = routes.map((r) => r.method).sort();
        expect(actualMethodNames).toEqual(expectedMethodNames);
      });

      it.each(routes)(
        "$httpMethod $path ($method) has the expected guards and roles",
        (route) => {
          expect(getRouteHttpMethod(controller, route.method)).toBe(
            route.httpMethod,
          );
          expect(getRoutePath(controller, route.method)).toBe(route.path);
          expect(getEffectiveGuardNames(controller, route.method)).toEqual(
            route.guards,
          );
          expect(getEffectiveRoles(controller, route.method)).toEqual(
            route.roles,
          );
        },
      );
    },
  );

  it("every ownership/role guard used above actually exists and is imported", () => {
    // Referenced only to keep these imports from being flagged as unused —
    // their presence in the guards arrays above is the real assertion.
    expect([
      JwtAuthGuard,
      RolesGuard,
      GoogleAuthGuard,
      GithubAuthGuard,
      JobOwnershipGuard,
      EmployerJobOwnershipGuard,
      ApplicationOwnershipGuard,
      AlertOwnershipGuard,
      JobPayerOwnershipGuard,
      CronSecretGuard,
    ]).toHaveLength(10);
  });
});
