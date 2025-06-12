import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { insertJobSchema, insertScheduleSchema, insertCapacitySchema, insertActivityTypeSchema, insertStageSchema, insertActivityTypeStageSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  setupAuth(app);

  // Authentication routes
  app.post('/api/login', passport.authenticate('local'), (req, res) => {
    res.json({ user: req.user });
  });

  app.post('/api/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get('/api/auth/user', (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  app.get('/api/users', isAuthenticated, async (req, res) => {
    try {
      // For now, just return the current user
      res.json([req.user]);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Protected routes - Jobs endpoints
  app.get("/api/jobs", isAuthenticated, async (req, res) => {
    try {
      const jobs = await storage.getJobsWithSchedules();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch jobs" });
    }
  });

  app.get("/api/jobs/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getJob(id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch job" });
    }
  });

  app.post("/api/jobs", isAuthenticated, async (req, res, next) => {
    try {
      const validatedData = insertJobSchema.parse(req.body);
      const { autoPlan, ...jobData } = validatedData;
      const job = await storage.createJob(jobData);
      
      // Auto-plan if requested
      if (autoPlan) {
        await storage.autoPlanJob(job.id);
      }
      
      res.status(201).json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid job data", errors: error.errors });
      }
      next(error); // Pass to error handler for detailed logging
    }
  });

  app.patch("/api/jobs/:id", async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertJobSchema.partial().parse(req.body);
      const job = await storage.updateJob(id, validatedData);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid job data", errors: error.errors });
      }
      next(error);
    }
  });

  app.delete("/api/jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteJob(id);
      if (!deleted) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete job" });
    }
  });

  app.post("/api/jobs/:id/shift-schedule", async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { weeks } = req.body;
      
      if (!weeks || typeof weeks !== 'number') {
        return res.status(400).json({ message: "Number of weeks is required" });
      }
      
      await storage.shiftJobSchedule(id, weeks);
      res.json({ message: "Schedule shifted successfully" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/schedules/:jobId/:stageId/move", async (req, res, next) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const stageId = parseInt(req.params.stageId);
      const { fromWeek, toWeek, quantity } = req.body;
      
      if (!fromWeek || !toWeek || !quantity) {
        return res.status(400).json({ message: "fromWeek, toWeek, and quantity are required" });
      }
      
      await storage.moveSchedule(jobId, stageId, fromWeek, toWeek, quantity);
      res.json({ message: "Schedule moved successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Protected API routes - apply authentication to all remaining endpoints
  app.use('/api', (req, res, next) => {
    // Skip authentication for login/logout/auth routes
    if (req.path === '/login' || req.path === '/logout' || req.path.startsWith('/auth/')) {
      return next();
    }
    return isAuthenticated(req, res, next);
  });

  // Schedules endpoints
  app.get("/api/schedules", async (req, res) => {
    try {
      const { jobId, weekStart } = req.query;
      let schedules;
      
      if (jobId) {
        schedules = await storage.getSchedulesByJob(parseInt(jobId as string));
      } else if (weekStart) {
        schedules = await storage.getSchedulesByWeek(weekStart as string);
      } else {
        schedules = await storage.getSchedules();
      }
      
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch schedules" });
    }
  });

  app.post("/api/schedules", async (req, res) => {
    try {
      const validatedData = insertScheduleSchema.parse(req.body);
      const schedule = await storage.createSchedule(validatedData);
      res.status(201).json(schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid schedule data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create schedule" });
    }
  });

  app.put("/api/schedules/:jobId/:stageId/:weekStart", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const stageId = parseInt(req.params.stageId);
      const weekStart = req.params.weekStart;
      const { scheduledSamples } = req.body;
      
      if (typeof scheduledSamples !== 'number' || scheduledSamples < 0) {
        return res.status(400).json({ message: "Invalid scheduled samples value" });
      }

      const schedule = await storage.updateSchedule(jobId, stageId, weekStart, scheduledSamples);
      res.json(schedule);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Cannot schedule")) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Schedule update error:", error);
      res.status(500).json({ message: "Failed to update schedule" });
    }
  });

  app.delete("/api/schedules/:jobId/:stageId/:weekStart", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const stageId = parseInt(req.params.stageId);
      const weekStart = req.params.weekStart;
      const deleted = await storage.deleteSchedule(jobId, stageId, weekStart);
      if (!deleted) {
        return res.status(404).json({ message: "Schedule not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete schedule" });
    }
  });

  // Capacities endpoints
  app.get("/api/capacities", async (req, res) => {
    try {
      const { weekStart, weekStarts } = req.query;
      
      if (weekStarts) {
        // Multiple weeks for capacity summary
        const weeks = (weekStarts as string).split(',');
        const capacities = await storage.getWeekCapacities(weeks);
        res.json(capacities);
      } else if (weekStart) {
        const capacities = await storage.getCapacitiesByWeek(weekStart as string);
        res.json(capacities);
      } else {
        const capacities = await storage.getCapacities();
        res.json(capacities);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch capacities" });
    }
  });

  app.post("/api/capacities", async (req, res) => {
    try {
      const validatedData = insertCapacitySchema.parse(req.body);
      const capacity = await storage.createOrUpdateCapacity(validatedData);
      res.json(capacity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid capacity data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create/update capacity" });
    }
  });

  app.delete("/api/capacities/:stageId/:weekStart", async (req, res) => {
    try {
      const stageId = parseInt(req.params.stageId);
      const weekStart = req.params.weekStart;
      const deleted = await storage.deleteCapacity(stageId, weekStart);
      if (!deleted) {
        return res.status(404).json({ message: "Capacity not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete capacity" });
    }
  });

  // Activity Types endpoints
  app.get("/api/activity-types", async (req, res) => {
    try {
      const activityTypes = await storage.getActivityTypes();
      res.json(activityTypes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activity types" });
    }
  });

  app.post("/api/activity-types", async (req, res) => {
    try {
      const validatedData = insertActivityTypeSchema.parse(req.body);
      const activityType = await storage.createActivityType(validatedData);
      res.status(201).json(activityType);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid activity type data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create activity type" });
    }
  });

  app.delete("/api/activity-types/:name", async (req, res) => {
    try {
      const name = req.params.name;
      const deleted = await storage.deleteActivityType(name);
      if (!deleted) {
        return res.status(404).json({ message: "Activity type not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete activity type" });
    }
  });

  // Stages routes
  app.get("/api/stages", async (req, res) => {
    try {
      const stages = await storage.getStages();
      res.json(stages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stages" });
    }
  });

  app.post("/api/stages", async (req, res) => {
    try {
      const validatedData = insertStageSchema.parse(req.body);
      const stage = await storage.createStage(validatedData);
      res.status(201).json(stage);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid stage data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create stage" });
    }
  });

  app.put("/api/stages/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertStageSchema.parse(req.body);
      const stage = await storage.updateStage(id, validatedData);
      if (!stage) {
        return res.status(404).json({ message: "Stage not found" });
      }
      res.json(stage);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid stage data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update stage" });
    }
  });

  app.delete("/api/stages/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteStage(id);
      if (!deleted) {
        return res.status(404).json({ message: "Stage not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete stage" });
    }
  });

  // Activity Type Stages endpoints
  app.get("/api/activity-type-stages", async (req, res) => {
    try {
      const activityTypeStages = await storage.getActivityTypeStages();
      res.json(activityTypeStages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activity type stages" });
    }
  });

  app.get("/api/activity-type-stages/activity-type/:activityTypeId", async (req, res) => {
    try {
      const activityTypeId = parseInt(req.params.activityTypeId);
      const activityTypeStages = await storage.getActivityTypeStagesByActivityType(activityTypeId);
      res.json(activityTypeStages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activity type stages" });
    }
  });

  app.post("/api/activity-type-stages", async (req, res) => {
    try {
      const activityTypeStageData = insertActivityTypeStageSchema.parse(req.body);
      const activityTypeStage = await storage.createActivityTypeStage(activityTypeStageData);
      res.status(201).json(activityTypeStage);
    } catch (error) {
      res.status(400).json({ error: "Failed to create activity type stage relationship" });
    }
  });

  app.patch("/api/activity-type-stages/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { processingTimeDays } = req.body;
      const activityTypeStage = await storage.updateActivityTypeStage(id, processingTimeDays);
      if (activityTypeStage) {
        res.json(activityTypeStage);
      } else {
        res.status(404).json({ error: "Activity type stage not found" });
      }
    } catch (error) {
      res.status(400).json({ error: "Failed to update activity type stage" });
    }
  });

  app.delete("/api/activity-type-stages/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteActivityTypeStage(id);
      if (success) {
        res.status(204).send();
      } else {
        res.status(404).json({ error: "Activity type stage not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete activity type stage" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
