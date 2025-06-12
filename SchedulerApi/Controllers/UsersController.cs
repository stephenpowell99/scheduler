using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using SchedulerApi.Models;

namespace SchedulerApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UsersController : ControllerBase
    {
        private readonly UserManager<User> _userManager;
        public UsersController(UserManager<User> userManager)
        {
            _userManager = userManager;
        }

        // GET: api/users/me
        [HttpGet("me")]
        [Authorize]
        public async Task<IActionResult> GetCurrentUser()
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
                return Unauthorized(new { message = "Not authenticated" });
            return Ok(user);
        }

        // GET: api/users
        [HttpGet]
        [Authorize]
        public IActionResult GetUsers()
        {
            // For now, just return the current user as in the original code
            var user = _userManager.GetUserAsync(User).Result;
            if (user == null)
                return Unauthorized(new { message = "Not authenticated" });
            return Ok(new[] { user });
        }

        // POST: api/users
        [HttpPost]
        public async Task<IActionResult> CreateUser([FromBody] User user, [FromQuery] string password)
        {
            var result = await _userManager.CreateAsync(user, password);
            if (!result.Succeeded)
                return BadRequest(result.Errors);
            return Ok(user);
        }
    }
}