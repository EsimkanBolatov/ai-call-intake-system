import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ListAltIcon from "@mui/icons-material/ListAlt";
import AnalyticsIcon from "@mui/icons-material/BarChart";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import MapIcon from "@mui/icons-material/Map";
import PhoneIcon from "@mui/icons-material/Phone";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const menuItems = [
  {
    text: "Dashboard",
    icon: <DashboardIcon />,
    path: "/",
    roles: ["admin", "operator", "analyst", "org"],
  },
  {
    text: "Журнал обращений",
    icon: <ListAltIcon />,
    path: "/cases",
    roles: ["admin", "operator", "analyst", "org"],
  },
  {
    text: "Аналитика",
    icon: <AnalyticsIcon />,
    path: "/analytics",
    roles: ["admin", "analyst"],
  },
  {
    text: "Администрирование",
    icon: <AdminPanelSettingsIcon />,
    path: "/admin",
    roles: ["admin"],
  },
  {
    text: "Тепловая карта",
    icon: <MapIcon />,
    path: "/heatmap",
    roles: ["admin", "analyst", "operator"],
  },
  {
    text: "Симулятор звонка",
    icon: <PhoneIcon />,
    path: "/call-simulator",
    roles: ["admin", "operator", "analyst"],
  },
];

const Sidebar = () => {
  const { user } = useAuth();
  const userRole = user?.roles?.[0] || "admin";

  const filteredItems = menuItems.filter((item) =>
    item.roles.includes(userRole)
  );

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: 240,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: 240,
          boxSizing: "border-box",
          backgroundColor: "#f8f9fa",
        },
      }}
    >
      <Divider />
      <List>
        {filteredItems.map((item) => (
          <ListItem
            key={item.text}
            component={NavLink}
            to={item.path}
            sx={{
              color: "text.primary",
              textDecoration: "none",
              "&.active": {
                backgroundColor: "primary.light",
                color: "primary.contrastText",
                "& .MuiListItemIcon-root": {
                  color: "primary.contrastText",
                },
              },
              "&:hover": {
                backgroundColor: "action.hover",
              },
            }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} />
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
};

export default Sidebar;
