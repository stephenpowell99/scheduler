using System.ComponentModel.DataAnnotations;

namespace SchedulerApi.Models
{
    public class ActivityType
    {
        [Key]
        public int Id { get; set; }
        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;
        [Required]
        [MaxLength(7)]
        public string Color { get; set; } = string.Empty;
        public ICollection<ActivityTypeStage>? ActivityTypeStages { get; set; }
    }
}