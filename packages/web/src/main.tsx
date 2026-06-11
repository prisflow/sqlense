import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
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

const router = createBrowserRouter([
  {
    path: "/teacher/*",
    element: <AuthGuard role="teacher"><TeacherDashboard /></AuthGuard>,
  },
  {
    path: "/student/*",
    element: <AuthGuard role="student"><StudentDashboard /></AuthGuard>,
  },
  {
    path: "/admin",
    element: <AuthGuard role="admin"><AdminLayout /></AuthGuard>,
    children: [
      { index: true, element: <AdminDashboard />, handle: { title: "控制台概览" } },
      { path: "classes", element: <AdminClasses />, handle: { title: "班级管理" } },
      { path: "teachers", element: <AdminTeachers />, handle: { title: "教师管理" } },
      { path: "students", element: <AdminStudents />, handle: { title: "学生管理" } },
      { path: "logs", element: <AdminLogs />, handle: { title: "操作日志" } },
      { path: "settings", element: <AdminSettings />, handle: { title: "系统设置" } },
    ],
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "*",
    element: <LoginPage />,
  },
]);

const splash = document.getElementById("splash");
if (splash) splash.classList.add("fade");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Toaster position="top-center" />
    <RouterProvider router={router} />
  </StrictMode>
);
