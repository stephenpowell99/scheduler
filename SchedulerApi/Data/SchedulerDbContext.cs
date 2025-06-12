using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SchedulerApi.Models;

namespace SchedulerApi.Data
{
    public class SchedulerDbContext : IdentityDbContext<User, IdentityRole<int>, int>
    {
        public SchedulerDbContext(DbContextOptions<SchedulerDbContext> options) : base(options) { }

        public DbSet<Job> Jobs { get; set; }
        public DbSet<Schedule> Schedules { get; set; }
        public DbSet<Capacity> Capacities { get; set; }
        public DbSet<ActivityType> ActivityTypes { get; set; }
        public DbSet<Stage> Stages { get; set; }
        public DbSet<ActivityTypeStage> ActivityTypeStages { get; set; }
    }
}