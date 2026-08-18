import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { EmployerService } from "./employer.service";
import {
  createEmployerProfileSchema,
  type CreateEmployerProfileDto,
} from "./dto/create-employer-profile.dto";
import {
  updateEmployerProfileSchema,
  type UpdateEmployerProfileDto,
} from "./dto/update-employer-profile.dto";
import {
  listEmployerJobsSchema,
  type ListEmployerJobsDto,
} from "./dto/list-employer-jobs.dto";
import {
  listJobApplicationsSchema,
  type ListJobApplicationsDto,
} from "./dto/list-job-applications.dto";
import {
  updateApplicationSchema,
  type UpdateApplicationDto,
} from "./dto/update-application.dto";
import {
  submitVerificationSchema,
  type SubmitVerificationDto,
} from "./dto/submit-verification.dto";
import {
  confirmVerificationSchema,
  type ConfirmVerificationDto,
} from "./dto/confirm-verification.dto";
import {
  sendMessageSchema,
  type SendMessageDto,
} from "@/modules/messages/dto/send-message.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/core/decorators/roles.decorator";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { CurrentResource } from "@/common/authorization/current-resource.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  EmployerJobOwnershipGuard,
  type JobOwnerOnly,
} from "./guards/employer-job-ownership.guard";
import {
  ApplicationOwnershipGuard,
  type ApplicationWithJobOwner,
} from "./guards/application-ownership.guard";
import {
  ApiConfirmVerification,
  ApiCreateEmployerProfile,
  ApiEmployerTag,
  ApiGetEmployerProfile,
  ApiListEmployerJobs,
  ApiListJobApplications,
  ApiSubmitVerification,
  ApiUpdateApplication,
  ApiUpdateEmployerProfile,
} from "./docs/employer.swagger";
import {
  ApiListMessages,
  ApiSendMessage,
} from "@/modules/messages/docs/messages.swagger";
import { RATE_LIMITS as MESSAGE_RATE_LIMITS } from "@/modules/messages/constants";

@ApiEmployerTag()
@Controller("employer")
export class EmployerController {
  constructor(
    private readonly employerService: EmployerService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  // Deliberately no @Roles("EMPLOYER") here, unlike every other route below —
  // this is the "become an employer" action itself. EmployerRepository.
  // createProfileForUser() promotes the caller's role to EMPLOYER in the same
  // transaction that creates the profile, so requiring the EMPLOYER role to
  // reach this endpoint would make it uncallable by the TALENT/no-employer-
  // profile-yet users it exists for.
  @ApiCreateEmployerProfile()
  @Post("profile")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  async createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createEmployerProfileSchema))
    body: CreateEmployerProfileDto,
  ) {
    this.rateLimitService.enforce(
      `employer-create-profile:${user.id}`,
      RATE_LIMITS.CREATE_PROFILE.limit,
      RATE_LIMITS.CREATE_PROFILE.windowMs,
    );
    return this.employerService.createProfile(user.id, body);
  }

  @ApiGetEmployerProfile()
  @Get("profile")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("EMPLOYER")
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.employerService.getProfile(user.id);
  }

  @ApiUpdateEmployerProfile()
  @Patch("profile")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("EMPLOYER")
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateEmployerProfileSchema))
    body: UpdateEmployerProfileDto,
  ) {
    this.rateLimitService.enforce(
      `employer-update-profile:${user.id}`,
      RATE_LIMITS.UPDATE_PROFILE.limit,
      RATE_LIMITS.UPDATE_PROFILE.windowMs,
    );
    return this.employerService.updateProfile(user.id, body);
  }

  @ApiListEmployerJobs()
  @Get("jobs")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("EMPLOYER")
  async listJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listEmployerJobsSchema))
    query: ListEmployerJobsDto,
  ) {
    return this.employerService.listJobs(user.id, query);
  }

  @ApiListJobApplications()
  @Get("jobs/:id/applications")
  @UseGuards(JwtAuthGuard, RolesGuard, EmployerJobOwnershipGuard)
  @Roles("EMPLOYER")
  async listJobApplications(
    @CurrentResource() job: JobOwnerOnly,
    @Query(new ZodValidationPipe(listJobApplicationsSchema))
    query: ListJobApplicationsDto,
  ) {
    return this.employerService.listJobApplications(job.id, query);
  }

  @ApiUpdateApplication()
  @Patch("applications/:id")
  @UseGuards(JwtAuthGuard, RolesGuard, ApplicationOwnershipGuard)
  @Roles("EMPLOYER")
  async updateApplication(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentResource() application: ApplicationWithJobOwner,
    @Body(new ZodValidationPipe(updateApplicationSchema))
    body: UpdateApplicationDto,
  ) {
    this.rateLimitService.enforce(
      `employer-update-application:${user.id}`,
      RATE_LIMITS.UPDATE_APPLICATION.limit,
      RATE_LIMITS.UPDATE_APPLICATION.windowMs,
    );
    return this.employerService.updateApplication(application, body);
  }

  @ApiListMessages()
  @Get("applications/:id/messages")
  @UseGuards(JwtAuthGuard, RolesGuard, ApplicationOwnershipGuard)
  @Roles("EMPLOYER")
  listApplicationMessages(
    @CurrentResource() application: ApplicationWithJobOwner,
  ) {
    return this.employerService.listApplicationMessages(application);
  }

  @ApiSendMessage()
  @Post("applications/:id/messages")
  @UseGuards(JwtAuthGuard, RolesGuard, ApplicationOwnershipGuard)
  @Roles("EMPLOYER")
  @HttpCode(HttpStatus.CREATED)
  sendApplicationMessage(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentResource() application: ApplicationWithJobOwner,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageDto,
  ) {
    this.rateLimitService.enforce(
      `send-message:${user.id}`,
      MESSAGE_RATE_LIMITS.SEND_MESSAGE.limit,
      MESSAGE_RATE_LIMITS.SEND_MESSAGE.windowMs,
    );
    return this.employerService.sendApplicationMessage(
      application,
      user.id,
      body,
    );
  }

  @ApiSubmitVerification()
  @Post("verification")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("EMPLOYER")
  @HttpCode(HttpStatus.OK)
  async submitVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(submitVerificationSchema))
    body: SubmitVerificationDto,
  ) {
    this.rateLimitService.enforce(
      `employer-submit-verification:${user.id}`,
      RATE_LIMITS.SUBMIT_VERIFICATION.limit,
      RATE_LIMITS.SUBMIT_VERIFICATION.windowMs,
    );
    await this.employerService.submitVerification(user.id, body);
    return { message: "Verification email sent" };
  }

  // Unauthenticated by design — the token in the body is itself the proof,
  // same as POST /auth/reset-password. The link in the verification email
  // must be clickable without an active session.
  @ApiConfirmVerification()
  @Post("verification/confirm")
  @HttpCode(HttpStatus.OK)
  async confirmVerification(
    @Body(new ZodValidationPipe(confirmVerificationSchema))
    body: ConfirmVerificationDto,
  ) {
    await this.employerService.confirmVerification(body);
    return { message: "Company email verified" };
  }
}
