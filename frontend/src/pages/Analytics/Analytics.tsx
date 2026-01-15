import React from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";

const Analytics: React.FC = () => {
  const barData = [
    { month: "Янв", обращения: 120, завершено: 80 },
    { month: "Фев", обращения: 150, завершено: 100 },
    { month: "Мар", обращения: 180, завершено: 120 },
    { month: "Апр", обращения: 200, завершено: 150 },
    { month: "Май", обращения: 240, завершено: 180 },
    { month: "Июн", обращения: 300, завершено: 220 },
  ];

  const pieData = [
    { name: "Драка", value: 35 },
    { name: "Шум", value: 25 },
    { name: "Угроза", value: 15 },
    { name: "Жалоба", value: 20 },
    { name: "Консультация", value: 5 },
  ];

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

  const lineData = [
    { day: "1", время: 2.5 },
    { day: "2", время: 3.0 },
    { day: "3", время: 2.8 },
    { day: "4", время: 3.2 },
    { day: "5", время: 2.9 },
    { day: "6", время: 3.5 },
    { day: "7", время: 3.1 },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Аналитика и отчётность
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h6">
                Динамика обращений по месяцам
              </Typography>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Период</InputLabel>
                <Select value="6months" label="Период">
                  <MenuItem value="3months">3 месяца</MenuItem>
                  <MenuItem value="6months">6 месяцев</MenuItem>
                  <MenuItem value="1year">1 год</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="обращения" fill="#8884d8" />
                <Bar dataKey="завершено" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Среднее время обработки обращения (дни)
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="время" stroke="#ff7300" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Распределение по типам нарушений
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Paper>

          <Card>
            <CardHeader title="Ключевые показатели" />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Paper sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="h4" color="primary">
                      1,245
                    </Typography>
                    <Typography variant="body2">Всего обращений</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6}>
                  <Paper sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="h4" color="success.main">
                      78%
                    </Typography>
                    <Typography variant="body2">Завершено</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6}>
                  <Paper sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="h4" color="warning.main">
                      2.9
                    </Typography>
                    <Typography variant="body2">Ср. время (дни)</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6}>
                  <Paper sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="h4" color="error.main">
                      12%
                    </Typography>
                    <Typography variant="body2">Высокий приоритет</Typography>
                  </Paper>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Тепловая карта инцидентов
        </Typography>
        <Box
          sx={{
            height: 300,
            bgcolor: "grey.200",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 1,
          }}
        >
          <Typography variant="body1" color="textSecondary">
            Карта загружается...
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default Analytics;
