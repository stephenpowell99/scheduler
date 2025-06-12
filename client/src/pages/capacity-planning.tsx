import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CapacitySummary } from "@/components/capacity-summary";
import { getWeekStart, getCurrentWeekDates, formatDate, getWeekNumber, formatWeekLabel, addWeeks } from "@/lib/date-utils";
import { type Capacity, type WeekCapacity, type Stage } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Info, ChevronLeft, ChevronRight, Calendar } from "lucide-react";

export default function CapacityPlanning() {
  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart(new Date()));
  const [capacityValues, setCapacityValues] = useState<Record<string, number>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const weeks = getCurrentWeekDates(currentWeek, 4);
  const weekStarts = weeks.map(week => formatDate(week));

  const { data: stages = [] } = useQuery<Stage[]>({
    queryKey: ["/api/stages"],
  });

  const { data: capacities = [] } = useQuery<Capacity[]>({
    queryKey: ["/api/capacities"],
  });

  const { data: weekCapacities = [] } = useQuery<WeekCapacity[]>({
    queryKey: ["/api/capacities", { weekStarts: weekStarts.join(',') }],
    queryFn: async () => {
      const response = await fetch(`/api/capacities?weekStarts=${weekStarts.join(',')}`);
      if (!response.ok) throw new Error('Failed to fetch capacities');
      return response.json();
    },
  });

  const updateCapacityMutation = useMutation({
    mutationFn: async ({ stageId, weekStart, maxCapacity }: {
      stageId: number;
      weekStart: string;
      maxCapacity: number;
    }) => {
      const response = await apiRequest("POST", "/api/capacities", {
        stageId,
        weekStart,
        maxCapacity,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capacities"] });
      toast({
        title: "Success",
        description: "Capacity settings saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save capacity settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getCapacityValue = (stageId: number, weekStart: string): number => {
    const key = `${stageId}|${weekStart}`;
    if (capacityValues[key] !== undefined) {
      return capacityValues[key];
    }
    
    const capacity = capacities.find(c => 
      c.stageId === stageId && c.weekStart === weekStart
    );
    return capacity?.maxCapacity || 0;
  };

  const handleCapacityChange = (stageId: number, weekStart: string, value: string) => {
    const maxCapacity = parseInt(value) || 0;
    const key = `${stageId}|${weekStart}`;
    
    setCapacityValues(prev => ({
      ...prev,
      [key]: maxCapacity,
    }));
  };

  const handleSaveChanges = () => {
    const updates = Object.entries(capacityValues).map(([key, maxCapacity]) => {
      const [stageIdStr, weekStart] = key.split('|');
      const stageId = parseInt(stageIdStr);
      return { stageId, weekStart, maxCapacity };
    });

    updates.forEach(update => {
      updateCapacityMutation.mutate(update);
    });

    setCapacityValues({});
  };

  const hasUnsavedChanges = Object.keys(capacityValues).length > 0;

  const handlePreviousWeek = () => {
    setCurrentWeek(addWeeks(new Date(currentWeek), -1));
  };

  const handleNextWeek = () => {
    setCurrentWeek(addWeeks(new Date(currentWeek), 1));
  };

  const handleGoToToday = () => {
    setCurrentWeek(getWeekStart(new Date()));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Capacity Planning</h2>
          <p className="text-gray-600 mt-2">
            Set weekly capacity limits for each activity type to manage resource allocation effectively.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handlePreviousWeek}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="px-3 py-1 bg-gray-100 rounded-md text-sm font-medium">
            Week {getWeekNumber(new Date(currentWeek))} - {formatWeekLabel(new Date(currentWeek))}
          </div>
          <Button variant="outline" size="sm" onClick={handleNextWeek}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleGoToToday}>
            <Calendar className="w-4 h-4 mr-1" />
            Today
          </Button>
        </div>
      </div>

      {/* Capacity Configuration Grid */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-gray-900">
              Weekly Capacity Configuration
            </CardTitle>
            <Button
              onClick={handleSaveChanges}
              disabled={!hasUnsavedChanges || updateCapacityMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateCapacityMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
                {stages.map((stage) => (
                  <tr key={stage.id}>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className="text-sm font-medium text-gray-900">
                          {stage.name}
                        </span>
                      </div>
                    </td>
                    {weeks.map((week) => {
                      const weekStart = formatDate(week);
                      const capacityValue = getCapacityValue(stage.id, weekStart);
                      
                      return (
                        <td key={weekStart} className="px-4 py-4 text-center">
                          <Input
                            type="number"
                            min="0"
                            value={capacityValue}
                            onChange={(e) => handleCapacityChange(stage.id, weekStart, e.target.value)}
                            className="w-20 px-3 py-2 text-sm text-center border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <div className="flex items-center justify-center">
              <p className="text-sm text-gray-600 flex items-center">
                <Info className="h-4 w-4 text-blue-500 mr-2" />
                Capacity settings determine the maximum number of samples that can be scheduled for each activity type per week.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Capacity Analytics */}
      <CapacitySummary
        weekCapacities={weekCapacities}
        weeks={weeks}
      />
    </div>
  );
}
