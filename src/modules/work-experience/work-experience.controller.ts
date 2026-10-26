import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { WorkExperienceService } from "./work-experience.service";
import {
  createWorkExperienceSchema,
  type CreateWorkExperienceDto,
} from "./dto/create-work-experience.dto";
import {
  updateWorkExperienceSchema,
  type UpdateWorkExperienceDto,
} from "./dto/update-work-experience.dto";
import {
  WorkExperienceOwnershipGuard,
  type WorkExperienceWithOwner,
} from "./guards/work-experience-ownership.guard";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { CurrentResource } from "@/common/authorization/current-resource.decorator";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import {
  ApiCreateWorkExperience,
  ApiDeleteWorkExperience,
  ApiListWorkExperience,
  ApiUpdateWorkExperience,
  ApiWorkExperienceTag,
} from "./docs/work-experience.swagger";

@ApiWorkExperienceTag()
@Controller("talent/me/experience")
export class WorkExperienceController {
  constructor(private readonly workExperienceService: WorkExperienceService) {}

  @ApiListWorkExperience()
  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.workExperienceService.listForUser(user.id);
  }

  @ApiCreateWorkExperience()
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createWorkExperienceSchema))
    body: CreateWorkExperienceDto,
  ) {
    return this.workExperienceService.create(user.id, body);
  }

  @ApiUpdateWorkExperience()
  @Patch(":id")
  @UseGuards(JwtAuthGuard, WorkExperienceOwnershipGuard)
  update(
    @CurrentResource() experience: WorkExperienceWithOwner,
    @Body(new ZodValidationPipe(updateWorkExperienceSchema))
    body: UpdateWorkExperienceDto,
  ) {
    return this.workExperienceService.update(experience, body);
  }

  @ApiDeleteWorkExperience()
  @Delete(":id")
  @UseGuards(JwtAuthGuard, WorkExperienceOwnershipGuard)
  remove(@CurrentResource() experience: WorkExperienceWithOwner) {
    return this.workExperienceService.remove(experience.id);
  }
}
