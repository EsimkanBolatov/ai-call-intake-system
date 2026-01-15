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
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Switch,
  FormControlLabel,
  Tab,
  Tabs,
} from "@mui/material";
import {
  Edit,
  Delete,
  Add,
  Lock,
  LockOpen,
  Visibility,
} from "@mui/icons-material";

interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "operator" | "analyst" | "org";
  active: boolean;
  lastLogin: string;
}

const Admin: React.FC = () => {
  const [users, setUsers] = useState<User[]>([
    {
      id: "1",
      email: "admin@system.kz",
      name: "Адиль Беков",
      role: "admin",
      active: true,
      lastLogin: "2025-12-10 09:30",
    },
    {
      id: "2",
      email: "operator1@system.kz",
      name: "Айгуль Садыкова",
      role: "operator",
      active: true,
      lastLogin: "2025-12-09 14:20",
    },
    {
      id: "3",
      email: "analyst@system.kz",
      name: "Дамир Жумабаев",
      role: "analyst",
      active: false,
      lastLogin: "2025-12-08 11:15",
    },
    {
      id: "4",
      email: "org_police@system.kz",
      name: "Полиция г.Астана",
      role: "org",
      active: true,
      lastLogin: "2025-12-10 08:45",
    },
  ]);

  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [tab, setTab] = useState(0);

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setOpenDialog(true);
  };

  const handleDelete = (id: string) => {
    setUsers(users.filter((u) => u.id !== id));
  };

  const handleToggleActive = (id: string) => {
    setUsers(users.map((u) => (u.id === id ? { ...u, active: !u.active } : u)));
  };

  const handleSave = () => {
    // Здесь логика сохранения
    setOpenDialog(false);
    setEditingUser(null);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin":
        return "error";
      case "operator":
        return "primary";
      case "analyst":
        return "warning";
      case "org":
        return "success";
      default:
        return "default";
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Панель администратора
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Пользователи" />
        <Tab label="Роли и права" />
        <Tab label="Логи аудита" />
        <Tab label="Настройки системы" />
      </Tabs>

      {tab === 0 && (
        <>
          <Box display="flex" justifyContent="space-between" mb={3}>
            <Typography variant="h6">Управление пользователями</Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setOpenDialog(true)}
            >
              Добавить пользователя
            </Button>
          </Box>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>ФИО</TableCell>
                  <TableCell>Роль</TableCell>
                  <TableCell>Активен</TableCell>
                  <TableCell>Последний вход</TableCell>
                  <TableCell>Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.id}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={user.role}
                        color={getRoleColor(user.role) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={user.active}
                            onChange={() => handleToggleActive(user.id)}
                          />
                        }
                        label={user.active ? "Да" : "Нет"}
                      />
                    </TableCell>
                    <TableCell>{user.lastLogin}</TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => handleEdit(user)}>
                        <Edit />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(user.id)}
                      >
                        <Delete />
                      </IconButton>
                      <IconButton size="small">
                        {user.active ? <LockOpen /> : <Lock />}
                      </IconButton>
                      <IconButton size="small">
                        <Visibility />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {tab === 1 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Настройка ролей и прав доступа (RBAC)
          </Typography>
          <Typography variant="body2" color="textSecondary">
            В разработке...
          </Typography>
        </Paper>
      )}

      {tab === 2 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Логи аудита действий
          </Typography>
          <Typography variant="body2" color="textSecondary">
            В разработке...
          </Typography>
        </Paper>
      )}

      {tab === 3 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Настройки системы
          </Typography>
          <Typography variant="body2" color="textSecondary">
            В разработке...
          </Typography>
        </Paper>
      )}

      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingUser ? "Редактирование пользователя" : "Новый пользователь"}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Email"
            type="email"
            fullWidth
            defaultValue={editingUser?.email}
          />
          <TextField
            margin="dense"
            label="ФИО"
            fullWidth
            defaultValue={editingUser?.name}
          />
          <TextField
            margin="dense"
            label="Роль"
            select
            fullWidth
            defaultValue={editingUser?.role || "operator"}
            SelectProps={{ native: true }}
          >
            <option value="admin">Администратор</option>
            <option value="operator">Оператор</option>
            <option value="analyst">Аналитик</option>
            <option value="org">Орган</option>
          </TextField>
          <FormControlLabel
            control={<Switch defaultChecked={editingUser?.active ?? true} />}
            label="Активен"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSave}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Admin;
