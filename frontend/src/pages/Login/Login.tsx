import React, { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Link,
  Alert,
  InputAdornment,
  IconButton,
  Divider,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Email,
  Lock,
  Login as LoginIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Имитация запроса
    setTimeout(() => {
      if (email === "admin@system.kz" && password === "admin123") {
        localStorage.setItem("access_token", "fake-jwt-token");
        navigate("/");
      } else {
        setError("Неверный email или пароль");
      }
      setLoading(false);
    }, 1000);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1976d2 0%, #004ba0 100%)",
        p: 2,
      }}
    >
      <Paper
        elevation={10}
        sx={{
          maxWidth: 450,
          width: "100%",
          p: 4,
          borderRadius: 3,
        }}
      >
        <Box textAlign="center" mb={3}>
          <Typography variant="h4" fontWeight="bold" color="primary">
            AI Call Intake System
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Войдите в систему для доступа к панели управления
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Email"
            variant="outlined"
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Email color="action" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            fullWidth
            label="Пароль"
            type={showPassword ? "text" : "password"}
            variant="outlined"
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Lock color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Box textAlign="right" mt={1} mb={2}>
            <Link href="#" variant="body2">
              Забыли пароль?
            </Link>
          </Box>

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            startIcon={<LoginIcon />}
            disabled={loading}
            sx={{ py: 1.2 }}
          >
            {loading ? "Вход..." : "Войти"}
          </Button>
        </form>

        <Divider sx={{ my: 3 }}>
          <Typography variant="body2" color="textSecondary">
            или
          </Typography>
        </Divider>

        <Box textAlign="center">
          <Typography variant="body2" color="textSecondary">
            Нет учётной записи?{" "}
            <Link href="#" variant="body2">
              Запросить доступ
            </Link>
          </Typography>
        </Box>

        <Box mt={4} textAlign="center">
          <Typography variant="caption" color="textSecondary">
            © 2025 AI Call Intake System. Версия 1.0
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default Login;
