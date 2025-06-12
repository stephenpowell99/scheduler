using System.ComponentModel.DataAnnotations;

namespace SchedulerApi.Models
{
    public class Stage
    {
        [Key]
        public int Id { get; set; }
        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;
        [Required]
        public int Order { get; set; }
        [Required]
        [MaxLength(7)]
        public string Color { get; set; } = string.Empty;
        public int? ProceedWithTestQty { get; set; }
        public int? ReleaseRemainingAtStageId { get; set; }
        public ICollection<Schedule>? Schedules { get; set; }
        public ICollection<ActivityTypeStage>? ActivityTypeStages { get; set; }
        public ICollection<Capacity>? Capacities { get; set; }
    }
}