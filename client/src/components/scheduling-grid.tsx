import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import { type JobWithSchedules, type WeekCapacity, type Stage } from "@shared/schema";
import { formatWeekLabel, getWeekNumber, formatDate } from "@/lib/date-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SchedulingGridProps {
  jobs: JobWithSchedules[];
  weeks: Date[];
  weekCapacities: WeekCapacity[];
  currentStage: Stage;
}

const activityTypeColors: Record<string, string> = {
  "SENT": "bg-blue-100 text-blue-800",
  "SENB": "bg-green-100 text-green-800",
  "Tensile RT": "bg-purple-100 text-purple-800",
  "Tensile non-ambient": "bg-yellow-100 text-yellow-800",
  "CT DCPD": "bg-red-100 text-red-800",
  "CT TO/US": "bg-cyan-100 text-cyan-800",
  "In-situ SENB": "bg-lime-100 text-lime-800",
  "In-situ CT": "bg-orange-100 text-orange-800",
  "Routine Mech": "bg-indigo-100 text-indigo-800",
};

export function SchedulingGrid({ jobs, weeks, weekCapacities, currentStage }: SchedulingGridProps) {
  const [scheduleValues, setScheduleValues] = useState<Record<string, number>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateScheduleMutation = useMutation({
    mutationFn: async ({ jobId, stageId, weekStart, scheduledSamples }: { 
      jobId: number; 
      stageId: number;
      weekStart: string; 
      scheduledSamples: number; 
    }) => {
      const response = await apiRequest("PUT", `/api/schedules/${jobId}/${stageId}/${weekStart}`, {
        scheduledSamples,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/capacities"] });
    },
    onError: (error) => {
      let errorMessage = "Failed to update schedule. Please try again.";
      
      if (error instanceof Error && error.message.includes("Cannot schedule")) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Scheduling Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const getScheduledSamples = (jobId: number, weekStart: string): number => {
    const job = jobs.find(j => j.id === jobId);
    const schedule = job?.schedules.find(s => s.weekStart === weekStart && s.stage.id === currentStage.id);
    return schedule?.scheduledSamples || 0;
  };

  const getDisplayValue = (jobId: number, weekStart: string): number => {
    const key = `${jobId}-${currentStage.id}-${weekStart}`;
    if (scheduleValues[key] !== undefined) {
      return scheduleValues[key];
    }
    return getScheduledSamples(jobId, weekStart);
  };

  const handleScheduleChange = (jobId: number, weekStart: string, value: string) => {
    const scheduledSamples = parseInt(value) || 0;
    const key = `${jobId}-${currentStage.id}-${weekStart}`;
    
    setScheduleValues(prev => ({
      ...prev,
      [key]: scheduledSamples,
    }));
  };

  const handleScheduleBlur = (jobId: number, weekStart: string) => {
    const key = `${jobId}-${currentStage.id}-${weekStart}`;
    const scheduledSamples = scheduleValues[key] ?? getScheduledSamples(jobId, weekStart);

    // Get job for validation
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    // Check for validation errors
    const validationError = getValidationError(job, weekStart, scheduledSamples);
    
    if (validationError) {
      // Show validation error and don't save
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    // Only update if validation passes
    updateScheduleMutation.mutate({ jobId, stageId: currentStage.id, weekStart, scheduledSamples });
  };

  const getJobStageSchedules = (job: JobWithSchedules, weekStart: string) => {
    return job.schedules
      .filter(schedule => schedule.weekStart === weekStart)
      .sort((a, b) => a.stage.order - b.stage.order);
  };

  const getApplicableStages = (job: JobWithSchedules) => {
    // For now, return all stages - later this will be filtered by activity type relationships
    return stages.filter(stage => stage.order <= 6).sort((a, b) => a.order - b.order);
  };

  const getSchedulingProgress = (job: JobWithSchedules) => {
    const applicableStages = getApplicableStages(job);
    const progress: { [stageId: number]: { scheduled: number; total: number; complete: boolean } } = {};
    
    applicableStages.forEach(stage => {
      const stageSchedules = job.schedules.filter(s => s.stageId === stage.id);
      const scheduledSamples = stageSchedules.reduce((sum, s) => sum + s.scheduledSamples, 0);
      const isComplete = scheduledSamples >= job.totalSamples;
      
      progress[stage.id] = {
        scheduled: scheduledSamples,
        total: job.totalSamples,
        complete: isComplete
      };
    });
    
    return progress;
  };

  const getMaxSamples = (job: JobWithSchedules, weekStart: string): number => {
    if (!isWeekInValidRange(job, weekStart)) {
      return 0;
    }
    
    // Check sequential stage validation
    const maxAllowedByPreviousStage = getMaxSamplesByPreviousStage(job, weekStart);
    
    const activityCapacity = weekCapacities.find(
      wc => wc.activityType === job.activityType && wc.weekStart === weekStart
    );
    
    // Calculate max samples without capacity constraint for input validation
    const maxWithoutCapacity = currentStage.order === 1 
      ? maxAllowedByPreviousStage
      : Math.min(job.remainingSamples, maxAllowedByPreviousStage);
    
    // For display purposes, include capacity constraint
    const result = Math.min(maxWithoutCapacity, activityCapacity?.remainingCapacity || 0);
    

    
    return result;
  };

  const getMaxSamplesForInput = (job: JobWithSchedules, weekStart: string): number => {
    if (!isWeekInValidRange(job, weekStart)) {
      return 0;
    }
    
    const maxAllowedByPreviousStage = getMaxSamplesByPreviousStage(job, weekStart);
    

    
    // Return max without capacity constraint for input validation
    // For sequential stages, don't limit by remainingSamples since samples flow between stages
    return maxAllowedByPreviousStage;
  };

  const getValidationError = (job: JobWithSchedules, weekStart: string, value: number): string | null => {
    const maxForInput = getMaxSamplesForInput(job, weekStart);
    const activityCapacity = weekCapacities.find(
      wc => wc.activityType === job.activityType && wc.weekStart === weekStart
    );
    
    if (value > maxForInput) {
      if (currentStage.order > 1) {

        return `Cannot exceed ${maxForInput} samples - limited by previous stage completion`;
      }
      return `Cannot exceed ${maxForInput} samples for this job`;
    }
    
    if (activityCapacity) {
      const currentScheduled = getScheduledSamples(job.id, weekStart);
      const capacityChangeNeeded = value - currentScheduled;
      

      
      if (capacityChangeNeeded > 0 && capacityChangeNeeded > activityCapacity.remainingCapacity) {
        const available = activityCapacity.remainingCapacity + currentScheduled;
        return `Exceeds capacity by ${capacityChangeNeeded - activityCapacity.remainingCapacity} samples. Available: ${available}`;
      }
    }
    
    return null;
  };

  const getMaxSamplesByPreviousStage = (job: JobWithSchedules, weekStart: string): number => {
    // For the first stage, no previous stage validation needed - return total samples
    if (currentStage.order === 1) {
      return job.totalSamples;
    }

    // Find the previous stage
    const previousStage = currentStage.order - 1;
    
    // Get all schedules for this job in the previous stage
    const previousStageSchedules = job.schedules.filter(s => s.stage.order === previousStage);
    
    // Calculate total samples scheduled in previous stage up to and including current week
    const currentWeekDate = new Date(weekStart);
    let totalPreviousStageScheduled = 0;
    
    for (const schedule of previousStageSchedules) {
      const scheduleWeekDate = new Date(schedule.weekStart);
      if (scheduleWeekDate <= currentWeekDate) {
        totalPreviousStageScheduled += schedule.scheduledSamples;
      }
    }

    // Calculate how many samples are already scheduled in current stage up to current week (excluding current week)
    const currentStageSchedules = job.schedules.filter(s => s.stage.id === currentStage.id);
    let totalCurrentStageScheduled = 0;
    
    for (const schedule of currentStageSchedules) {
      const scheduleWeekDate = new Date(schedule.weekStart);
      if (scheduleWeekDate < currentWeekDate) { // Changed from <= to < to exclude current week
        totalCurrentStageScheduled += schedule.scheduledSamples;
      }
    }





    // Available samples = previous stage total - already scheduled in current stage (before current week)
    return Math.max(0, totalPreviousStageScheduled - totalCurrentStageScheduled);
  };

  const getRemainingForCurrentStage = (job: JobWithSchedules): number => {
    // Calculate total samples scheduled for the current stage
    const currentStageSchedules = job.schedules.filter(s => s.stage.id === currentStage.id);
    const totalScheduledInCurrentStage = currentStageSchedules.reduce((sum, schedule) => 
      sum + schedule.scheduledSamples, 0
    );
    
    return job.totalSamples - totalScheduledInCurrentStage;
  };

  const getCapacityColor = (remaining: number, total: number) => {
    const percentage = total > 0 ? remaining / total : 0;
    if (percentage > 0.5) return "text-green-600";
    if (percentage > 0.2) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      {/* Main Scheduling Grid */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1600px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left border-r border-gray-200 min-w-[300px]">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                    Job Details
                  </div>
                  <div className="grid grid-cols-4 gap-x-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <span>Total</span>
                    <span>Remaining</span>
                    <span>Material</span>
                    <span>Deadline</span>
                  </div>
                </th>
                {weeks.map((week) => (
                  <th
                    key={formatDate(week)}
                    className="px-2 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200 min-w-[80px]"
                  >
                    <div className="transform -rotate-90 whitespace-nowrap flex items-center justify-center h-16">
                      <div className="flex flex-col items-center space-y-1">
                        <span>Week {getWeekNumber(week)}</span>
                        <span className="text-gray-400 font-normal normal-case text-[10px]">
                          {formatWeekLabel(week)}
                        </span>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white hover:bg-gray-50 px-4 py-2 border-r border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="text-sm font-semibold text-gray-900 truncate">
                            {job.name}
                          </h4>
                          <Badge 
                            variant="secondary"
                            className={`text-xs ${activityTypeColors[job.activityType] || "bg-gray-100 text-gray-800"}`}
                          >
                            {job.activityType}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-x-3 text-xs">
                          <span className="font-medium text-gray-900">{job.totalSamples}</span>
                          <span className={`font-semibold ${
                            getRemainingForCurrentStage(job) > 0 ? "text-yellow-600" : "text-green-600"
                          }`}>
                            {getRemainingForCurrentStage(job)}
                          </span>
                          <span className="font-medium text-gray-900">
                            {new Date(job.materialArrivesDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="font-medium text-red-600">
                            {new Date(job.deadlineDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="ml-2 text-gray-400 hover:text-gray-600 p-1">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                  {weeks.map((week) => {
                    const weekStart = formatDate(week);
                    const scheduledSamples = getScheduledSamples(job.id, weekStart);
                    const displayValue = getDisplayValue(job.id, weekStart);
                    const maxSamples = getMaxSamples(job, weekStart);
                    const isValidWeek = isWeekInValidRange(job, weekStart);
                    
                    return (
                      <td key={weekStart} className={`px-2 py-4 text-center border-r border-gray-200 ${
                        !isValidWeek ? "bg-gray-50" : ""
                      }`}>
                        {isValidWeek ? (
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              value={displayValue}
                              onChange={(e) => handleScheduleChange(job.id, weekStart, e.target.value)}
                              onBlur={() => handleScheduleBlur(job.id, weekStart)}
                              className={`w-12 px-1 py-1 text-xs text-center border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                getValidationError(job, weekStart, displayValue)
                                  ? "border-red-500 ring-red-500" 
                                  : "border-gray-300"
                              }`}
                              title={getValidationError(job, weekStart, displayValue) || `Available: ${getMaxSamplesForInput(job, weekStart)} samples`}
                            />
                          </div>
                        ) : (
                          <div className="w-12 px-1 py-1 text-xs text-gray-400 text-center">
                            N/A
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Capacity Summary */}
      <Card>
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Weekly Capacity Summary</h3>
          <p className="text-sm text-gray-600 mt-1">
            Remaining capacity by activity type for each week
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[200px]">
                  Activity Type
                </th>
                {weeks.map((week) => (
                  <th
                    key={formatDate(week)}
                    className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider"
                  >
                    Week {getWeekNumber(week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {["Chemical Analysis", "Environmental Testing", "Microbiology"].map((activityType) => (
                <tr key={activityType}>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div 
                        className={`w-3 h-3 rounded-full ${
                          activityType === "Chemical Analysis" ? "bg-blue-500" :
                          activityType === "Environmental Testing" ? "bg-green-500" :
                          "bg-purple-500"
                        }`}
                      />
                      <span className="text-sm font-medium text-gray-900">
                        {activityType}
                      </span>
                    </div>
                  </td>
                  {weeks.map((week) => {
                    const weekStart = formatDate(week);
                    const capacity = weekCapacities.find(
                      wc => wc.activityType === activityType && wc.weekStart === weekStart
                    );
                    const remaining = capacity?.remainingCapacity || 0;
                    const total = capacity?.maxCapacity || 0;
                    
                    return (
                      <td key={weekStart} className="px-4 py-4 text-center">
                        <div className="text-sm">
                          <span className={`font-semibold ${getCapacityColor(remaining, total)}`}>
                            {remaining}
                          </span>
                          <span className="text-gray-400 text-xs"> / </span>
                          <span className="text-gray-600">{total}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
