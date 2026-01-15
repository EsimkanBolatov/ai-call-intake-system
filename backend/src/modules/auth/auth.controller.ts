import { Controller, Post, Body, UseGuards, Request } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LocalAuthGuard } from "./guards/local-auth.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post("login")
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Post("register")
  async register(
    @Body("email") email: string,
    @Body("password") password: string,
    @Body("name") name: string
  ) {
    return this.authService.register(email, password, name);
  }

  @UseGuards(JwtAuthGuard)
  @Post("profile")
  getProfile(@Request() req) {
    return req.user;
  }
}
