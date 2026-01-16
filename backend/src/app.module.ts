import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HealthController } from "./health.controller";
import configuration from "./config/configuration";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { CasesModule } from "./modules/cases/cases.module";
import { TelegramModule } from "./modules/telegram/telegram.module";
import { VoiceCallModule } from "./modules/voice-call/voice-call.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRoot({
      type: "sqlite",
      database: ":memory:",
      autoLoadEntities: true,
      synchronize: true,
    }),
    AuthModule,
    UsersModule,
    CasesModule,
    TelegramModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
