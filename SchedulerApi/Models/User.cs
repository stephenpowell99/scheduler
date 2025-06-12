using Microsoft.AspNetCore.Identity;
using System.ComponentModel.DataAnnotations;

namespace SchedulerApi.Models
{
    public class User : IdentityUser<int>
    {
        [MaxLength(100)]
        public string? FirstName { get; set; }
        [MaxLength(100)]
        public string? LastName { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}