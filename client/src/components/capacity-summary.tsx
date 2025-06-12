import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { type WeekCapacity } from "@shared/schema";

interface CapacitySummaryProps {
  weekCapacities: WeekCapacity[];
  weeks: Date[];
}

export function CapacitySummary({ weekCapacities, weeks }: CapacitySummaryProps) {
  const getTotalCapacity = () => {
    return weekCapacities.reduce((sum, wc) => sum + wc.maxCapacity, 0);
  };

  const getTotalUsed = () => {
    return weekCapacities.reduce((sum, wc) => sum + wc.usedCapacity, 0);
  };

  const getTotalRemaining = () => {
    return weekCapacities.reduce((sum, wc) => sum + wc.remainingCapacity, 0);
  };

  const getUtilizationRate = () => {
    const total = getTotalCapacity();
    const used = getTotalUsed();
    return total > 0 ? Math.round((used / total) * 100) : 0;
  };

  const getStageUtilization = (stageId: number) => {
    const stageCapacities = weekCapacities.filter(wc => wc.stageId === stageId);
    const totalCapacity = stageCapacities.reduce((sum, wc) => sum + wc.maxCapacity, 0);
    const usedCapacity = stageCapacities.reduce((sum, wc) => sum + wc.usedCapacity, 0);
    return totalCapacity > 0 ? Math.round((usedCapacity / totalCapacity) * 100) : 0;
  };

  const stages = Array.from(
    new Map(weekCapacities.map(wc => [wc.stageId, { id: wc.stageId, name: wc.stageName }])).values()
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">
            Stage Utilization Trends
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stages.map((stage) => {
            const utilization = getStageUtilization(stage.id);
            return (
              <div key={stage.id} className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {stage.name}
                </span>
                <div className="flex items-center space-x-2">
                  <Progress 
                    value={utilization} 
                    className="w-24"
                  />
                  <span className="text-sm text-gray-600 w-8">
                    {utilization}%
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">
            Weekly Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Total Scheduled</span>
            <span className="text-sm font-semibold text-gray-900">
              {getTotalUsed()} samples
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Total Capacity</span>
            <span className="text-sm font-semibold text-gray-900">
              {getTotalCapacity()} samples
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Remaining Capacity</span>
            <span className="text-sm font-semibold text-green-600">
              {getTotalRemaining()} samples
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-600">Utilization Rate</span>
            <span className="text-sm font-semibold text-blue-600">
              {getUtilizationRate()}%
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
