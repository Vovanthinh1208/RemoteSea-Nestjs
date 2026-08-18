import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { InvitationsService } from "./invitations.service";
import {
  sendInvitationSchema,
  type SendInvitationDto,
} from "./dto/send-invitation.dto";
import {
  respondInvitationSchema,
  type RespondInvitationDto,
} from "./dto/respond-invitation.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/core/decorators/roles.decorator";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiInvitationsTag,
  ApiListInvitations,
  ApiRespondInvitation,
  ApiSendInvitation,
} from "./docs/invitations.swagger";

@ApiInvitationsTag()
@Controller("invitations")
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @ApiSendInvitation()
  @Post()
  @UseGuards(RolesGuard)
  @Roles("EMPLOYER")
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(sendInvitationSchema)) body: SendInvitationDto,
  ) {
    this.rateLimitService.enforce(
      `invitation-send:${user.id}`,
      RATE_LIMITS.SEND.limit,
      RATE_LIMITS.SEND.windowMs,
    );
    return this.invitationsService.send(user, body);
  }

  @ApiListInvitations()
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.invitationsService.listForTalent(user.id);
  }

  @ApiRespondInvitation()
  @Patch(":id")
  respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(respondInvitationSchema))
    body: RespondInvitationDto,
  ) {
    return this.invitationsService.respond(user.id, id, body);
  }
}
