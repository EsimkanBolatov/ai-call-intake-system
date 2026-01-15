export interface Case {
  id: string;
  title: string;
  description: string;
  status: string;
  phoneNumber?: string;
  transcription?: string;
  textVersion?: string;
  category?: string; // срочный, нормальный, просто
  serviceType?: "fire" | "emergency" | "ambulance" | "police" | "other"; // пожарный, ЧС, скорая, полиция, другое
  priority: "low" | "medium" | "high";
  audioUrl?: string;
  isCompleted: boolean;
  completedAt?: string;
  operatorId?: string;
  assigneeId?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface CasesResponse {
  cases: Case[];
  total: number;
  page: number;
  limit: number;
}
