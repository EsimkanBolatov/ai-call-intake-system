import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Case } from "./case.entity";
import axios from "axios";

@Injectable()
export class CasesService {
  private readonly logger = new Logger(CasesService.name);

  constructor(
    @InjectRepository(Case)
    private casesRepository: Repository<Case>
  ) {}

  async findAll(filters?: {
    phoneNumber?: string;
    status?: string;
    priority?: string;
    serviceType?: string;
  }): Promise<Case[]> {
    const where: any = {};
    if (filters?.phoneNumber) {
      where.phoneNumber = filters.phoneNumber;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.priority) {
      where.priority = filters.priority;
    }
    if (filters?.serviceType) {
      where.serviceType = filters.serviceType;
    }
    return this.casesRepository.find({ where, order: { createdAt: "DESC" } });
  }

  async create(caseData: Partial<Case>): Promise<Case> {
    const newCase = this.casesRepository.create(caseData);
    return this.casesRepository.save(newCase);
  }

  async findOne(id: string): Promise<Case> {
    return this.casesRepository.findOne({ where: { id } });
  }

  async createFromCall(
    phoneNumber: string,
    audioUrl?: string,
    transcription?: string
  ): Promise<Case> {
    this.logger.log(`Creating case from call: ${phoneNumber}`);

    // Step 1: Transcribe audio via AI module if audioUrl provided and no transcription
    let finalTranscription = transcription || "";
    if (audioUrl && !transcription) {
      finalTranscription = await this.transcribeAudio(audioUrl);
    }

    // Step 2: Classify text
    let category = "просто";
    let priority = "low";
    let serviceType = "other";
    if (finalTranscription) {
      const classification = await this.classifyText(finalTranscription);
      category = classification.category;
      priority = classification.priority;
      serviceType = classification.serviceType || "other";
    }

    // Step 3: Create case
    const newCase = this.casesRepository.create({
      title: `Звонок от ${phoneNumber}`,
      description: `Входящий звонок с номера ${phoneNumber}`,
      phoneNumber,
      transcription: finalTranscription,
      textVersion: finalTranscription,
      category,
      serviceType,
      priority,
      audioUrl,
      status: "pending",
      isCompleted: false,
      createdAt: new Date(),
    });

    const saved = await this.casesRepository.save(newCase);

    // Step 4: Auto-assign to available operator (simplified)
    await this.autoAssign(saved.id);

    return saved;
  }

  private async transcribeAudio(audioUrl: string): Promise<string> {
    try {
      // Call AI module transcription endpoint
      const response = await axios.post("http://localhost:8001/transcribe", {
        audio_url: audioUrl,
        language: "ru",
      });
      return response.data.text || "";
    } catch (error) {
      this.logger.error(`Transcription failed: ${error.message}`);
      return "";
    }
  }

