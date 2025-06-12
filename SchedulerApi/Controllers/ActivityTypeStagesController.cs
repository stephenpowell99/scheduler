using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchedulerApi.Data;
using SchedulerApi.Models;

namespace SchedulerApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ActivityTypeStagesController : ControllerBase
    {
        private readonly SchedulerDbContext _context;
        public ActivityTypeStagesController(SchedulerDbContext context)
        {
            _context = context;
        }

        // GET: api/activitytypestages
        [HttpGet]
        public async Task<IActionResult> GetActivityTypeStages([FromQuery] int? activityTypeId)
        {
            IQueryable<ActivityTypeStage> query = _context.ActivityTypeStages.Include(a => a.ActivityType).Include(a => a.Stage);
            if (activityTypeId.HasValue)
                query = query.Where(a => a.ActivityTypeId == activityTypeId.Value);
            var result = await query.ToListAsync();
            return Ok(result);
        }

        // POST: api/activitytypestages
        [HttpPost]
        public async Task<IActionResult> CreateActivityTypeStage([FromBody] ActivityTypeStage activityTypeStage)
        {
            _context.ActivityTypeStages.Add(activityTypeStage);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetActivityTypeStages), new { id = activityTypeStage.Id }, activityTypeStage);
        }

        // PATCH: api/activitytypestages/{id}
        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdateActivityTypeStage(int id, [FromBody] ActivityTypeStage update)
        {
            var ats = await _context.ActivityTypeStages.FindAsync(id);
            if (ats == null)
                return NotFound(new { message = "ActivityTypeStage not found" });
            if (update.ProcessingTimeDays != 0) ats.ProcessingTimeDays = update.ProcessingTimeDays;
            await _context.SaveChangesAsync();
            return Ok(ats);
        }

        // DELETE: api/activitytypestages/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteActivityTypeStage(int id)
        {
            var ats = await _context.ActivityTypeStages.FindAsync(id);
            if (ats == null)
                return NotFound(new { message = "ActivityTypeStage not found" });
            _context.ActivityTypeStages.Remove(ats);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // DELETE: api/activitytypestages/by-activitytype/{activityTypeId}
        [HttpDelete("by-activitytype/{activityTypeId}")]
        public async Task<IActionResult> DeleteByActivityType(int activityTypeId)
        {
            var atsList = await _context.ActivityTypeStages.Where(a => a.ActivityTypeId == activityTypeId).ToListAsync();
            if (!atsList.Any())
                return NotFound(new { message = "No ActivityTypeStages found for this activityTypeId" });
            _context.ActivityTypeStages.RemoveRange(atsList);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}