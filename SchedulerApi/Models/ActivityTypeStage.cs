using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SchedulerApi.Models
{
    public class ActivityTypeStage
    {
        [Key]
        public int Id { get; set; }
        [Required]
        public int ActivityTypeId { get; set; }
        [ForeignKey("ActivityTypeId")]
        public ActivityType? ActivityType { get; set; }
        [Required]
        public int StageId { get; set; }
        [ForeignKey("StageId")]
        public Stage? Stage { get; set; }
        [Required]
        public int ProcessingTimeDays { get; set; } = 0;
    }
}