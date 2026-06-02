import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import LoginPage from "./pages/LoginPage";
import StudentDashboard from "./pages/StudentDashboard";
import AdminLayout from "./pages/AdminLayout";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Toaster position="top-center" richColors closeButton />
      <Routes>
        <Route path="/teacher/*" element={<App />} />
        <Route path="/student/*" element={<StudentDashboard />} />
        <Route path="/admin/*" element={<AdminLayout />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
