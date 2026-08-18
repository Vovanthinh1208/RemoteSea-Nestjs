import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { MessagesService } from "./messages.service";
import { sendMessageSchema, type SendMessageDto } from "./dto/send-message.dto";
import { RATE_LIMITS } from "./constants";
import {
  TalentApplicationOwnershipGuard,
  type TalentApplicationOwner,
} from "./guards/talent-application-ownership.guard";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { RolesGuard } from "@/core/guards/roles.guard";
import { Roles } from "@/core/decorators/roles.decorator";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { CurrentResource } from "@/common/authorization/current-resource.decorator";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiListMessages,
  ApiMessagesTag,
  ApiSendMessage,
} from "./docs/messages.swagger";

@ApiMessagesTag()
@Controller("applications")
@UseGuards(JwtAuthGuard, RolesGuard, TalentApplicationOwnershipGuard)
@Roles("TALENT")
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @ApiListMessages()
  @Get(":id/messages")
  list(@CurrentResource() application: TalentApplicationOwner) {
    return this.messagesService.list(application);
  }

  @ApiSendMessage()
  @Post(":id/messages")
  @HttpCode(HttpStatus.CREATED)
  send(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentResource() application: TalentApplicationOwner,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageDto,
  ) {
    this.rateLimitService.enforce(
      `send-message:${user.id}`,
      RATE_LIMITS.SEND_MESSAGE.limit,
      RATE_LIMITS.SEND_MESSAGE.windowMs,
    );
    return this.messagesService.send(application, user.id, body);
  }
}
