import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from "@nestjs/common";
import { SavedService } from "./saved.service";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { ApiListSaved, ApiSavedTag, ApiSaveJob, ApiUnsaveJob } from "./docs/saved.swagger";

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

  @ApiSaveJob()
  @Put(":jobId")
  @HttpCode(HttpStatus.OK)
  save(@CurrentUser() user: AuthenticatedUser, @Param("jobId") jobId: string) {
    return this.savedService.save(user.id, jobId);
  }

  @ApiUnsaveJob()
  @Delete(":jobId")
  @HttpCode(HttpStatus.OK)
  unsave(@CurrentUser() user: AuthenticatedUser, @Param("jobId") jobId: string) {
    return this.savedService.unsave(user.id, jobId);
  }
}
