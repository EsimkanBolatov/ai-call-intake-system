import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Badge,
  Avatar,
  Box,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SettingsIcon from "@mui/icons-material/Settings";
import { useAuth } from "../../hooks/useAuth";

const Header = () => {
  const { user, updateUser } = useAuth();

  const handleRoleChange = (event: any) => {
    const newRole = event.target.value;
    if (user) {
      updateUser({ roles: [newRole] });
    }
  };

  return (
    <AppBar
      position="static"
      elevation={1}
      sx={{ backgroundColor: "white", color: "text.primary" }}
    >
      <Toolbar>
        <Typography
          variant="h6"
          component="div"
          sx={{ flexGrow: 1, fontWeight: 600 }}
        >
          AI Call Intake System
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Роль</InputLabel>
            <Select
              value={user?.roles?.[0] || "admin"}
              label="Роль"
              onChange={handleRoleChange}
            >
              <MenuItem value="admin">Администратор</MenuItem>
              <MenuItem value="operator">Оператор</MenuItem>
              <MenuItem value="analyst">Аналитик</MenuItem>
              <MenuItem value="org">Орган</MenuItem>
            </Select>
          </FormControl>
          <IconButton color="inherit">
            <Badge badgeContent={3} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>
          <IconButton color="inherit">
            <SettingsIcon />
          </IconButton>
          <Avatar sx={{ bgcolor: "primary.main" }}>
            {user?.name?.charAt(0) || "U"}
          </Avatar>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
