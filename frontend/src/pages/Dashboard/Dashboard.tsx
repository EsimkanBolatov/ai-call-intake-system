import { Paper, Typography, Box, Stack } from "@mui/material";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardStats } from "../../services/dashboardService";

const serviceData = [
  { name: "Пожарный", value: 45, color: "#FF5722" },
  { name: "ЧС", value: 32, color: "#FF9800" },
  { name: "Скорая", value: 78, color: "#2196F3" },
  { name: "Полиция", value: 120, color: "#3F51B5" },
  { name: "Другое", value: 25, color: "#9C27B0" },
];

const Dashboard = () => {
  const { data: stats } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardStats,
    initialData: {
      totalCases: 1250,
      pending: 45,
      resolved: 980,
      highPriority: 120,
      fire: 45,
      emergency: 32,
      ambulance: 78,
      police: 120,
      other: 25,
    },
  });

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Панель управления
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={3} sx={{ mb: 4 }}>
        <Paper
          sx={{
            p: 3,
            textAlign: "center",
            flex: 1,
            bgcolor: "primary.main",
            color: "white",
            borderRadius: 3,
          }}
        >
          <Typography variant="h6">Всего обращений</Typography>
          <Typography variant="h2" fontWeight="bold">
            {stats.totalCases}
          </Typography>
        </Paper>
        <Paper
          sx={{
            p: 3,
            textAlign: "center",
            flex: 1,
            bgcolor: "warning.main",
            color: "white",
            borderRadius: 3,
          }}
        >
          <Typography variant="h6">В ожидании</Typography>
          <Typography variant="h2" fontWeight="bold">
            {stats.pending}
          </Typography>
        </Paper>
        <Paper
          sx={{
            p: 3,
            textAlign: "center",
            flex: 1,
            bgcolor: "success.main",
            color: "white",
            borderRadius: 3,
          }}
        >
          <Typography variant="h6">Решено</Typography>
          <Typography variant="h2" fontWeight="bold">
            {stats.resolved}
          </Typography>
        </Paper>
        <Paper
          sx={{
            p: 3,
            textAlign: "center",
            flex: 1,
            bgcolor: "error.main",
            color: "white",
            borderRadius: 3,
          }}
        >
          <Typography variant="h6">Высокий приоритет</Typography>
          <Typography variant="h2" fontWeight="bold">
            {stats.highPriority}
          </Typography>
        </Paper>
      </Stack>

      <Typography variant="h5" gutterBottom>
        Распределение по службам
      </Typography>

      <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ mb: 4 }}>
        <Paper sx={{ p: 3, borderRadius: 3, flex: 1 }}>
          <Typography variant="h6" gutterBottom>
            Статистика служб
          </Typography>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              <Paper
                sx={{
                  p: 2,
                  flex: 1,
                  bgcolor: "#FF5722",
                  color: "white",
                  borderRadius: 2,
                }}
              >
                <Typography variant="subtitle1">Пожарный</Typography>
                <Typography variant="h4">{stats.fire}</Typography>
              </Paper>
              <Paper
                sx={{
                  p: 2,
                  flex: 1,
                  bgcolor: "#FF9800",
                  color: "white",
                  borderRadius: 2,
                }}
              >
                <Typography variant="subtitle1">ЧС</Typography>
                <Typography variant="h4">{stats.emergency}</Typography>
              </Paper>
            </Stack>
            <Stack direction="row" spacing={2}>
              <Paper
                sx={{
                  p: 2,
                  flex: 1,
                  bgcolor: "#2196F3",
                  color: "white",
                  borderRadius: 2,
                }}
              >
                <Typography variant="subtitle1">Скорая</Typography>
                <Typography variant="h4">{stats.ambulance}</Typography>
              </Paper>
              <Paper
                sx={{
                  p: 2,
                  flex: 1,
                  bgcolor: "#3F51B5",
                  color: "white",
                  borderRadius: 2,
                }}
              >
                <Typography variant="subtitle1">Полиция</Typography>
                <Typography variant="h4">{stats.police}</Typography>
              </Paper>
            </Stack>
            <Paper
              sx={{
                p: 2,
                bgcolor: "#9C27B0",
                color: "white",
                borderRadius: 2,
              }}
            >
              <Typography variant="subtitle1">Другое</Typography>
              <Typography variant="h4">{stats.other}</Typography>
            </Paper>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 3, flex: 1 }}>
          <Typography variant="h6" gutterBottom>
            Визуализация по службам
          </Typography>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={serviceData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {serviceData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Paper>
      </Stack>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" gutterBottom>
          Краткая сводка
        </Typography>
        <Typography variant="body1" paragraph>
          Всего обращений: <strong>{stats.totalCases}</strong>, из которых{" "}
          <strong>{stats.pending}</strong> находятся в ожидании,{" "}
          <strong>{stats.resolved}</strong> решены. Обращений высокого
          приоритета — <strong>{stats.highPriority}</strong>.
        </Typography>
        <Typography variant="body1">
          Наиболее активная служба —{" "}
          <strong>
            {stats.police > stats.fire && stats.police > stats.ambulance
              ? "Полиция"
              : stats.fire > stats.ambulance
              ? "Пожарный"
              : "Скорая"}
          </strong>
          .
        </Typography>
      </Paper>
    </Box>
  );
};

export default Dashboard;
