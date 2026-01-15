import axios from "axios";
import type { CasesResponse, Case } from "../types/case";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Добавляем интерцептор для JWT токена
apiClient.interceptors.request.use((config: any) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const casesApi = {
  getCases: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    priority?: string;
    serviceType?: string;
  }) => {
    const response = await apiClient.get<Case[]>("/cases", { params });
    // преобразуем массив в объект с пагинацией (для совместимости)
    return {
      cases: response.data,
      total: response.data.length,
      page: params?.page || 1,
      limit: params?.limit || response.data.length,
    };
  },

  getCaseById: async (id: string) => {
    const response = await apiClient.get(`/cases/${id}`);
    return response.data;
  },

  createCase: async (data: FormData) => {
    const response = await apiClient.post("/cases", data, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  updateCase: async (id: string, data: Partial<any>) => {
    const response = await apiClient.patch(`/cases/${id}`, data);
    return response.data;
  },

  updateCaseServiceType: async (id: string, serviceType: string) => {
    const response = await apiClient.put(`/cases/${id}/service-type`, {
      serviceType,
    });
    return response.data;
  },

  deleteCase: async (id: string) => {
    const response = await apiClient.delete(`/cases/${id}`);
    return response.data;
  },

  createIncomingCall: async (data: {
    phoneNumber: string;
    transcription?: string;
    audioUrl?: string;
  }) => {
    const response = await apiClient.post("/cases/incoming-call", data);
    return response.data;
  },
};

export const authApi = {
  login: async (credentials: { email: string; password: string }) => {
    const response = await apiClient.post("/auth/login", credentials);
    return response.data;
  },

  register: async (userData: any) => {
    const response = await apiClient.post("/auth/register", userData);
    return response.data;
  },

  refreshToken: async () => {
    const response = await apiClient.post("/auth/refresh");
    return response.data;
  },

  logout: async () => {
    const response = await apiClient.post("/auth/logout");
    return response.data;
  },
};

export const aiApi = {
  transcribe: async (audioFile: File) => {
    const formData = new FormData();
    formData.append("audio", audioFile);
    const response = await apiClient.post("/ai/transcribe", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  classify: async (text: string) => {
    const response = await apiClient.post("/ai/classify", { text });
    return response.data;
  },

  prioritize: async (text: string) => {
    const response = await apiClient.post("/ai/prioritize", { text });
    return response.data;
  },
};

export const organizationsApi = {
  getAll: async () => {
    const response = await apiClient.get("/organizations");
    return response.data;
  },
};

export const analyticsApi = {
  getDashboardStats: async () => {
    const response = await apiClient.get("/analytics/dashboard");
    return response.data;
  },

  getHeatmapData: async () => {
    const response = await apiClient.get("/analytics/heatmap");
    return response.data;
  },

  getTrends: async (period: string) => {
    const response = await apiClient.get(`/analytics/trends?period=${period}`);
    return response.data;
  },
};

export default apiClient;
