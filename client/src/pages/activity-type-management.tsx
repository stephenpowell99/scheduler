import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trash2, Plus, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ActivityType, Stage, ActivityTypeStage } from "@shared/schema";

interface ActivityTypeWithStages extends ActivityType {
  stages: (ActivityTypeStage & { stage: Stage })[];
}

export default function ActivityTypeManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedActivityType, setSelectedActivityType] = useState<number | null>(null);
  const [localProcessingTimes, setLocalProcessingTimes] = useState<Record<number, number>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newActivityTypeName, setNewActivityTypeName] = useState("");
  const [newActivityTypeColor, setNewActivityTypeColor] = useState("#3B82F6");

  const { data: activityTypes = [], isLoading: loadingActivityTypes } = useQuery<ActivityType[]>({
    queryKey: ['/api/activity-types'],
  });

  const { data: stages = [], isLoading: loadingStages } = useQuery<Stage[]>({
    queryKey: ['/api/stages'],
  });

  const { data: activityTypeStages = [], isLoading: loadingActivityTypeStages } = useQuery<ActivityTypeStage[]>({
    queryKey: ['/api/activity-type-stages'],
  });

  const createActivityTypeStage = useMutation({
    mutationFn: async (data: { activityTypeId: number; stageId: number; processingTimeDays: number }) => {
      return await apiRequest('POST', '/api/activity-type-stages', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/activity-type-stages'] });
      toast({ title: "Stage relationship created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create stage relationship", variant: "destructive" });
    },
  });

  const updateActivityTypeStage = useMutation({
    mutationFn: async ({ id, processingTimeDays }: { id: number; processingTimeDays: number }) => {
      return await apiRequest('PATCH', `/api/activity-type-stages/${id}`, { processingTimeDays });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/activity-type-stages'] });
      toast({ title: "Processing time updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update processing time", variant: "destructive" });
    },
  });

  const deleteActivityTypeStage = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/activity-type-stages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/activity-type-stages'] });
      toast({ title: "Stage relationship removed successfully" });
    },
    onError: () => {
      toast({ title: "Failed to remove stage relationship", variant: "destructive" });
    },
  });

  const createActivityType = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      return await apiRequest('POST', '/api/activity-types', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/activity-types'] });
      setAddDialogOpen(false);
      setNewActivityTypeName("");
      setNewActivityTypeColor("#3B82F6");
      toast({ title: "Activity type created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create activity type", variant: "destructive" });
    },
  });

  const getActivityTypeStages = (activityTypeId: number) => {
    return activityTypeStages.filter((ats) => ats.activityTypeId === activityTypeId);
  };

  const isStageAssigned = (activityTypeId: number, stageId: number) => {
    return activityTypeStages.some((ats) => 
      ats.activityTypeId === activityTypeId && ats.stageId === stageId
    );
  };

  const getStageRelationship = (activityTypeId: number, stageId: number) => {
    return activityTypeStages.find((ats) => 
      ats.activityTypeId === activityTypeId && ats.stageId === stageId
    );
  };

  const handleStageToggle = (activityTypeId: number, stageId: number, checked: boolean) => {
    if (checked) {
      createActivityTypeStage.mutate({
        activityTypeId,
        stageId,
        processingTimeDays: 0
      });
    } else {
      const relationship = getStageRelationship(activityTypeId, stageId);
      if (relationship) {
        deleteActivityTypeStage.mutate(relationship.id);
      }
    }
  };

  const handleProcessingTimeChange = (relationshipId: number, processingTimeDays: number) => {
    setLocalProcessingTimes(prev => ({
      ...prev,
      [relationshipId]: processingTimeDays
    }));
  };

  const handleProcessingTimeBlur = (relationshipId: number) => {
    const localValue = localProcessingTimes[relationshipId];
    if (localValue !== undefined) {
      updateActivityTypeStage.mutate({ 
        id: relationshipId, 
        processingTimeDays: localValue 
      });
      // Clear the local state after successful update
      setLocalProcessingTimes(prev => {
        const newState = { ...prev };
        delete newState[relationshipId];
        return newState;
      });
    }
  };

  const getProcessingTimeValue = (relationship: ActivityTypeStage) => {
    return localProcessingTimes[relationship.id] ?? relationship.processingTimeDays;
  };

  if (loadingActivityTypes || loadingStages || loadingActivityTypeStages) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Activity Type Management</h1>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Activity Type
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Activity Type</DialogTitle>
              <DialogDescription>
                Create a new activity type with a name and color.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="activity-name">Name</Label>
                <Input
                  id="activity-name"
                  value={newActivityTypeName}
                  onChange={(e) => setNewActivityTypeName(e.target.value)}
                  placeholder="Enter activity type name"
                />
              </div>
              <div>
                <Label htmlFor="activity-color">Color</Label>
                <Input
                  id="activity-color"
                  type="color"
                  value={newActivityTypeColor}
                  onChange={(e) => setNewActivityTypeColor(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createActivityType.mutate({ name: newActivityTypeName, color: newActivityTypeColor })}
                disabled={!newActivityTypeName.trim() || createActivityType.isPending}
              >
                {createActivityType.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Types List */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Types</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activityTypes.map((activityType) => (
              <div
                key={activityType.id}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedActivityType === activityType.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedActivityType(activityType.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Badge 
                      className="text-xs"
                      style={{ backgroundColor: activityType.color, color: 'white' }}
                    >
                      {activityType.name}
                    </Badge>
                    <span className="text-sm text-gray-600">
                      {getActivityTypeStages(activityType.id).length} stages
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Stage Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedActivityType 
                ? `Configure Stages for ${activityTypes.find((at) => at.id === selectedActivityType)?.name}`
                : 'Select an Activity Type'
              }
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedActivityType ? (
              <div className="space-y-4">
                {stages.map((stage) => {
                  const isAssigned = isStageAssigned(selectedActivityType, stage.id);
                  const relationship = getStageRelationship(selectedActivityType, stage.id);
                  
                  return (
                    <div key={stage.id} className="flex items-center space-x-4 p-3 border rounded-lg">
                      <Checkbox
                        checked={isAssigned}
                        onCheckedChange={(checked) => 
                          handleStageToggle(selectedActivityType, stage.id, checked as boolean)
                        }
                      />
                      
                      <div className="flex-1">
                        <Label className="font-medium">{stage.name}</Label>
                      </div>
                      
                      {isAssigned && relationship && (
                        <div className="flex items-center space-x-2">
                          <Label className="text-sm text-gray-600">Processing time (days):</Label>
                          <Input
                            type="number"
                            min="0"
                            className="w-20"
                            value={getProcessingTimeValue(relationship)}
                            onChange={(e) => 
                              handleProcessingTimeChange(relationship.id, parseInt(e.target.value) || 0)
                            }
                            onBlur={() => handleProcessingTimeBlur(relationship.id)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                Select an activity type to configure its stages and lead times
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      {selectedActivityType && (
        <Card>
          <CardHeader>
            <CardTitle>Stage Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getActivityTypeStages(selectedActivityType).map((ats) => {
                const stage = stages.find((s) => s.id === ats.stageId);
                return stage ? (
                  <div key={ats.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{stage.name}</span>
                      <Badge variant="secondary">{ats.processingTimeDays} days</Badge>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}