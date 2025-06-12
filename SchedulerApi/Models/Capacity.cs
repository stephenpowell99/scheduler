using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SchedulerApi.Models
{
    public class Capacity
    {
        [Key]
        public int Id { get; set; }
        [Required]
        public int StageId { get; set; }
        [ForeignKey("StageId")]
        public Stage? Stage { get; set; }
        [Required]
        [MaxLength(10)]
        public string WeekStart { get; set; } = string.Empty;
        [Required]
        public int MaxCapacity { get; set; } = 0;
    }
}