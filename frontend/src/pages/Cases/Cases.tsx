import React, { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Button,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Snackbar,
  Alert,
} from "@mui/material";
import {
  Search,
  FilterList,
  Visibility,
  Edit,
  Delete,
  Refresh,
  LocalFireDepartment,
  Emergency,
  LocalHospital,
  Security,
  MoreHoriz,
} from "@mui/icons-material";
import { useQuery, useMutation } from "@tanstack/react-query";
import { casesApi } from "../../services/api";
import type { Case } from "../../types/case";
import { useNavigate } from "react-router-dom";

const Cases: React.FC = () => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  const navigate = useNavigate();

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "cases",
      page,
      rowsPerPage,
      search,
      statusFilter,
      priorityFilter,
      serviceTypeFilter,
    ],
    queryFn: () =>
      casesApi.getCases({
        page: page + 1,
        limit: rowsPerPage,
        search,
        status: statusFilter !== "all" ? statusFilter : undefined,
        priority: priorityFilter !== "all" ? priorityFilter : undefined,
        serviceType:
          serviceTypeFilter !== "all" ? serviceTypeFilter : undefined,
      }),
  });

  const updateServiceTypeMutation = useMutation({
    mutationFn: ({ id, serviceType }: { id: string; serviceType: string }) =>
      casesApi.updateCaseServiceType(id, serviceType),
    onSuccess: () => {
      refetch();
      setSnackbar({
        open: true,
        message: "Служба успешно обновлена",
        severity: "success",
      });
    },
    onError: (error: any) => {
      setSnackbar({
        open: true,
        message: `Ошибка: ${error.message}`,
        severity: "error",
      });
    },
  });

  const handleRedirect = (id: string, serviceType: string) => {
    updateServiceTypeMutation.mutate({ id, serviceType });
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const cases = data?.cases || [];
  const total = data?.total || 0;

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleViewCase = (id: string) => {
    navigate(`/cases/${id}`);
  };

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

  const getServiceTypeLabel = (type?: string) => {
    switch (type) {
      case "fire":
        return "Пожарный";
      case "emergency":
        return "ЧС";
      case "ambulance":
        return "Скорая";
      case "police":
        return "Полиция";
      case "other":
        return "Другое";
      default:
        return "Не указано";
    }
  };

  const getServiceTypeColor = (type?: string) => {
    switch (type) {
      case "fire":
        return "error";
      case "emergency":
        return "warning";
      case "ambulance":
        return "info";
      case "police":
        return "primary";
      default:
        return "default";
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Typography variant="h4" fontWeight="bold">
          Журнал обращений
        </Typography>
        <Button
          variant="contained"
          startIcon={<Refresh />}
          onClick={() => refetch()}
        >
          Обновить
        </Button>
      </Stack>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            placeholder="Поиск по ID, ФИО, описанию..."
            variant="outlined"
            size="small"
            fullWidth
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Статус</InputLabel>
            <Select
              value={statusFilter}
              label="Статус"
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="new">Новое</MenuItem>
              <MenuItem value="in_progress">В работе</MenuItem>
              <MenuItem value="completed">Завершено</MenuItem>
              <MenuItem value="rejected">Отклонено</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Приоритет</InputLabel>
            <Select
              value={priorityFilter}
              label="Приоритет"
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="high">Высокий</MenuItem>
              <MenuItem value="medium">Средний</MenuItem>
              <MenuItem value="low">Низкий</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Служба</InputLabel>
            <Select
              value={serviceTypeFilter}
              label="Служба"
              onChange={(e) => setServiceTypeFilter(e.target.value)}
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="fire">Пожарный</MenuItem>
              <MenuItem value="emergency">ЧС</MenuItem>
              <MenuItem value="ambulance">Скорая</MenuItem>
              <MenuItem value="police">Полиция</MenuItem>
              <MenuItem value="other">Другое</MenuItem>
            </Select>
          </FormControl>
          <IconButton>
            <FilterList />
          </IconButton>
        </Stack>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Дата</TableCell>
              <TableCell>Телефон</TableCell>
              <TableCell>Категория</TableCell>
              <TableCell>Служба</TableCell>
              <TableCell>Приоритет</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Транскрипция</TableCell>
              <TableCell>Птичка</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  Загрузка...
                </TableCell>
              </TableRow>
            ) : cases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  Нет данных
                </TableCell>
              </TableRow>
            ) : (
              cases.map((caseItem: Case) => (
                <TableRow key={caseItem.id} hover>
                  <TableCell>{caseItem.id.substring(0, 8)}...</TableCell>
                  <TableCell>
                    {new Date(caseItem.createdAt).toLocaleDateString("ru-RU")}
                  </TableCell>
                  <TableCell>{caseItem.phoneNumber || "-"}</TableCell>
                  <TableCell>
                    <Chip
                      label={caseItem.category || "неизвестно"}
                      color={
                        caseItem.category === "срочный"
                          ? "error"
                          : caseItem.category === "нормальный"
                          ? "warning"
                          : "default"
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={getServiceTypeLabel(caseItem.serviceType)}
                      color={getServiceTypeColor(caseItem.serviceType) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={caseItem.priority}
                      color={getPriorityColor(caseItem.priority) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={caseItem.status}
                      color={getStatusColor(caseItem.status) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {caseItem.transcription
                      ? `${caseItem.transcription.substring(0, 30)}...`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={caseItem.isCompleted ? "✓" : "✗"}
                      color={caseItem.isCompleted ? "success" : "default"}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Направить на пожарку">
                        <IconButton
                          size="small"
                          onClick={() => handleRedirect(caseItem.id, "fire")}
                          sx={{ color: "#FF5722" }}
                        >
                          <LocalFireDepartment fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Направить на ЧС">
                        <IconButton
                          size="small"
                          onClick={() =>
                            handleRedirect(caseItem.id, "emergency")
                          }
                          sx={{ color: "#FF9800" }}
                        >
                          <Emergency fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Направить на скорую">
                        <IconButton
                          size="small"
                          onClick={() =>
                            handleRedirect(caseItem.id, "ambulance")
                          }
                          sx={{ color: "#2196F3" }}
                        >
                          <LocalHospital fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Направить на полицию">
                        <IconButton
                          size="small"
                          onClick={() => handleRedirect(caseItem.id, "police")}
                          sx={{ color: "#3F51B5" }}
                        >
                          <Security fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Другое">
                        <IconButton
                          size="small"
                          onClick={() => handleRedirect(caseItem.id, "other")}
                          sx={{ color: "#9C27B0" }}
                        >
                          <MoreHoriz fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <IconButton
                        size="small"
                        onClick={() => handleViewCase(caseItem.id)}
                      >
                        <Visibility fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={total}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="Строк на странице:"
          labelDisplayedRows={({ from, to, count }) =>
            `${from}-${to} из ${count}`
          }
        />
      </TableContainer>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Cases;
