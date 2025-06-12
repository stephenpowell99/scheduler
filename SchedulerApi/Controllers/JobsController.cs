using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchedulerApi.Data;
using SchedulerApi.Models;

namespace SchedulerApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class JobsController : ControllerBase
    {
        private readonly SchedulerDbContext _context;
        public JobsController(SchedulerDbContext context)
        {
            _context = context;
        }

        // GET: api/jobs
        [HttpGet]
        public async Task<IActionResult> GetJobs()
        {
            var jobs = await _context.Jobs.Include(j => j.Schedules).ToListAsync();
            return Ok(jobs);
        }

        // GET: api/jobs/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetJob(int id)
        {
            var job = await _context.Jobs.Include(j => j.Schedules).FirstOrDefaultAsync(j => j.Id == id);
            if (job == null)
                return NotFound(new { message = "Job not found" });
            return Ok(job);
        }

        // POST: api/jobs
        [HttpPost]
        public async Task<IActionResult> CreateJob([FromBody] Job job)
        {
            _context.Jobs.Add(job);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetJob), new { id = job.Id }, job);
        }

        // PATCH: api/jobs/{id}
        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdateJob(int id, [FromBody] Job jobUpdate)
        {
            var job = await _context.Jobs.FindAsync(id);
            if (job == null)
                return NotFound(new { message = "Job not found" });

            // Update only provided fields
            if (!string.IsNullOrEmpty(jobUpdate.Name)) job.Name = jobUpdate.Name;
            if (!string.IsNullOrEmpty(jobUpdate.Description)) job.Description = jobUpdate.Description;
            if (!string.IsNullOrEmpty(jobUpdate.ActivityType)) job.ActivityType = jobUpdate.ActivityType;
            if (jobUpdate.TotalSamples != 0) job.TotalSamples = jobUpdate.TotalSamples;
            if (jobUpdate.MaterialArrivesDate != default) job.MaterialArrivesDate = jobUpdate.MaterialArrivesDate;
            if (jobUpdate.DeadlineDate != default) job.DeadlineDate = jobUpdate.DeadlineDate;

            await _context.SaveChangesAsync();
            return Ok(job);
        }

        // DELETE: api/jobs/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteJob(int id)
        {
            var job = await _context.Jobs.Include(j => j.Schedules).FirstOrDefaultAsync(j => j.Id == id);
            if (job == null)
                return NotFound(new { message = "Job not found" });

            // Remove related schedules first
            if (job.Schedules != null)
                _context.Schedules.RemoveRange(job.Schedules);
            _context.Jobs.Remove(job);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // POST: api/jobs/{id}/autoplan
        [HttpPost("{id}/autoplan")]
        public async Task<IActionResult> AutoPlanJob(int id)
        {
            var job = await _context.Jobs.FirstOrDefaultAsync(j => j.Id == id);
            if (job == null)
                return NotFound(new { message = "Job not found" });

            // Get activity type entity
            var activityType = await _context.ActivityTypes.FirstOrDefaultAsync(a => a.Name == job.ActivityType);
            if (activityType == null)
                return BadRequest(new { message = $"Activity type '{job.ActivityType}' not found" });

            // Get stages for this activity type, ordered
            var jobStagesData = await _context.ActivityTypeStages
                .Where(ats => ats.ActivityTypeId == activityType.Id)
                .Include(ats => ats.Stage)
                .OrderBy(ats => ats.Stage.Order)
                .ToListAsync();
            if (!jobStagesData.Any())
                return BadRequest(new { message = $"No stages found for activity type {job.ActivityType}" });

            // Clear existing schedules for this job
            var existingSchedules = _context.Schedules.Where(s => s.JobId == id);
            _context.Schedules.RemoveRange(existingSchedules);
            await _context.SaveChangesAsync();

            // Batch-based auto-planning logic
            var batches = new List<Batch> {
                new Batch {
                    Qty = job.TotalSamples,
                    LastScheduledStage = null,
                    Held = false,
                    SchedulingCompleted = false,
                    LastScheduledDate = null,
                    ReleaseQtyHeldAtStage = null
                }
            };
            int maxIterations = 100;
            int iterations = 0;
            while (batches.Any(b => !b.SchedulingCompleted) && iterations < maxIterations)
            {
                iterations++;
                // Sort batches: non-held first
                batches = batches.OrderBy(b => b.Held).ToList();
                for (int i = 0; i < batches.Count; i++)
                {
                    var batch = batches[i];
                    if (batch.Held || batch.SchedulingCompleted) continue;
                    int previousStageIndex = batch.LastScheduledStage == null ? 0 : jobStagesData.FindIndex(s => s.StageId == batch.LastScheduledStage);
                    int processingTimeForPreviousStage = 0;
                    if (batch.LastScheduledStage != null && previousStageIndex >= 0)
                        processingTimeForPreviousStage = jobStagesData[previousStageIndex].ProcessingTimeDays;
                    var calculateNextSchedulingDateFrom = batch.LastScheduledDate ?? job.MaterialArrivesDate;
                    int? previousStageId = batch.LastScheduledStage;
                    int nextStageIndex = batch.LastScheduledStage == null ? 0 : previousStageIndex + 1;
                    if (nextStageIndex >= jobStagesData.Count) { batch.SchedulingCompleted = true; continue; }
                    var nextStage = jobStagesData[nextStageIndex];
                    var forDate = AddBusinessDays(calculateNextSchedulingDateFrom, processingTimeForPreviousStage);
                    int schedulingQty = batch.Qty;
                    int heldQty = 0;
                    if (nextStage.Stage.ProceedWithTestQty.HasValue)
                    {
                        heldQty = Math.Max(batch.Qty - nextStage.Stage.ProceedWithTestQty.Value, 0);
                        schedulingQty = Math.Min(nextStage.Stage.ProceedWithTestQty.Value, schedulingQty);
                    }
                    var weekStart = GetWeekStart(forDate);
                    await ScheduleQuantityForWeek(id, nextStage.StageId, weekStart, schedulingQty);
                    batch.Qty = schedulingQty;
                    batch.LastScheduledStage = nextStage.StageId;
                    batch.LastScheduledDate = forDate;
                    if (nextStageIndex == jobStagesData.Count - 1)
                        batch.SchedulingCompleted = true;
                    if (heldQty != 0)
                    {
                        batches.Add(new Batch
                        {
                            Qty = heldQty,
                            LastScheduledStage = previousStageId,
                            Held = true,
                            SchedulingCompleted = false,
                            LastScheduledDate = null,
                            ReleaseQtyHeldAtStage = nextStage.Stage.ReleaseRemainingAtStageId
                        });
                    }
                    // Release held batches if needed
                    for (int j = 0; j < batches.Count; j++)
                    {
                        var heldBatch = batches[j];
                        if (heldBatch.Held && heldBatch.ReleaseQtyHeldAtStage == batch.LastScheduledStage)
                        {
                            int releaseToStageIndex = jobStagesData.FindIndex(s => s.StageId == heldBatch.LastScheduledStage) + 1;
                            if (releaseToStageIndex >= jobStagesData.Count) { heldBatch.SchedulingCompleted = true; continue; }
                            var releaseToStage = jobStagesData[releaseToStageIndex];
                            heldBatch.Held = false;
                            heldBatch.ReleaseQtyHeldAtStage = null;
                            heldBatch.LastScheduledDate = batch.LastScheduledDate;
                            heldBatch.LastScheduledStage = releaseToStage.StageId;
                            if (releaseToStageIndex == jobStagesData.Count - 1)
                                heldBatch.SchedulingCompleted = true;
                            await ScheduleQuantityForWeek(id, releaseToStage.StageId, weekStart, heldBatch.Qty);
                        }
                    }
                }
            }
            if (iterations >= maxIterations)
                return StatusCode(500, new { message = "Auto-planning exceeded maximum iterations" });
            return Ok(new { message = "Auto-planning completed" });
        }

        // GET: api/jobs/with-schedules
        [HttpGet("with-schedules")]
        public async Task<IActionResult> GetJobsWithSchedules()
        {
            var allJobs = await _context.Jobs.ToListAsync();
            var allSchedules = await _context.Schedules.Include(s => s.Stage).ToListAsync();
            var result = allJobs.Select(job =>
            {
                var jobSchedules = allSchedules.Where(s => s.JobId == job.Id).ToList();
                var scheduledSamples = jobSchedules.Sum(s => s.ScheduledSamples);
                var schedulesWithStages = jobSchedules.Select(s => new
                {
                    s.Id,
                    s.JobId,
                    s.StageId,
                    s.WeekStart,
                    s.ScheduledSamples,
                    Stage = s.Stage
                });
                return new
                {
                    job.Id,
                    job.Name,
                    job.Description,
                    job.ActivityType,
                    job.TotalSamples,
                    job.MaterialArrivesDate,
                    job.DeadlineDate,
                    Schedules = schedulesWithStages,
                    RemainingSamples = Math.Max(0, job.TotalSamples - scheduledSamples)
                };
            });
            return Ok(result);
        }

        private class Batch
        {
            public int Qty { get; set; }
            public int? LastScheduledStage { get; set; }
            public bool Held { get; set; }
            public bool SchedulingCompleted { get; set; }
            public DateTime? LastScheduledDate { get; set; }
            public int? ReleaseQtyHeldAtStage { get; set; }
        }

        private string GetWeekStart(DateTime date)
        {
            var weekStart = date;
            var day = (int)weekStart.DayOfWeek;
            int diff = weekStart.Day - day + (day == 0 ? -6 : 1);
            weekStart = weekStart.AddDays(diff - weekStart.Day + date.Day);
            return weekStart.Date.ToString("yyyy-MM-dd");
        }

        private DateTime AddBusinessDays(DateTime startDate, int businessDays)
        {
            if (businessDays == 0) return startDate;
            var result = startDate;
            int daysAdded = 0;
            while (daysAdded < businessDays)
            {
                result = result.AddDays(1);
                if (result.DayOfWeek != DayOfWeek.Saturday && result.DayOfWeek != DayOfWeek.Sunday)
                    daysAdded++;
            }
            return result;
        }

        private async Task ScheduleQuantityForWeek(int jobId, int stageId, string weekStart, int quantity)
        {
            var existingSchedule = await _context.Schedules.FirstOrDefaultAsync(s => s.JobId == jobId && s.StageId == stageId && s.WeekStart == weekStart);
            if (existingSchedule != null)
            {
                existingSchedule.ScheduledSamples += quantity;
            }
            else
            {
                _context.Schedules.Add(new Schedule
                {
                    JobId = jobId,
                    StageId = stageId,
                    WeekStart = weekStart,
                    ScheduledSamples = quantity
                });
            }
            await _context.SaveChangesAsync();
        }
    }
}