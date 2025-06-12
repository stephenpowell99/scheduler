import { useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { type WeekCapacity, type Stage } from "@shared/schema";
import { formatWeekLabel } from "@/lib/date-utils";

interface CapacityUtilizationGridProps {
  weekCapacities: WeekCapacity[];
  weeks: Date[];
  stages: Stage[];
  scrollRef?: React.RefObject<HTMLDivElement>;
}

const getStageColor = (stageId: number, stages: Stage[]): string => {
  if (!stages) return "#3B82F6";
  const stage = stages.find(s => s.id === stageId);
  return stage?.color || "#3B82F6";
};

export function CapacityUtilizationGrid({ 
  weekCapacities, 
  weeks, 
  stages,
  scrollRef 
}: CapacityUtilizationGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Sync scroll with the main scheduling grid
  useEffect(() => {
    if (!scrollRef?.current || !gridRef.current) return;

    const handleScroll = () => {
      if (gridRef.current && scrollRef.current) {
        gridRef.current.scrollLeft = scrollRef.current.scrollLeft;
      }
    };

    const scrollElement = scrollRef.current;
    scrollElement.addEventListener('scroll', handleScroll);

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [scrollRef]);

  const getCapacityForStageAndWeek = (stageId: number, weekStart: string) => {
    return weekCapacities.find(wc => 
      wc.stageId === stageId && wc.weekStart === weekStart
    );
  };

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  return (
    <Card className="w-full overflow-hidden mt-4">
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Capacity Utilization</h3>
      </div>
      
      <div className="overflow-x-auto" ref={gridRef}>
        <div className="min-w-max">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 z-10">
                  Stage
                </th>
                {weeks.map((week) => (
                  <th
                    key={formatDate(week)}
                    className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]"
                  >
                    {formatWeekLabel(week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stages.map((stage) => (
                <tr key={stage.id} className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white px-6 py-4 border-r border-gray-200 z-10">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-5 h-4 rounded-sm flex items-center justify-center text-white text-xs font-semibold"
                        style={{ backgroundColor: getStageColor(stage.id, stages) }}
                        title={stage.name}
                      >
                        {stage.order}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {stage.name}
                      </span>
                    </div>
                  </td>
                  {weeks.map((week) => {
                    const weekStart = formatDate(week);
                    const capacity = getCapacityForStageAndWeek(stage.id, weekStart);
                    
                    if (!capacity) {
                      return (
                        <td key={weekStart} className="px-4 py-4 text-center">
                          <div className="text-sm text-gray-400">No data</div>
                        </td>
                      );
                    }

                    const utilizationRate = capacity.maxCapacity > 0 
                      ? Math.round((capacity.usedCapacity / capacity.maxCapacity) * 100) 
                      : 0;

                    const getUtilizationColor = (rate: number) => {
                      if (rate >= 90) return "bg-red-500";
                      if (rate >= 75) return "bg-yellow-500"; 
                      if (rate >= 50) return "bg-blue-500";
                      return "bg-green-500";
                    };

                    return (
                      <td key={weekStart} className="px-4 py-4">
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>{capacity.usedCapacity}</span>
                            <span>{capacity.maxCapacity}</span>
                          </div>
                          <Progress 
                            value={utilizationRate} 
                            className="h-2"
                          />
                          <div className="text-center">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${getUtilizationColor(utilizationRate)}`}>
                              {utilizationRate}%
                            </span>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}