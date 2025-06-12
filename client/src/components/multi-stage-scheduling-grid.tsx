import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoreVertical, CheckCircle, Circle, AlertCircle, Plus, X, GripVertical, Trash2, ArrowRight, ArrowLeft } from "lucide-react";
import { type JobWithSchedules, type WeekCapacity, type Stage } from "@shared/schema";
import { formatWeekLabel, getWeekNumber, formatDate } from "@/lib/date-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DragDropContext, Droppable, Draggable, DropResult } from "react-beautiful-dnd";

interface MultiStageSchedulingGridProps {
  jobs: JobWithSchedules[];
  weeks: Date[];
  weekCapacities: WeekCapacity[];
  stages: Stage[];
  scrollRef?: React.RefObject<HTMLDivElement>;
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

export function MultiStageSchedulingGrid({ jobs, weeks, weekCapacities, stages, scrollRef }: MultiStageSchedulingGridProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showingAddSelect, setShowingAddSelect] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [shiftDialogOpen, setShiftDialogOpen] = useState<number | null>(null);
  const [shiftWeeks, setShiftWeeks] = useState("1");
  const [shiftDirection, setShiftDirection] = useState<"forward" | "backward">("forward");

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
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to update schedule";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const moveScheduleMutation = useMutation({
    mutationFn: async ({ jobId, stageId, fromWeek, toWeek, quantity }: {
      jobId: number;
      stageId: number;
      fromWeek: string;
      toWeek: string;
      quantity: number;
    }) => {
      await apiRequest("POST", `/api/schedules/${jobId}/${stageId}/move`, {
        fromWeek,
        toWeek,
        quantity,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/capacities"] });
      toast({
        title: "Success",
        description: "Schedule moved successfully",
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to move schedule";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: number) => {
      await apiRequest("DELETE", `/api/jobs/${jobId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/capacities"] });
      toast({
        title: "Success",
        description: "Job deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete job",
        variant: "destructive",
      });
    },
  });

  const shiftScheduleMutation = useMutation({
    mutationFn: async ({ jobId, weeks, direction }: { jobId: number; weeks: number; direction: "forward" | "backward" }) => {
      await apiRequest("POST", `/api/jobs/${jobId}/shift-schedule`, {
        weeks: direction === "forward" ? weeks : -weeks,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/capacities"] });
      setShiftDialogOpen(null);
      toast({
        title: "Success",
        description: "Schedule shifted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to shift schedule",
        variant: "destructive",
      });
    },
  });

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

  const getStageColor = (stageId: number): string => {
    const stage = stages.find(s => s.id === stageId);
    return stage?.color || '#64748b';
  };

  const getStageSchedule = (job: JobWithSchedules, stageId: number, weekStart: string): number => {
    const schedule = job.schedules.find(s => s.stageId === stageId && s.weekStart === weekStart);
    return schedule?.scheduledSamples || 0;
  };

  const updateStageSchedule = (jobId: number, stageId: number, weekStart: string, scheduledSamples: number) => {
    updateScheduleMutation.mutate({ jobId, stageId, weekStart, scheduledSamples });
  };

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    
    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;
    
    // Parse the draggable ID: job{jobId}-stage{stageId}-week{weekStart}-qty{quantity}
    const jobMatch = draggableId.match(/job(\d+)/);
    const stageMatch = draggableId.match(/stage(\d+)/);
    const weekMatch = draggableId.match(/week([^-]+)/);
    const qtyMatch = draggableId.match(/qty(\d+)/);
    
    if (!jobMatch || !stageMatch || !weekMatch || !qtyMatch) {
      console.error('Failed to parse draggable ID:', draggableId);
      return;
    }
    
    const jobId = parseInt(jobMatch[1]);
    const stageId = parseInt(stageMatch[1]);
    const quantity = parseInt(qtyMatch[1]);
    
    // Parse droppable IDs: {jobId}-{weekStart}
    const fromWeek = source.droppableId.split('-').slice(1).join('-');
    const toWeek = destination.droppableId.split('-').slice(1).join('-');
    
    // Ensure we're only moving within the same job
    const sourceJobId = parseInt(source.droppableId.split('-')[0]);
    const destJobId = parseInt(destination.droppableId.split('-')[0]);
    
    if (sourceJobId !== destJobId || sourceJobId !== jobId) {
      console.warn('Cannot move between different jobs');
      return;
    }
    
    if (quantity > 0) {
      console.log('Moving schedule:', { jobId, stageId, fromWeek, toWeek, quantity });
      moveScheduleMutation.mutate({
        jobId,
        stageId, 
        fromWeek,
        toWeek,
        quantity
      });
    }
  };

  const getJobStageSchedules = (job: JobWithSchedules, weekStart: string) => {
    return job.schedules
      .filter(schedule => schedule.weekStart === weekStart)
      .sort((a, b) => a.stage.order - b.stage.order);
  };

  const renderProgressIndicators = (job: JobWithSchedules) => {
    const progress = getSchedulingProgress(job);
    const applicableStages = getApplicableStages(job);
    
    return (
      <div className="flex flex-wrap gap-1 mb-2">
        {applicableStages.map(stage => {
          const stageProgress = progress[stage.id];
          const Icon = stageProgress.complete ? CheckCircle : 
                     stageProgress.scheduled > 0 ? AlertCircle : Circle;
          const iconColor = stageProgress.complete ? "text-green-600" : 
                           stageProgress.scheduled > 0 ? "text-yellow-600" : "text-gray-400";
          
          return (
            <div key={stage.id} className="flex items-center space-x-1" title={`${stage.name}: ${stageProgress.scheduled}/${stageProgress.total} samples`}>
              <Icon className={`h-3 w-3 ${iconColor}`} />
              <span className="text-xs text-gray-600">{stage.name.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const isWeekAfterDeadline = (weekStart: string, deadlineDate: string): boolean => {
    const weekStartDate = new Date(weekStart);
    const deadline = new Date(deadlineDate);
    return weekStartDate > deadline;
  };

  const renderStageInputs = (job: JobWithSchedules, weekStart: string) => {
    const existingSchedules = getJobStageSchedules(job, weekStart);
    const applicableStages = getApplicableStages(job);
    
    // Only show stages that have actual scheduled quantities (> 0)
    const stagesWithQuantities = existingSchedules.filter(s => 
      getStageSchedule(job, s.stage.id, weekStart) > 0
    );
    
    const cellKey = `${job.id}-${weekStart}`;
    const isShowingSelect = showingAddSelect === cellKey;
    
    return (
      <Droppable droppableId={`${job.id}-${weekStart}`}>
        {(provided, snapshot) => (
          <div 
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`space-y-1 min-h-[24px] ${snapshot.isDraggingOver ? 'bg-blue-50 rounded border-2 border-blue-200 border-dashed' : ''}`}
          >
            {stagesWithQuantities.map((schedule, index) => {
              const currentValue = getStageSchedule(job, schedule.stage.id, weekStart);
              const inputKey = `${job.id}-${schedule.stage.id}-${weekStart}`;
              const displayValue = inputValues[inputKey] !== undefined ? inputValues[inputKey] : currentValue.toString();
              const draggableId = `job${job.id}-stage${schedule.stage.id}-week${weekStart}-qty${currentValue}`;
              
              return (
                <Draggable key={`${schedule.stage.id}-${weekStart}`} draggableId={draggableId} index={index}>
                  {(provided, snapshot) => (
                    <div 
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`flex items-center space-x-1 ${snapshot.isDragging ? 'bg-blue-50 rounded shadow-md' : ''}`}
                    >
                      <div 
                        {...provided.dragHandleProps}
                        className="flex items-center space-x-1 cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="w-3 h-3 text-gray-400" />
                        <div 
                          className="w-5 h-4 rounded-sm flex items-center justify-center text-white text-xs font-semibold"
                          style={{ backgroundColor: getStageColor(schedule.stage.id) }}
                          title={schedule.stage.name}
                        >
                          {schedule.stage.order}
                        </div>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max={job.totalSamples}
                        value={displayValue}
                        onChange={(e) => {
                          setInputValues(prev => ({
                            ...prev,
                            [inputKey]: e.target.value
                          }));
                        }}
                        onBlur={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          if (value !== currentValue) {
                            updateStageSchedule(job.id, schedule.stage.id, weekStart, value);
                          }
                          // Clear the temporary input state after processing
                          setInputValues(prev => {
                            const newState = { ...prev };
                            delete newState[inputKey];
                            return newState;
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const value = parseInt(e.currentTarget.value) || 0;
                            if (value !== currentValue) {
                              updateStageSchedule(job.id, schedule.stage.id, weekStart, value);
                            }
                            // Clear the temporary input state after processing
                            setInputValues(prev => {
                              const newState = { ...prev };
                              delete newState[inputKey];
                              return newState;
                            });
                            e.currentTarget.blur(); // Remove focus after Enter
                          }
                        }}
                        className="h-6 text-xs w-12 px-1"
                        placeholder="0"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => {
                          updateStageSchedule(job.id, schedule.stage.id, weekStart, 0);
                        }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
        
            {/* Add stage selector or plus button */}
            {isShowingSelect ? (
              <div className="flex items-center space-x-1">
                <Select 
                  onValueChange={(stageId) => {
                    const stage = applicableStages.find(s => s.id.toString() === stageId);
                    if (stage) {
                      updateStageSchedule(job.id, stage.id, weekStart, 1);
                      setShowingAddSelect(null);
                    }
                  }}
                >
                  <SelectTrigger className="h-6 text-xs w-20">
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {applicableStages
                      .filter(stage => !stagesWithQuantities.some(s => s.stage.id === stage.id))
                      .map((stage) => (
                        <SelectItem key={stage.id} value={stage.id.toString()}>
                          <div className="flex items-center space-x-2">
                            <div 
                              className="w-3 h-3 rounded-sm flex items-center justify-center text-white text-xs font-semibold"
                              style={{ backgroundColor: getStageColor(stage.id) }}
                            >
                              {stage.order}
                            </div>
                            <span className="text-xs">{stage.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 text-gray-400"
                  onClick={() => setShowingAddSelect(null)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              // Show plus button only if there are available stages to add
              applicableStages.length > stagesWithQuantities.length && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 text-gray-400 hover:text-blue-500"
                  onClick={() => setShowingAddSelect(cellKey)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              )
            )}
          </div>
        )}
      </Droppable>
    );
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Card className="w-full overflow-hidden">
        <div className="overflow-x-auto" ref={scrollRef}>
          <table className="w-full min-w-[1600px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left border-r border-gray-200 min-w-[300px]">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                    Job Details & Progress
                  </div>
                  <div className="grid grid-cols-3 gap-x-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <span>Total</span>
                    <span>Material Arrives</span>
                    <span>Deadline</span>
                  </div>
                </th>
                {weeks.map((week) => (
                  <th
                    key={formatDate(week)}
                    className="px-2 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200 min-w-[120px]"
                  >
                    <div className="flex flex-col items-center space-y-1">
                      <span>{formatWeekLabel(week)}</span>
                      <span className="text-gray-400 text-xs">W{getWeekNumber(week)}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="sticky left-0 bg-white px-4 py-4 border-r border-gray-200 z-10">
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-medium text-gray-900">{job.name}</h3>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete Job
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Job</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{job.name}"? This will permanently remove the job and all its schedules. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteJobMutation.mutate(job.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              <DropdownMenuItem onClick={() => setShiftDialogOpen(job.id)}>
                                <ArrowRight className="w-4 h-4 mr-2" />
                                Shift Schedule
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <Badge 
                          className={`text-xs ${activityTypeColors[job.activityType] || "bg-gray-100 text-gray-800"}`}
                        >
                          {job.activityType}
                        </Badge>
                        {renderProgressIndicators(job)}
                      </div>
                      <div className="grid grid-cols-3 gap-x-3 text-xs text-gray-600">
                        <span className="font-medium">{job.totalSamples}</span>
                        <span>{new Date(job.materialArrivesDate).toLocaleDateString('en-GB')}</span>
                        <span className={`${
                          weeks.some(week => {
                            const weekStart = formatDate(week);
                            const hasScheduledSamples = getJobStageSchedules(job, weekStart).some(s => 
                              getStageSchedule(job, s.stage.id, weekStart) > 0
                            );
                            return hasScheduledSamples && isWeekAfterDeadline(weekStart, job.deadlineDate);
                          }) ? 'text-red-600 font-medium' : ''
                        }`}>
                          {new Date(job.deadlineDate).toLocaleDateString('en-GB')}
                        </span>
                      </div>
                    </div>
                  </td>
                  {weeks.map((week) => {
                    const weekStart = formatDate(week);
                    
                    return (
                      <td key={weekStart} className="px-2 py-3 text-center border-r border-gray-200">
                        {renderStageInputs(job, weekStart)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Shift Schedule Dialog */}
      <Dialog open={shiftDialogOpen !== null} onOpenChange={(open) => !open && setShiftDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shift Schedule</DialogTitle>
            <DialogDescription>
              Move all schedules for this job forward or backward by a specified number of weeks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="shift-weeks">Number of weeks</Label>
                <Input
                  id="shift-weeks"
                  type="number"
                  min="1"
                  max="52"
                  value={shiftWeeks}
                  onChange={(e) => setShiftWeeks(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="shift-direction">Direction</Label>
                <Select value={shiftDirection} onValueChange={(value: "forward" | "backward") => setShiftDirection(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forward">
                      <div className="flex items-center space-x-2">
                        <ArrowRight className="w-4 h-4" />
                        <span>Forward</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="backward">
                      <div className="flex items-center space-x-2">
                        <ArrowLeft className="w-4 h-4" />
                        <span>Backward</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShiftDialogOpen(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (shiftDialogOpen) {
                  shiftScheduleMutation.mutate({
                    jobId: shiftDialogOpen,
                    weeks: parseInt(shiftWeeks),
                    direction: shiftDirection,
                  });
                }
              }}
              disabled={shiftScheduleMutation.isPending}
            >
              {shiftScheduleMutation.isPending ? "Shifting..." : "Shift Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DragDropContext>
  );
}