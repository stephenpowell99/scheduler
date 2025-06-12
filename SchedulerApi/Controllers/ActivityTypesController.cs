using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchedulerApi.Data;
using SchedulerApi.Models;

namespace SchedulerApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ActivityTypesController : ControllerBase
    {
        private readonly SchedulerDbContext _context;
        public ActivityTypesController(SchedulerDbContext context)
        {
            _context = context;
        }

        // GET: api/activitytypes
        [HttpGet]
        public async Task<IActionResult> GetActivityTypes()
        {
            var activityTypes = await _context.ActivityTypes.ToListAsync();
            return Ok(activityTypes);
        }

        // POST: api/activitytypes
        [HttpPost]
        public async Task<IActionResult> CreateActivityType([FromBody] ActivityType activityType)
        {
            _context.ActivityTypes.Add(activityType);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetActivityTypes), new { id = activityType.Id }, activityType);
        }

        // DELETE: api/activitytypes/{name}
        [HttpDelete("{name}")]
        public async Task<IActionResult> DeleteActivityType(string name)
        {
            var activityType = await _context.ActivityTypes.FirstOrDefaultAsync(a => a.Name == name);
            if (activityType == null)
                return NotFound(new { message = "Activity type not found" });
            _context.ActivityTypes.Remove(activityType);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}