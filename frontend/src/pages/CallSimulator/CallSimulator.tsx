import React, { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Stack,
  Chip,
  Divider,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Snackbar,
} from "@mui/material";
import {
  Phone,
  Send,
  Refresh,
  PriorityHigh,
  LocalFireDepartment,
  Emergency,
  LocalHospital,
  Security,
  Notifications,
  EditNote,
  Mic, // Добавлена иконка микрофона
} from "@mui/icons-material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { casesApi, aiApi } from "../../services/api";
import { useNavigate } from "react-router-dom";
import ActiveCallModal from '../../components/VoiceCall/ActiveCallModal'; // Импорт компонента

const CallSimulator: React.FC = () => {
  // Состояние для управления модальным окном звонка
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  const [callText, setCallText] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState<string>("+77071234567");
  const [analysisResult, setAnalysisResult] = useState<{
    category: string;
    priority: string;
    serviceType: string;
    emotion?: string;
    keywords: string[];
  } | null>(null);
  const [createdCase, setCreatedCase] = useState<any>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({
    open: false,
    message: "",
    severity: "info",
  });

  // Уведомление о симуляции вызова (отдельный Snackbar)
  const [callNotification, setCallNotification] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({
    open: false,
    message: "",
    severity: "info",
  });

  // Плашка над полем ввода, показывается при вводе текста
  const [inputNotification, setInputNotification] = useState<{
    show: boolean;
    message: string;
  }>({
    show: false,
    message: "",
  });

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const analyzeMutation = useMutation({
    mutationFn: (text: string) => aiApi.classify(text),
    onSuccess: (data) => {
      setAnalysisResult({
        category: data.categories?.[0] || "просто",
        priority: data.priority || "low",
        serviceType: data.serviceType || "other",
        emotion: data.emotion,
        keywords: data.keywords || [],
      });
      setSnackbar({
        open: true,
        message: "Анализ завершён. Определены категория, приоритет и служба.",
        severity: "success",
      });
    },
    onError: () => {
      setAnalysisResult({
        category: "просто",
        priority: "low",
        serviceType: "other",
        keywords: [],
      });
      setSnackbar({
        open: true,
        message: "Ошибка анализа. Используются значения по умолчанию.",
        severity: "error",
      });
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: (data: { phoneNumber: string; transcription: string }) =>
      casesApi.createIncomingCall(data),
    onSuccess: (data) => {
      setCreatedCase(data);
      // Invalidate queries to refresh cases list and dashboard
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      // Показать уведомление о симуляции
      const truncatedText =
        callText.length > 50 ? callText.substring(0, 50) + "..." : callText;
      setCallNotification({
        open: true,
        message: `Обращение создано: "${truncatedText}". Запись добавлена в журнал.`,
        severity: "success",
      });
    },
    onError: (error) => {
      setCallNotification({
        open: true,
        message: `Ошибка создания обращения: ${error.message}`,
        severity: "error",
      });
    },
  });

  const handleCallTextChange = (text: string) => {
    setCallText(text);
    // Показываем плашку, если текст не пустой
    if (text.trim().length > 0) {
      setInputNotification({
        show: true,
        message: "Идёт ввод обращения...",
      });
    } else {
      setInputNotification({ show: false, message: "" });
    }
  };

  const handleAnalyze = () => {
    if (!callText.trim()) return;
    analyzeMutation.mutate(callText);
  };

  const handleSimulateCall = () => {
    if (!callText.trim()) return;
    createCaseMutation.mutate({
      phoneNumber,
      transcription: callText,
    });
  };

  const handleReset = () => {
    setCallText("");
    setAnalysisResult(null);
    setCreatedCase(null);
  };

  const handleViewCase = () => {
    if (createdCase?.id) {
      navigate(`/cases/${createdCase.id}`);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const handleCloseCallNotification = () => {
    setCallNotification((prev) => ({ ...prev, open: false }));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "error";
      case "medium":
        return "warning";
      case "low":
        return "success";
      default:
        return "default";
    }
  };

  const getServiceIcon = (serviceType: string) => {
    switch (serviceType) {
      case "fire":
        return <LocalFireDepartment />;
      case "emergency":
        return <Emergency />;
      case "ambulance":
        return <LocalHospital />;
      case "police":
        return <Security />;
      default:
        return <Phone />;
    }
  };

  const getServiceLabel = (serviceType: string) => {
    switch (serviceType) {
      case "fire":
        return "Пожарный";
      case "emergency":
        return "ЧС";
      case "ambulance":
        return "Скорая";
      case "police":
        return "Полиция";
      default:
        return "Другое";
    }
  };

  const exampleTexts = [
    "У меня в доме пожар, помогите!",
    "Произошло ДТП на пересечении улиц Жибек жолы и Абая, есть пострадавшие.",
    "Сосед шумит, не даёт спать.",
    "Вижу подозрительного человека с ножом во дворе.",
    "У меня сильная боль в груди, нужна скорая.",
  ];

  const loadExample = (text: string) => {
    setCallText(text);
    setAnalysisResult(null);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Симулятор экстренного вызова
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Имитация входящего звонка в службу 112. Введите текст обращения для
        анализа или воспользуйтесь голосовым режимом.
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 3,
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Ввод обращения
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Номер телефона"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                fullWidth
              />
              {inputNotification.show && (
                <Alert
                  severity="info"
                  icon={<EditNote />}
                  onClose={() =>
                    setInputNotification({ show: false, message: "" })
                  }
                >
                  {inputNotification.message}
                </Alert>
              )}
              <TextField
                label="Текст обращения"
                multiline
                rows={6}
                value={callText}
                onChange={(e) => handleCallTextChange(e.target.value)}
                placeholder="Опишите ситуацию подробно..."
                fullWidth
              />
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Typography variant="body2" sx={{ alignSelf: "center" }}>
                  Примеры:
                </Typography>
                {exampleTexts.map((text, idx) => (
                  <Chip
                    key={idx}
                    label={text.substring(0, 30) + "..."}
                    size="small"
                    onClick={() => loadExample(text)}
                    sx={{ mb: 1 }}
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Button
                  variant="contained"
                  startIcon={<Send />}
                  onClick={handleAnalyze}
                  disabled={!callText.trim() || analyzeMutation.isPending}
                >
                  {analyzeMutation.isPending ? (
                    <CircularProgress size={20} />
                  ) : (
                    "Анализировать"
                  )}
                </Button>
                
                {/* Новая кнопка для голосового вызова */}
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<Mic />}
                  onClick={() => setIsVoiceModalOpen(true)}
                >
                  Голосовой вызов (Demo)
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={handleReset}
                >
                  Сброс
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {analysisResult && (
            <Paper sx={{ p: 3, mt: 3 }}>
              <Typography variant="h6" gutterBottom>
                Результаты анализа ИИ
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                <Card variant="outlined" sx={{ flex: "1 1 200px" }}>
                  <CardContent>
                    <Typography variant="subtitle2">Категория</Typography>
                    <Chip
                      label={analysisResult.category}
                      color={
                        analysisResult.category === "срочный"
                          ? "error"
                          : "default"
                      }
                      sx={{ mt: 1 }}
                    />
                  </CardContent>
                </Card>
                <Card variant="outlined" sx={{ flex: "1 1 200px" }}>
                  <CardContent>
                    <Typography variant="subtitle2">Приоритет</Typography>
                    <Chip
                      label={analysisResult.priority}
                      color={getPriorityColor(analysisResult.priority) as any}
                      icon={<PriorityHigh />}
                      sx={{ mt: 1 }}
                    />
                  </CardContent>
                </Card>
                <Card variant="outlined" sx={{ flex: "1 1 100%" }}>
                  <CardContent>
                    <Typography variant="subtitle2">
                      Рекомендуемая служба
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={2}
                      alignItems="center"
                      mt={1}
                    >
                      {getServiceIcon(analysisResult.serviceType)}
                      <Typography variant="h6">
                        {getServiceLabel(analysisResult.serviceType)}
                      </Typography>
                      <Chip
                        label={analysisResult.serviceType}
                        variant="outlined"
                      />
                    </Stack>
                  </CardContent>
                </Card>
                {analysisResult.emotion && (
                  <Card variant="outlined" sx={{ flex: "1 1 100%" }}>
                    <CardContent>
                      <Typography variant="subtitle2">
                        Эмоциональный фон
                      </Typography>
                      <Typography variant="body1">
                        {analysisResult.emotion}
                      </Typography>
                    </CardContent>
                  </Card>
                )}
                {analysisResult.keywords.length > 0 && (
                  <Card variant="outlined" sx={{ flex: "1 1 100%" }}>
                    <CardContent>
                      <Typography variant="subtitle2">
                        Ключевые слова
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
                        {analysisResult.keywords.map((kw, idx) => (
                          <Chip key={idx} label={kw} size="small" />
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                )}
              </Box>
            </Paper>
          )}
        </Box>

        <Box sx={{ flex: 1 }}>
          <Paper sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" gutterBottom>
              Создание карточки обращения
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              После анализа можно создать карточку обращения в системе. Она
              появится в журнале обращений и на дашборде.
            </Typography>

            <Stack spacing={2}>
              <Button
                variant="contained"
                startIcon={<Phone />}
                onClick={handleSimulateCall}
                disabled={
                  !callText.trim() ||
                  createCaseMutation.isPending ||
                  !analysisResult
                }
                fullWidth
                size="large"
              >
                {createCaseMutation.isPending ? (
                  <CircularProgress size={24} />
                ) : (
                  "Создать обращение"
                )}
              </Button>

              {createCaseMutation.isError && (
                <Alert severity="error">
                  Ошибка при создании обращения:{" "}
                  {createCaseMutation.error?.message}
                </Alert>
              )}

              {createdCase && (
                <Alert severity="success">
                  Обращение успешно создано! ID: {createdCase.id}
                  <Button size="small" onClick={handleViewCase} sx={{ ml: 2 }}>
                    Перейти к карточке
                  </Button>
                </Alert>
              )}

              <Divider />

              <Typography variant="subtitle2">Инструкция</Typography>
              <Typography variant="body2">
                1. Введите текст обращения или используйте пример.
                <br />
                2. Нажмите "Анализировать" для определения категории, приоритета
                и службы.
                <br />
                3. Нажмите "Создать обращение" для добавления в систему.
                <br />
                4. Перейдите в журнал обращений, чтобы увидеть новую запись.
              </Typography>

              <Divider />

              <Typography variant="subtitle2">Соответствие ТЗ</Typography>
              <Stack spacing={1}>
                <Chip label="Модуль ASR/NLP" color="primary" size="small" />
                <Chip
                  label="Классификация происшествий"
                  color="primary"
                  size="small"
                />
                <Chip label="Приоритизация" color="primary" size="small" />
                <Chip label="Определение службы" color="primary" size="small" />
                <Chip label="Симуляция звонка" color="primary" size="small" />
              </Stack>
            </Stack>
          </Paper>
        </Box>
      </Box>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Как это работает в реальной системе
        </Typography>
        <Typography variant="body2">
          В реальном развёртывании платформы «Jedel» модуль интеллектуальной
          речевой аналитики (ASR & NLP) будет работать в режиме реального
          времени:
        </Typography>
        <ul>
          <li>Автоматическое распознавание речи с поддержкой диалектов.</li>
          <li>Детекция эмоций и стресса по голосу.</li>
          <li>Геолокация звонящего через Advanced Mobile Location.</li>
          <li>Видеотрансляция с места происшествия с анализом объектов.</li>
          <li>
            Smart Triage – автоматическая сортировка вызовов по критичности.
          </li>
        </ul>
        <Typography variant="body2">
          Данный симулятор демонстрирует ключевые возможности классификации и
          приоритизации, которые уже реализованы в системе.
        </Typography>
      </Paper>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Уведомление о симуляции вызова */}
      <Snackbar
        open={callNotification.open}
        autoHideDuration={6000}
        onClose={handleCloseCallNotification}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseCallNotification}
          severity={callNotification.severity}
          icon={<Notifications />}
          sx={{ width: "100%" }}
        >
          {callNotification.message}
        </Alert>
      </Snackbar>

      {/* Модальное окно активного звонка */}
      <ActiveCallModal
        open={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
      />
    </Box>
  );
};

export default CallSimulator;