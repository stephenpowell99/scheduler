using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchedulerApi.Data;
using SchedulerApi.Models;

namespace SchedulerApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CapacitiesController : ControllerBase
    {
        private readonly SchedulerDbContext _context;
        public CapacitiesController(SchedulerDbContext context)
        {
            _context = context;
        }

        // GET: api/capacities
        [HttpGet]
        public async Task<IActionResult> GetCapacities([FromQuery] string? weekStart)
        {
            IQueryable<Capacity> query = _context.Capacities.Include(c => c.Stage);
            if (!string.IsNullOrEmpty(weekStart))
                query = query.Where(c => c.WeekStart == weekStart);
            var capacities = await query.ToListAsync();
            return Ok(capacities);
        }

        // POST: api/capacities
        [HttpPost]
        public async Task<IActionResult> CreateCapacity([FromBody] Capacity capacity)
        {
            _context.Capacities.Add(capacity);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetCapacities), new { id = capacity.Id }, capacity);
        }

        // DELETE: api/capacities/{stageId}/{weekStart}
        [HttpDelete("{stageId}/{weekStart}")]
        public async Task<IActionResult> DeleteCapacity(int stageId, string weekStart)
        {
            var capacity = await _context.Capacities.FirstOrDefaultAsync(c => c.StageId == stageId && c.WeekStart == weekStart);
            if (capacity == null)
                return NotFound(new { message = "Capacity not found" });
            _context.Capacities.Remove(capacity);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // GET: api/capacities/week-summary?weekStarts=2024-06-10,2024-06-17
        [HttpGet("week-summary")]
        public async Task<IActionResult> GetWeekCapacities([FromQuery] string weekStarts)
        {
            var weekStartList = weekStarts.Split(',');
            var allSchedules = await _context.Schedules.ToListAsync();
            var allStages = await _context.Stages.ToListAsync();
            var allCapacities = await _context.Capacities.ToListAsync();
            var result = new List<object>();
            foreach (var weekStart in weekStartList)
            {
                var weekSchedules = allSchedules.Where(s => s.WeekStart == weekStart);
                var schedulesByStage = weekSchedules.GroupBy(s => s.StageId).ToDictionary(g => g.Key, g => g.Sum(s => s.ScheduledSamples));
                foreach (var stage in allStages)
                {
                    var capacity = allCapacities.FirstOrDefault(c => c.StageId == stage.Id && c.WeekStart == weekStart);
                    var maxCapacity = capacity?.MaxCapacity ?? 0;
                    var usedCapacity = schedulesByStage.ContainsKey(stage.Id) ? schedulesByStage[stage.Id] : 0;
                    result.Add(new
                    {
                        StageId = stage.Id,
                        StageName = stage.Name,
                        WeekStart = weekStart,
                        MaxCapacity = maxCapacity,
                        UsedCapacity = usedCapacity,
                        RemainingCapacity = maxCapacity - usedCapacity
                    });
                }
            }
            return Ok(result);
        }

        // GET: api/capacities/stage-summary?weekStarts=2024-06-10,2024-06-17&stageId=1
        [HttpGet("stage-summary")]
        public async Task<IActionResult> GetStageCapacitySummary([FromQuery] string weekStarts, [FromQuery] int? stageId)
        {
            var weekStartList = weekStarts.Split(',');
            var allStages = await _context.Stages.ToListAsync();
            var allSchedules = await _context.Schedules.ToListAsync();
            var allCapacities = await _context.Capacities.ToListAsync();
            var stagesToProcess = stageId.HasValue ? allStages.Where(s => s.Id == stageId.Value) : allStages;
            var result = new List<object>();
            foreach (var weekStart in weekStartList)
            {
                foreach (var stage in stagesToProcess)
                {
                    var weekStageSchedules = allSchedules.Where(s => s.WeekStart == weekStart && s.StageId == stage.Id);
                    var usedCapacity = weekStageSchedules.Sum(s => s.ScheduledSamples);
                    var capacity = allCapacities.FirstOrDefault(c => c.StageId == stage.Id && c.WeekStart == weekStart);
                    var maxCapacity = capacity?.MaxCapacity ?? 0;
                    result.Add(new
                    {
                        StageId = stage.Id,
                        StageName = stage.Name,
                        WeekStart = weekStart,
                        MaxCapacity = maxCapacity,
                        UsedCapacity = usedCapacity,
                        RemainingCapacity = maxCapacity - usedCapacity
                    });
                }
            }
            return Ok(result);
        }
    }
}