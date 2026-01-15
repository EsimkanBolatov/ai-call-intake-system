import { Outlet } from "react-router-dom";
import { Box, Container } from "@mui/material";
import Header from "../Header/Header";
import Sidebar from "../Sidebar/Sidebar";

const Layout = () => {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        <Header />
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
          <Outlet />
        </Container>
        <Box
          component="footer"
          sx={{ py: 2, textAlign: "center", color: "text.secondary" }}
        >
          © {new Date().getFullYear()} AI Call Intake System. Все права
          защищены.
        </Box>
      </Box>
    </Box>
  );
};

export default Layout;
