using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchedulerApi.Data;
using SchedulerApi.Models;

namespace SchedulerApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class StagesController : ControllerBase
    {
        private readonly SchedulerDbContext _context;
        public StagesController(SchedulerDbContext context)
        {
            _context = context;
        }

        // GET: api/stages
        [HttpGet]
        public async Task<IActionResult> GetStages()
        {
            var stages = await _context.Stages.ToListAsync();
            return Ok(stages);
        }

        // POST: api/stages
        [HttpPost]
        public async Task<IActionResult> CreateStage([FromBody] Stage stage)
        {
            _context.Stages.Add(stage);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetStages), new { id = stage.Id }, stage);
        }

        // PATCH: api/stages/{id}
        [HttpPatch("{id}")]
        public async Task<IActionResult> UpdateStage(int id, [FromBody] Stage stageUpdate)
        {
            var stage = await _context.Stages.FindAsync(id);
            if (stage == null)
                return NotFound(new { message = "Stage not found" });
            if (!string.IsNullOrEmpty(stageUpdate.Name)) stage.Name = stageUpdate.Name;
            if (stageUpdate.Order != 0) stage.Order = stageUpdate.Order;
            if (!string.IsNullOrEmpty(stageUpdate.Color)) stage.Color = stageUpdate.Color;
            if (stageUpdate.ProceedWithTestQty.HasValue) stage.ProceedWithTestQty = stageUpdate.ProceedWithTestQty;
            if (stageUpdate.ReleaseRemainingAtStageId.HasValue) stage.ReleaseRemainingAtStageId = stageUpdate.ReleaseRemainingAtStageId;
            await _context.SaveChangesAsync();
            return Ok(stage);
        }

        // DELETE: api/stages/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteStage(int id)
        {
            var stage = await _context.Stages.FindAsync(id);
            if (stage == null)
                return NotFound(new { message = "Stage not found" });
            _context.Stages.Remove(stage);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}