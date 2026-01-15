import { Controller, Get, Post, Body, Param, Put, Query } from "@nestjs/common";
import { CasesService } from "./cases.service";
import { Case } from "./case.entity";

@Controller("cases")
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Get()
  async findAll(
    @Query("phoneNumber") phoneNumber?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("serviceType") serviceType?: string
  ): Promise<Case[]> {
    return this.casesService.findAll({
      phoneNumber,
      status,
      priority,
      serviceType,
    });
  }

  @Post()
  async create(@Body() caseData: Partial<Case>): Promise<Case> {
    return this.casesService.create(caseData);
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<Case> {
    return this.casesService.findOne(id);
  }

  @Post("incoming-call")
  async handleIncomingCall(
    @Body()
    body: {
      phoneNumber: string;
      audioUrl?: string;
      transcription?: string;
    }
  ): Promise<Case> {
    return this.casesService.createFromCall(
      body.phoneNumber,
      body.audioUrl,
      body.transcription
    );
  }

  @Put(":id/status")
  async updateStatus(
    @Param("id") id: string,
    @Body() body: { status: string }
  ): Promise<Case> {
    return this.casesService.updateStatus(id, body.status);
  }

  @Put(":id/assign")
  async assign(
    @Param("id") id: string,
    @Body() body: { userId: string }
  ): Promise<Case> {
    return this.casesService.assignToUser(id, body.userId);
  }

  @Put(":id/complete")
  async markCompleted(@Param("id") id: string): Promise<Case> {
    return this.casesService.markCompleted(id);
  }

  @Put(":id/service-type")
  async updateServiceType(
    @Param("id") id: string,
    @Body() body: { serviceType: string }
  ): Promise<Case> {
    return this.casesService.updateServiceType(id, body.serviceType);
  }
}
