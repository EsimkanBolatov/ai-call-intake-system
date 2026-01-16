import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

// Modules
import { VoiceCallModule } from './modules/voice-call/voice-call.module';
import { CasesModule } from './modules/cases/cases.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';

// Configuration
import { configuration } from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        autoLoadEntities: true,
        synchronize: true, // В продакшене лучше false
      }),
    }),
    
    // ✅ Оставляем только нужные модули
    VoiceCallModule, 
    CasesModule,
    UsersModule,
    AuthModule,
    ReportsModule,
    TelegramModule,
    OrganizationsModule,
    
    // ❌ УДАЛИТЕ СТРОКУ: AiModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}