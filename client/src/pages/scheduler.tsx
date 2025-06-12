import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search } from "lucide-react";
import { WeekNavigation } from "@/components/week-navigation";
import { MultiStageSchedulingGrid } from "@/components/multi-stage-scheduling-grid";
import { CapacityUtilizationGrid } from "@/components/capacity-utilization-grid";
import { AddJobDialog } from "@/components/add-job-dialog";
import { getWeekStart, getCurrentWeekDates, formatDate } from "@/lib/date-utils";
import { type JobWithSchedules, type WeekCapacity, type Stage } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function Scheduler() {
  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart(new Date()));
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const { toast } = useToast();
  
  const weeks = getCurrentWeekDates(currentWeek, 12);
  const weekStarts = weeks.map(week => formatDate(week));

  const { data: allJobs = [], isLoading: jobsLoading } = useQuery<JobWithSchedules[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: stages = [], isLoading: stagesLoading } = useQuery<Stage[]>({
    queryKey: ["/api/stages"],
  });

  // Filter jobs based on search query
  const jobs = allJobs.filter(job => 
    job.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { data: weekCapacities = [], isLoading: capacitiesLoading } = useQuery<WeekCapacity[]>({
    queryKey: ["/api/capacities", { weekStarts: weekStarts.join(',') }],
    queryFn: async () => {
      const response = await fetch(`/api/capacities?weekStarts=${weekStarts.join(',')}`);
      if (!response.ok) throw new Error('Failed to fetch capacities');
      return response.json();
    },
  });

  const handlePreviousWeek = () => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(newWeek.getDate() - 7);
    setCurrentWeek(newWeek);
  };

  const handleNextWeek = () => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(newWeek.getDate() + 7);
    setCurrentWeek(newWeek);
  };

  const handleGoToToday = () => {
    setCurrentWeek(getWeekStart(new Date()));
  };

  const handleExport = () => {
    toast({
      title: "Export",
      description: "Export functionality would be implemented here.",
    });
  };

  if (jobsLoading || capacitiesLoading || stagesLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded mb-6"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <WeekNavigation
          currentWeek={currentWeek}
          onPreviousWeek={handlePreviousWeek}
          onNextWeek={handleNextWeek}
          onGoToToday={handleGoToToday}
        />
        <div className="flex items-center space-x-4">
          <AddJobDialog />
          <Button
            variant="outline"
            onClick={handleExport}
            className="flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>
        </div>
      </div>

      {/* Search and Filter Section */}
      <Card className="p-4 mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 flex-1 max-w-md">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search jobs by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
          </div>
          {searchQuery && (
            <div className="text-sm text-gray-500">
              Showing {jobs.length} of {allJobs.length} jobs
            </div>
          )}
        </div>
      </Card>



      {/* Multi-Stage Scheduling Grid */}
      <MultiStageSchedulingGrid 
        jobs={jobs} 
        weeks={weeks} 
        weekCapacities={weekCapacities}
        stages={stages}
        scrollRef={scrollRef}
      />

      {/* Capacity Utilization Grid */}
      <CapacityUtilizationGrid
        weekCapacities={weekCapacities}
        weeks={weeks}
        stages={stages}
        scrollRef={scrollRef}
      />
    </div>
  );
}
