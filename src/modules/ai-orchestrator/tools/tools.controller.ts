import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { OrchestratorAuthGuard } from "../guards/orchestrator-auth.guard";
import { CurrentResource } from "@/common/authorization/current-resource.decorator";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { Roles } from "@/core/decorators/roles.decorator";
import { RolesGuard } from "@/core/guards/roles.guard";
import { ApplicationAccessGuard } from "@/modules/employer/guards/application-access.guard";
import type { ApplicationWithJobOwner } from "@/modules/employer/guards/application-ownership.guard";
import { EmployerService } from "@/modules/employer/employer.service";
import { JobsService } from "@/modules/jobs/jobs.service";
import { RateLimitService } from "@/common/services/rate-limit.service";
import { RATE_LIMITS as CV_ANALYSIS_RATE_LIMITS } from "@/modules/cv-analysis/constants";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

// The AI Orchestrator's first live tools — every route here is deliberately
// read-only and reuses an existing, already-hardened guard + service method
// rather than a new authorization path: ApplicationAccessGuard is the exact
// class guarding GET /employer/applications/:id/{interview,ai-cv-analysis}
// for a real browser request, so a tool call is authorized identically to
// the human recruiter action it stands in for — same company/role check,
// same assigned-INTERVIEWER bypass, same 403/404 behavior. Nothing here
// queries Prisma directly or re-derives ownership.
@ApiTags("ai-orchestrator-tools")
@Controller("ai-orchestrator/tools")
@UseGuards(OrchestratorAuthGuard)
export class ToolsController {
  constructor(
    private readonly employerService: EmployerService,
    private readonly jobsService: JobsService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Get("applications/:id")
  @UseGuards(RolesGuard, ApplicationAccessGuard)
  @Roles("EMPLOYER")
  getApplication(@CurrentResource() application: ApplicationWithJobOwner) {
    // Curated, not a raw Prisma dump — no talent email here (nothing calling
    // this tool needs it yet, and the spec is explicit: don't expose PII
    // that isn't needed for the task at hand).
    return {
      id: application.id,
      status: application.status,
      job: { title: application.job.title },
      talent: { name: application.talent.user.name },
    };
  }

  // Same rate-limit bucket key format as EmployerController's own
  // GET .../ai-cv-analysis (`cv-analysis:${user.id}`) — this tool is a
  // second path to the exact same paid LLM call
  // (CvAnalysisService.getOrCreate), and `user.id` here is the same
  // verified end-user id OrchestratorAuthGuard extracted from the signed
  // context token. Without this, a chat conversation with tool-calling
  // enabled could trigger unlimited CV analyses — the direct UI's own rate
  // limit was never actually a ceiling on this feature's total LLM cost,
  // only on one of its two entry points.
  @Get("applications/:id/candidate-analysis")
  @UseGuards(RolesGuard, ApplicationAccessGuard)
  @Roles("EMPLOYER")
  getCandidateAnalysis(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentResource() application: ApplicationWithJobOwner,
  ) {
    this.rateLimitService.enforce(
      `cv-analysis:${user.id}`,
      CV_ANALYSIS_RATE_LIMITS.GET_CV_ANALYSIS.limit,
      CV_ANALYSIS_RATE_LIMITS.GET_CV_ANALYSIS.windowMs,
    );
    return this.employerService.getApplicationCvAnalysis(application);
  }

  @Get("applications/:id/interview")
  @UseGuards(RolesGuard, ApplicationAccessGuard)
  @Roles("EMPLOYER")
  getInterview(@CurrentResource() application: ApplicationWithJobOwner) {
    return this.employerService.getApplicationInterview(application);
  }

  // No RolesGuard/ownership guard — job detail is public data (same as
  // GET /jobs/:id, which has no guard at all), open to any authenticated
  // orchestrator context regardless of role.
  @Get("jobs/:id")
  getJob(@Param("id") id: string) {
    return this.jobsService.getActiveById(id);
  }
}
