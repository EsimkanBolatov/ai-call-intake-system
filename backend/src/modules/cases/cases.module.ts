import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CasesService } from "./cases.service";
import { CasesController } from "./cases.controller";
import { Case } from "./case.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Case])],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
