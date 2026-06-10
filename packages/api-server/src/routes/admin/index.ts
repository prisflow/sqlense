import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { dashboardRouter } from "./dashboard.js";
import { logsRouter } from "./logs.js";
import { teachersRouter } from "./teachers.js";
import { classesRouter } from "./classes.js";
import { studentsRouter } from "./students.js";
import { settingsRouter } from "./settings.js";

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('admin'));

adminRouter.use(dashboardRouter);
adminRouter.use(logsRouter);
adminRouter.use(teachersRouter);
adminRouter.use(classesRouter);
adminRouter.use(studentsRouter);
adminRouter.use(settingsRouter);
