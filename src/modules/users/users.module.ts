import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { UsersRepository } from "./users.repository";
import { UploadsModule } from "@/modules/uploads/uploads.module";
import { AuthModule } from "@/modules/auth/auth.module";

@Module({
  imports: [UploadsModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
})
export class UsersModule {}
