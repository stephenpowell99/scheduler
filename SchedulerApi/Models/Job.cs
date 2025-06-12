using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SchedulerApi.Models
{
    public class Job
    {
        [Key]
        public int Id { get; set; }
        [Required]
        [MaxLength(255)]
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        [Required]
        [MaxLength(100)]
        public string ActivityType { get; set; } = string.Empty;
        [Required]
        public int TotalSamples { get; set; }
        [Required]
        public DateTime MaterialArrivesDate { get; set; }
        [Required]
        public DateTime DeadlineDate { get; set; }
        public ICollection<Schedule>? Schedules { get; set; }
    }
}