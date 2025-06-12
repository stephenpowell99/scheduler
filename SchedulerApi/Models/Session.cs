using System.ComponentModel.DataAnnotations;

namespace SchedulerApi.Models
{
    public class Session
    {
        [Key]
        [MaxLength(255)]
        public string Sid { get; set; } = string.Empty;
        [Required]
        public string Sess { get; set; } = string.Empty; // JSON string
        [Required]
        public DateTime Expire { get; set; }
    }
}