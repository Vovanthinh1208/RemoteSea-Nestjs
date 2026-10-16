import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { TeamService } from "./team.service";
import {
  inviteMemberSchema,
  type InviteMemberDto,
} from "./dto/invite-member.dto";
import {
  acceptInvitationSchema,
  type AcceptInvitationDto,
} from "./dto/accept-invitation.dto";
import {
  updateMemberRoleSchema,
  type UpdateMemberRoleDto,
} from "./dto/update-member-role.dto";
import { RATE_LIMITS } from "./constants";
import { CompanyMemberOwnershipGuard } from "./guards/company-member-ownership.guard";
import type { MemberForOwnership } from "./interfaces";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/core/decorators/roles.decorator";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { CurrentResource } from "@/common/authorization/current-resource.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiAcceptInvitation,
  ApiInviteMember,
  ApiListInvitations,
  ApiListMembers,
  ApiPreviewInvitation,
  ApiRemoveMember,
  ApiRevokeInvitation,
  ApiTeamTag,
  ApiUpdateMemberRole,
} from "./docs/team.swagger";

@ApiTeamTag()
@Controller("team")
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @ApiListMembers()
  @Get("members")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("EMPLOYER")
  listMembers(@CurrentUser() user: AuthenticatedUser) {
    return this.teamService.listMembers(user.id);
  }

  @ApiListInvitations()
  @Get("invitations")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("EMPLOYER")
  listInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.teamService.listPendingInvitations(user.id);
  }

  @ApiInviteMember()
  @Post("invitations")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("EMPLOYER")
  @HttpCode(HttpStatus.CREATED)
  async inviteMember(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMemberDto,
  ) {
    this.rateLimitService.enforce(
      `team-invite-member:${user.id}`,
      RATE_LIMITS.INVITE_MEMBER.limit,
      RATE_LIMITS.INVITE_MEMBER.windowMs,
    );
    return this.teamService.inviteMember(user.id, body);
  }

  @ApiAcceptInvitation()
  @Post("invitations/accept")
  @UseGuards(JwtAuthGuard)
  async acceptInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    body: AcceptInvitationDto,
  ) {
    this.rateLimitService.enforce(
      `team-accept-invitation:${user.id}`,
      RATE_LIMITS.ACCEPT_INVITATION.limit,
      RATE_LIMITS.ACCEPT_INVITATION.windowMs,
    );
    return this.teamService.acceptInvitation(user, body);
  }

  // Public — an invited person has no account (and no JWT) yet when they
  // first open this link, same reasoning as the invitation itself only
  // needing an email, not an internal id. Distinct path shape from GET
  // "invitations" (no id) above, so there's no route-matching ambiguity.
  @ApiPreviewInvitation()
  @Get("invitations/:token")
  previewInvitation(@Param("token") token: string) {
    return this.teamService.previewInvitation(token);
  }

  @ApiRevokeInvitation()
  @Delete("invitations/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("EMPLOYER")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    await this.teamService.revokeInvitation(user.id, id);
  }

  @ApiUpdateMemberRole()
  @Patch("members/:id")
  @UseGuards(JwtAuthGuard, RolesGuard, CompanyMemberOwnershipGuard)
  @Roles("EMPLOYER")
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentResource() member: MemberForOwnership,
    @Body(new ZodValidationPipe(updateMemberRoleSchema))
    body: UpdateMemberRoleDto,
  ) {
    return this.teamService.updateMemberRole(member, body, user.id);
  }

  @ApiRemoveMember()
  @Delete("members/:id")
  @UseGuards(JwtAuthGuard, RolesGuard, CompanyMemberOwnershipGuard)
  @Roles("EMPLOYER")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(@CurrentResource() member: MemberForOwnership) {
    await this.teamService.removeMember(member);
  }
}