  private async classifyText(
    text: string
  ): Promise<{ category: string; priority: string; serviceType?: string }> {
    try {
      const response = await axios.post("http://localhost:8001/classify", {
        text,
      });
      const aiCategory = response.data.categories?.[0] || "просто";
      let priority = response.data.priority || "low";

      // Эвристика для определения приоритета по ключевым словам
      const lowerText = text.toLowerCase();
      const highPriorityKeywords = [
        "оружие",
        "драка",
        "нож",
        "стрельба",
        "террорист",
        "взрыв",
        "заложник",
        "убийство",
        "нападение",
        "грабеж",
        "разбой",
        "пожар",
        "взрывчатка",
        "опасность",
        "срочно",
        "помогите",
        "спасите",
      ];
      const mediumPriorityKeywords = [
        "боль",
        "ранен",
        "пострадавший",
        "дтп",
        "авария",
        "травма",
        "несчастный случай",
        "кровь",
        "перелом",
        "сердце",
        "инфаркт",
        "инсульт",
        "давление",
      ];

      if (highPriorityKeywords.some((keyword) => lowerText.includes(keyword))) {
        priority = "high";
      } else if (
        mediumPriorityKeywords.some((keyword) => lowerText.includes(keyword))
      ) {
        priority = "medium";
      }

      // Determine serviceType based on AI category and keywords
      let serviceType = "other";
      // Маппинг категорий AI модуля к службам
      if (aiCategory === "срочный") {
        // Если срочный, уточняем по ключевым словам
        if (
          lowerText.includes("пожар") ||
          lowerText.includes("огонь") ||
          lowerText.includes("горит")
        ) {
          serviceType = "fire";
        } else if (
          lowerText.includes("дтп") ||
          lowerText.includes("авария") ||
          lowerText.includes("столкновение")
        ) {
          serviceType = "police";
        } else if (
          lowerText.includes("боль") ||
          lowerText.includes("скорая") ||
          lowerText.includes("врач") ||
          lowerText.includes("медик")
        ) {
          serviceType = "ambulance";
        } else if (
          lowerText.includes("оружие") ||
          lowerText.includes("драка") ||
          lowerText.includes("нож") ||
          lowerText.includes("грабеж")
        ) {
          serviceType = "police";
        } else if (
          lowerText.includes("чс") ||
          lowerText.includes("стихий") ||
          lowerText.includes("наводнение") ||
          lowerText.includes("землетрясение")
        ) {
          serviceType = "emergency";
        } else {
          serviceType = "police"; // по умолчанию для срочных
        }
      } else if (aiCategory === "нормальный") {
        serviceType = "police"; // нормальные обращения обычно полиция
      } else {
        serviceType = "other"; // простые обращения
      }

      // Переопределение службы по ключевым словам (если не определилось)
      if (serviceType === "other" || serviceType === "police") {
        if (
          lowerText.includes("пожар") ||
          lowerText.includes("огонь") ||
          lowerText.includes("горит")
        ) {
          serviceType = "fire";
        } else if (
          lowerText.includes("дтп") ||
          lowerText.includes("авария") ||
          lowerText.includes("столкновение")
        ) {
          serviceType = "police";
        } else if (
          lowerText.includes("боль") ||
          lowerText.includes("скорая") ||
          lowerText.includes("врач") ||
          lowerText.includes("медик")
        ) {
          serviceType = "ambulance";
        } else if (
          lowerText.includes("оружие") ||
          lowerText.includes("драка") ||
          lowerText.includes("нож") ||
          lowerText.includes("грабеж")
        ) {
          serviceType = "police";
        } else if (
          lowerText.includes("чс") ||
          lowerText.includes("стихий") ||
          lowerText.includes("наводнение") ||
          lowerText.includes("землетрясение")
        ) {
          serviceType = "emergency";
        }
      }

      // Для совместимости с фронтендом сохраняем категорию как есть
      const category = aiCategory;
      return {
        category,
        priority,
        serviceType,
      };
    } catch (error) {
      this.logger.error(`Classification failed: ${error.message}`);
      // Эвристика при ошибке
      const lowerText = text.toLowerCase();
      let priority = "low";
      if (
        lowerText.includes("оружие") ||
        lowerText.includes("драка") ||
        lowerText.includes("нож")
      ) {
        priority = "high";
      } else if (lowerText.includes("боль") || lowerText.includes("ранен")) {
        priority = "medium";
      }
      let serviceType = "other";
      if (
        lowerText.includes("пожар") ||
        lowerText.includes("огонь") ||
        lowerText.includes("горит")
      ) {
        serviceType = "fire";
      } else if (
        lowerText.includes("дтп") ||
        lowerText.includes("авария") ||
        lowerText.includes("столкновение")
      ) {
        serviceType = "police";
      } else if (
        lowerText.includes("боль") ||
        lowerText.includes("скорая") ||
        lowerText.includes("врач") ||
        lowerText.includes("медик")
      ) {
        serviceType = "ambulance";
      } else if (
        lowerText.includes("оружие") ||
        lowerText.includes("драка") ||
        lowerText.includes("нож") ||
        lowerText.includes("грабеж")
      ) {
        serviceType = "police";
      } else if (
        lowerText.includes("чс") ||
        lowerText.includes("стихий") ||
        lowerText.includes("наводнение") ||
        lowerText.includes("землетрясение")
      ) {
        serviceType = "emergency";
      }
      return { category: "просто", priority, serviceType };
    }
  }

  private async autoAssign(caseId: string): Promise<void> {
    this.logger.log(`Auto-assigning case ${caseId}`);
    // In a real implementation, we would query users with role "operator" and assign based on load.
    // For now, we'll just log and leave operatorId null.
    // You can extend this by injecting UserRepository and updating the case.
  }

  async updateStatus(id: string, status: string): Promise<Case> {
    const caseToUpdate = await this.findOne(id);
    if (!caseToUpdate) {
      throw new Error("Case not found");
    }
    caseToUpdate.status = status;
    if (status === "completed") {
      caseToUpdate.isCompleted = true;
      caseToUpdate.completedAt = new Date();
    }
    return this.casesRepository.save(caseToUpdate);
  }

  async assignToUser(id: string, userId: string): Promise<Case> {
    const caseToUpdate = await this.findOne(id);
    if (!caseToUpdate) {
      throw new Error("Case not found");
    }
    caseToUpdate.assigneeId = userId;
    caseToUpdate.status = "assigned";
    return this.casesRepository.save(caseToUpdate);
  }

  async markCompleted(id: string): Promise<Case> {
    return this.updateStatus(id, "completed");
  }

  async updateServiceType(id: string, serviceType: string): Promise<Case> {
    const caseToUpdate = await this.findOne(id);
    if (!caseToUpdate) {
      throw new Error("Case not found");
    }
    caseToUpdate.serviceType = serviceType;
    return this.casesRepository.save(caseToUpdate);
  }
}
