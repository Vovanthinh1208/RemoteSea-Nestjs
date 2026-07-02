import { Body, Controller, Get, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { SavedService } from "./saved.service";
import { saveSchema, type SaveJobDto } from "./dto/save-job.dto";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { ApiListSaved, ApiSavedTag, ApiToggleSaved } from "./docs/saved.swagger";

@ApiSavedTag()
@Controller("saved")
@UseGuards(JwtAuthGuard)
export class SavedController {
  constructor(private readonly savedService: SavedService) {}

  @ApiListSaved()
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.savedService.findAllForUser(user.id);
  }

  @ApiToggleSaved()
  @Post()
  async toggle(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(saveSchema)) body: SaveJobDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { result, created } = await this.savedService.toggle(user.id, body);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }
}
