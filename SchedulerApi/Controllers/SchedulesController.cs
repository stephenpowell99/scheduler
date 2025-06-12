using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchedulerApi.Data;
using SchedulerApi.Models;

namespace SchedulerApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SchedulesController : ControllerBase
    {
        private readonly SchedulerDbContext _context;
        public SchedulesController(SchedulerDbContext context)
        {
            _context = context;
        }

        // GET: api/schedules
        [HttpGet]
        public async Task<IActionResult> GetSchedules([FromQuery] int? jobId, [FromQuery] string? weekStart)
        {
            IQueryable<Schedule> query = _context.Schedules.Include(s => s.Job).Include(s => s.Stage);
            if (jobId.HasValue)
                query = query.Where(s => s.JobId == jobId.Value);
            if (!string.IsNullOrEmpty(weekStart))
                query = query.Where(s => s.WeekStart == weekStart);
            var schedules = await query.ToListAsync();
            return Ok(schedules);
        }

        // POST: api/schedules
        [HttpPost]
        public async Task<IActionResult> CreateSchedule([FromBody] Schedule schedule)
        {
            _context.Schedules.Add(schedule);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetSchedules), new { id = schedule.Id }, schedule);
        }

        // PUT: api/schedules/{jobId}/{stageId}/{weekStart}
        [HttpPut("{jobId}/{stageId}/{weekStart}")]
        public async Task<IActionResult> UpdateSchedule(int jobId, int stageId, string weekStart, [FromBody] Schedule update)
        {
            var schedule = await _context.Schedules.FirstOrDefaultAsync(s => s.JobId == jobId && s.StageId == stageId && s.WeekStart == weekStart);
            if (schedule == null)
                return NotFound(new { message = "Schedule not found" });
            schedule.ScheduledSamples = update.ScheduledSamples;
            await _context.SaveChangesAsync();
            return Ok(schedule);
        }

        // DELETE: api/schedules/{jobId}/{stageId}/{weekStart}
        [HttpDelete("{jobId}/{stageId}/{weekStart}")]
        public async Task<IActionResult> DeleteSchedule(int jobId, int stageId, string weekStart)
        {
            var schedule = await _context.Schedules.FirstOrDefaultAsync(s => s.JobId == jobId && s.StageId == stageId && s.WeekStart == weekStart);
            if (schedule == null)
                return NotFound(new { message = "Schedule not found" });
            _context.Schedules.Remove(schedule);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // POST: api/schedules/{jobId}/shift
        [HttpPost("{jobId}/shift")]
        public async Task<IActionResult> ShiftJobSchedule(int jobId, [FromBody] ShiftScheduleRequest request)
        {
            var jobSchedules = await _context.Schedules.Where(s => s.JobId == jobId).ToListAsync();
            if (!jobSchedules.Any())
                return NotFound(new { message = "No schedules found for this job" });
            foreach (var schedule in jobSchedules)
            {
                var currentWeekStart = DateTime.Parse(schedule.WeekStart);
                var newWeekStart = currentWeekStart.AddDays(request.Weeks * 7);
                var newWeekStartString = newWeekStart.ToString("yyyy-MM-dd");
                var existingSchedule = await _context.Schedules.FirstOrDefaultAsync(s => s.JobId == jobId && s.StageId == schedule.StageId && s.WeekStart == newWeekStartString);
                if (existingSchedule != null)
                {
                    existingSchedule.ScheduledSamples += schedule.ScheduledSamples;
                }
                else
                {
                    _context.Schedules.Add(new Schedule
                    {
                        JobId = schedule.JobId,
                        StageId = schedule.StageId,
                        WeekStart = newWeekStartString,
                        ScheduledSamples = schedule.ScheduledSamples
                    });
                }
                _context.Schedules.Remove(schedule);
            }
            await _context.SaveChangesAsync();
            return Ok(new { message = "Schedules shifted successfully" });
        }

        public class ShiftScheduleRequest { public int Weeks { get; set; } }

        // POST: api/schedules/{jobId}/{stageId}/move
        [HttpPost("{jobId}/{stageId}/move")]
        public async Task<IActionResult> MoveSchedule(int jobId, int stageId, [FromBody] MoveScheduleRequest request)
        {
            var fromSchedule = await _context.Schedules.FirstOrDefaultAsync(s => s.JobId == jobId && s.StageId == stageId && s.WeekStart == request.FromWeek);
            if (fromSchedule == null)
                return NotFound(new { message = "Source schedule not found" });
            if (fromSchedule.ScheduledSamples < request.Quantity)
                return BadRequest(new { message = "Not enough samples in source week" });
            var toSchedule = await _context.Schedules.FirstOrDefaultAsync(s => s.JobId == jobId && s.StageId == stageId && s.WeekStart == request.ToWeek);
            fromSchedule.ScheduledSamples -= request.Quantity;
            try
            {
                if (toSchedule != null)
                {
                    toSchedule.ScheduledSamples += request.Quantity;
                }
                else
                {
                    _context.Schedules.Add(new Schedule
                    {
                        JobId = jobId,
                        StageId = stageId,
                        WeekStart = request.ToWeek,
                        ScheduledSamples = request.Quantity
                    });
                }
                if (fromSchedule.ScheduledSamples == 0)
                    _context.Schedules.Remove(fromSchedule);
                await _context.SaveChangesAsync();
            }
            catch
            {
                fromSchedule.ScheduledSamples += request.Quantity; // restore
                throw;
            }
            return Ok(new { message = "Schedule moved successfully" });
        }

        public class MoveScheduleRequest { public string FromWeek { get; set; } = string.Empty; public string ToWeek { get; set; } = string.Empty; public int Quantity { get; set; } }
    }
}