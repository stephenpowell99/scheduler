import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { formatWeekLabel, getWeekNumber } from "@/lib/date-utils";

interface WeekNavigationProps {
  currentWeek: Date;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onGoToToday: () => void;
}

export function WeekNavigation({ 
  currentWeek, 
  onPreviousWeek, 
  onNextWeek, 
  onGoToToday 
}: WeekNavigationProps) {
  const weekNumber = getWeekNumber(currentWeek);
  const year = currentWeek.getFullYear();

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center space-x-4 mr-8">
        <Button
          variant="outline"
          onClick={onPreviousWeek}
          className="flex items-center space-x-2"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Previous</span>
        </Button>
        <Button
          variant="outline"
          onClick={onNextWeek}
          className="flex items-center space-x-2"
        >
          <span>Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          onClick={onGoToToday}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700"
        >
          <Calendar className="h-4 w-4" />
          <span>Today</span>
        </Button>
      </div>
      <div className="text-sm text-gray-500">
        Current Week: <strong>Week {weekNumber}, {year}</strong>
      </div>
    </div>
  );
}
