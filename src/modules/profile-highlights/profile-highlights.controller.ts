import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ProfileHighlightsService } from "./profile-highlights.service";
import {
  createProfileHighlightSchema,
  type CreateProfileHighlightDto,
} from "./dto/create-profile-highlight.dto";
import {
  updateProfileHighlightSchema,
  type UpdateProfileHighlightDto,
} from "./dto/update-profile-highlight.dto";
import {
  ProfileHighlightOwnershipGuard,
  type ProfileHighlightWithOwner,
} from "./guards/profile-highlight-ownership.guard";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { CurrentResource } from "@/common/authorization/current-resource.decorator";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiCreateProfileHighlight,
  ApiDeleteProfileHighlight,
  ApiListProfileHighlights,
  ApiProfileHighlightsTag,
  ApiUpdateProfileHighlight,
} from "./docs/profile-highlights.swagger";

@ApiProfileHighlightsTag()
@Controller("talent/me/highlights")
export class ProfileHighlightsController {
  constructor(
    private readonly profileHighlightsService: ProfileHighlightsService,
  ) {}

  @ApiListProfileHighlights()
  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.profileHighlightsService.listForUser(user.id);
  }

  @ApiCreateProfileHighlight()
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createProfileHighlightSchema))
    body: CreateProfileHighlightDto,
  ) {
    return this.profileHighlightsService.create(user.id, body);
  }

  @ApiUpdateProfileHighlight()
  @Patch(":id")
  @UseGuards(JwtAuthGuard, ProfileHighlightOwnershipGuard)
  update(
    @CurrentResource() highlight: ProfileHighlightWithOwner,
    @Body(new ZodValidationPipe(updateProfileHighlightSchema))
    body: UpdateProfileHighlightDto,
  ) {
    return this.profileHighlightsService.update(highlight.id, body);
  }

  @ApiDeleteProfileHighlight()
  @Delete(":id")
  @UseGuards(JwtAuthGuard, ProfileHighlightOwnershipGuard)
  remove(@CurrentResource() highlight: ProfileHighlightWithOwner) {
    return this.profileHighlightsService.remove(highlight.id);
  }
}
