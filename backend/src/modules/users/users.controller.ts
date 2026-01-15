import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { UsersService } from "./users.service";
import { User } from "./user.entity";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles("admin")
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Get(":id")
  @Roles("admin", "operator")
  findOne(@Param("id") id: string): Promise<User> {
    return this.usersService.findById(id);
  }

  @Post()
  @Roles("admin")
  create(@Body() userData: Partial<User>): Promise<User> {
    return this.usersService.create(userData);
  }
}
