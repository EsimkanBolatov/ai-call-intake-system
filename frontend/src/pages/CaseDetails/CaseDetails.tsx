import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Button,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  TextField,
  Card,
  CardContent,
  CardMedia,
  LinearProgress,
} from "@mui/material";
import {
  ArrowBack,
  Edit,
  Save,
  Cancel,
  PlayArrow,
  Pause,
  Download,
  Map,
  Person,
  Phone,
  Email,
  LocationOn,
  AccessTime,
  PriorityHigh,
} from "@mui/icons-material";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { casesApi } from "../../services/api";
import type { Case } from "../../types/case";

const CaseDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Case>>({});

  const { data: caseData, isLoading } = useQuery({
    queryKey: ["case", id],
    queryFn: () => casesApi.getCaseById(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Case>) => casesApi.updateCase(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", id] });
      setIsEditing(false);
    },
  });

  useEffect(() => {
    if (caseData) {
      setEditData(caseData);
    }
  }, [caseData]);

  const handleSave = () => {
    updateMutation.mutate(editData);
  };

  const handleCancel = () => {
    setEditData(caseData || {});
    setIsEditing(false);
  };

  if (isLoading) {
    return <LinearProgress />;
  }

  if (!caseData) {
    return <Typography variant="h6">Обращение не найдено</Typography>;
  }

  const caseItem = caseData as Case;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "info";
      case "in_progress":
        return "warning";
      case "completed":
        return "success";
      case "rejected":
        return "error";
      default:
        return "default";
    }
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

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={3}>
        <IconButton onClick={() => navigate("/cases")}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" fontWeight="bold">
          Карточка обращения #{caseItem.id}
        </Typography>
        <Chip
          label={caseItem.status}
          color={getStatusColor(caseItem.status) as any}
          sx={{ ml: 2 }}
        />
        <Chip
          label={`Приоритет: ${caseItem.priority}`}
          color={getPriorityColor(caseItem.priority) as any}
        />
        <Box sx={{ flexGrow: 1 }} />
        {isEditing ? (
          <>
            <Button
              variant="contained"
              startIcon={<Save />}
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              Сохранить
            </Button>
            <Button
              variant="outlined"
              startIcon={<Cancel />}
              onClick={handleCancel}
            >
              Отмена
            </Button>
          </>
        ) : (
          <Button
            variant="outlined"
            startIcon={<Edit />}
            onClick={() => setIsEditing(true)}
          >
            Редактировать
          </Button>
        )}
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Основная информация
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="ФИО заявителя"
                  fullWidth
                  value={
                    isEditing
                      ? editData.applicantName || ""
                      : caseItem.applicantName
                  }
                  onChange={(e) =>
                    setEditData({ ...editData, applicantName: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Телефон"
                  fullWidth
                  value={
                    isEditing
                      ? editData.applicantPhone || ""
                      : caseItem.applicantPhone || ""
                  }
                  onChange={(e) =>
                    setEditData({ ...editData, applicantPhone: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Описание нарушения"
                  multiline
                  rows={4}
                  fullWidth
                  value={
                    isEditing
                      ? editData.description || ""
                      : caseItem.description
                  }
                  onChange={(e) =>
                    setEditData({ ...editData, description: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Тип нарушения"
                  fullWidth
                  value={
                    isEditing
                      ? editData.violationType || ""
                      : caseItem.violationType
                  }
                  onChange={(e) =>
                    setEditData({ ...editData, violationType: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Ответственный орган"
                  fullWidth
                  value={
                    isEditing
                      ? editData.responsibleOrg || ""
                      : caseItem.responsibleOrg
                  }
                  onChange={(e) =>
                    setEditData({ ...editData, responsibleOrg: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </Grid>
            </Grid>
          </Paper>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              AI-анализ
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="textSecondary">
                  Классификация
                </Typography>
                <Typography variant="body1">
                  {caseItem.aiClassification?.type || "Не определена"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="textSecondary">
                  Уверенность
                </Typography>
                <Typography variant="body1">
                  {caseItem.aiClassification?.confidence
                    ? `${(caseItem.aiClassification.confidence * 100).toFixed(
                        1
                      )}%`
                    : "Н/Д"}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="textSecondary">
                  Транскрипция аудио
                </Typography>
                <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
                  <Typography variant="body2">
                    {caseItem.transcript || "Транскрипция отсутствует"}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              История обработки
            </Typography>
            <List>
              <ListItem>
                <ListItemText
                  primary="Создано"
                  secondary={new Date(caseItem.createdAt).toLocaleString(
                    "ru-RU"
                  )}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Последнее обновление"
                  secondary={new Date(caseItem.updatedAt).toLocaleString(
                    "ru-RU"
                  )}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Назначено на"
                  secondary={caseItem.assignedTo || "Не назначено"}
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Аудиозапись
            </Typography>
            <Card>
              <CardMedia
                component="img"
                height="140"
                image="/placeholder-audio-wave.png"
                alt="Audio waveform"
              />
              <CardContent>
                <Stack direction="row" spacing={1} justifyContent="center">
                  <IconButton color="primary">
                    <PlayArrow />
                  </IconButton>
                  <IconButton>
                    <Pause />
                  </IconButton>
                  <IconButton>
                    <Download />
                  </IconButton>
                </Stack>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  align="center"
                >
                  Длительность: 2:45
                </Typography>
              </CardContent>
            </Card>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<Download />}
              sx={{ mt: 2 }}
            >
              Скачать аудио
            </Button>
          </Paper>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Геолокация
            </Typography>
            <Box
              sx={{
                height: 200,
                bgcolor: "grey.200",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 1,
                mb: 2,
              }}
            >
              <Map sx={{ fontSize: 48, color: "grey.500" }} />
              <Typography variant="body2" color="textSecondary">
                Карта загружается...
              </Typography>
            </Box>
            <Typography variant="body2">
              <LocationOn
                fontSize="small"
                sx={{ verticalAlign: "middle", mr: 1 }}
              />
              {caseItem.location?.address || "Адрес не указан"}
            </Typography>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Быстрые действия
            </Typography>
            <Stack spacing={2}>
              <Button variant="contained" color="primary">
                Передать в орган
              </Button>
              <Button variant="outlined" color="secondary">
                Изменить статус
              </Button>
              <Button variant="outlined" color="error">
                Отклонить обращение
              </Button>
              <Button variant="outlined">Добавить комментарий</Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CaseDetails;
