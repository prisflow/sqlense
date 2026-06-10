import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import TeacherDashboard from "./pages/TeacherDashboard";
import LoginPage from "./pages/LoginPage";
import StudentDashboard from "./pages/StudentDashboard";
import AuthGuard from "./components/AuthGuard";
import AdminLayout from "./pages/AdminLayout";
import AdminDashboard from "./pages/AdminDashboard";
import AdminClasses from "./pages/AdminClasses";
import AdminTeachers from "./pages/AdminTeachers";
import AdminStudents from "./pages/AdminStudents";
import AdminLogs from "./pages/AdminLogs";
import AdminSettings from "./pages/AdminSettings";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/teacher/*" element={<AuthGuard role="teacher"><TeacherDashboard /></AuthGuard>} />
        <Route path="/student/*" element={<AuthGuard role="student"><StudentDashboard /></AuthGuard>} />
        <Route path="/admin" element={<AuthGuard role="admin"><AdminLayout /></AuthGuard>}>
          <Route index element={<AdminDashboard />} handle={{ title: "控制台概览" }} />
          <Route path="classes" element={<AdminClasses />} handle={{ title: "班级管理" }} />
          <Route path="teachers" element={<AdminTeachers />} handle={{ title: "教师管理" }} />
          <Route path="students" element={<AdminStudents />} handle={{ title: "学生管理" }} />
          <Route path="logs" element={<AdminLogs />} handle={{ title: "操作日志" }} />
          <Route path="settings" element={<AdminSettings />} handle={{ title: "系统设置" }} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
