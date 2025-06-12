import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, Palette } from "lucide-react";
import { type Stage, type InsertStage } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const stageSchema = z.object({
  name: z.string().min(1, "Stage name is required"),
  order: z.number().min(1, "Order must be at least 1"),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Please enter a valid hex color"),
  proceedWithTestQty: z.number().optional().nullable(),
  releaseRemainingAtStageId: z.number().optional().nullable(),
});

type StageFormData = z.infer<typeof stageSchema>;

const predefinedColors = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#8B5CF6", // violet
  "#F59E0B", // amber
  "#EF4444", // red
  "#06B6D4", // cyan
  "#84CC16", // lime
  "#F97316", // orange
  "#EC4899", // pink
  "#6366F1", // indigo
];

export default function StageManagement() {
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stages = [] } = useQuery<Stage[]>({
    queryKey: ["/api/stages"],
  });

  const addStageForm = useForm<StageFormData>({
    resolver: zodResolver(stageSchema),
    defaultValues: {
      name: "",
      order: stages.length + 1,
      color: predefinedColors[stages.length % predefinedColors.length],
    },
  });

  const editStageForm = useForm<StageFormData>({
    resolver: zodResolver(stageSchema),
    defaultValues: {
      name: "",
      order: 1,
      color: "#3B82F6",
    },
  });

  const createStageMutation = useMutation({
    mutationFn: async (data: InsertStage) => {
      const response = await apiRequest("POST", "/api/stages", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stages"] });
      setIsAddDialogOpen(false);
      addStageForm.reset();
      toast({
        title: "Success",
        description: "Stage created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create stage",
        variant: "destructive",
      });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertStage> }) => {
      const response = await apiRequest("PUT", `/api/stages/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stages"] });
      setIsEditDialogOpen(false);
      setEditingStage(null);
      editStageForm.reset();
      toast({
        title: "Success",
        description: "Stage updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update stage",
        variant: "destructive",
      });
    },
  });

  const deleteStageMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/stages/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stages"] });
      toast({
        title: "Success",
        description: "Stage deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete stage",
        variant: "destructive",
      });
    },
  });

  const handleAddStage = (data: StageFormData) => {
    createStageMutation.mutate(data);
  };

  const handleEditStage = (data: StageFormData) => {
    if (editingStage) {
      updateStageMutation.mutate({
        id: editingStage.id,
        data,
      });
    }
  };

  const openEditDialog = (stage: Stage) => {
    setEditingStage(stage);
    editStageForm.reset({
      name: stage.name,
      order: stage.order,
      color: stage.color,
      proceedWithTestQty: stage.proceedWithTestQty || undefined,
      releaseRemainingAtStageId: stage.releaseRemainingAtStageId || undefined,
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteStage = (id: number) => {
    deleteStageMutation.mutate(id);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Stage Management</h1>
          <p className="text-gray-600 mt-2">
            Manage workflow stages, their order, and visual appearance
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Stage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Stage</DialogTitle>
            </DialogHeader>
            <form onSubmit={addStageForm.handleSubmit(handleAddStage)} className="space-y-4">
              <div>
                <Label htmlFor="add-name">Stage Name</Label>
                <Input
                  id="add-name"
                  {...addStageForm.register("name")}
                  placeholder="e.g., Initial Machining"
                />
                {addStageForm.formState.errors.name && (
                  <p className="text-sm text-red-500 mt-1">
                    {addStageForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="add-order">Order</Label>
                <Input
                  id="add-order"
                  type="number"
                  min="1"
                  {...addStageForm.register("order", { valueAsNumber: true })}
                />
                {addStageForm.formState.errors.order && (
                  <p className="text-sm text-red-500 mt-1">
                    {addStageForm.formState.errors.order.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="add-color">Color</Label>
                <div className="flex items-center space-x-3 mt-2">
                  <Input
                    id="add-color"
                    type="color"
                    className="w-16 h-10 border rounded cursor-pointer"
                    {...addStageForm.register("color")}
                  />
                  <div className="flex flex-wrap gap-2">
                    {predefinedColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="w-8 h-8 rounded border-2 border-gray-300 hover:border-gray-500"
                        style={{ backgroundColor: color }}
                        onClick={() => addStageForm.setValue("color", color)}
                      />
                    ))}
                  </div>
                </div>
                {addStageForm.formState.errors.color && (
                  <p className="text-sm text-red-500 mt-1">
                    {addStageForm.formState.errors.color.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="add-proceed-qty">Proceed With Test Qty (Optional)</Label>
                <Input
                  id="add-proceed-qty"
                  type="number"
                  min="0"
                  placeholder="Enter quantity to proceed with testing"
                  {...addStageForm.register("proceedWithTestQty", { 
                    valueAsNumber: true,
                    setValueAs: (value) => value === "" ? null : Number(value)
                  })}
                />
                {addStageForm.formState.errors.proceedWithTestQty && (
                  <p className="text-sm text-red-500 mt-1">
                    {addStageForm.formState.errors.proceedWithTestQty.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="add-release-stage">Release Remaining At Stage (Optional)</Label>
                <Select
                  onValueChange={(value) => 
                    addStageForm.setValue("releaseRemainingAtStageId", value === "none" ? null : Number(value))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a later stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {stages
                      .sort((a, b) => a.order - b.order)
                      .map((stage) => (
                        <SelectItem key={stage.id} value={stage.id.toString()}>
                          {stage.name} (Order: {stage.order})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {addStageForm.formState.errors.releaseRemainingAtStageId && (
                  <p className="text-sm text-red-500 mt-1">
                    {addStageForm.formState.errors.releaseRemainingAtStageId.message}
                  </p>
                )}
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createStageMutation.isPending}
                >
                  {createStageMutation.isPending ? "Creating..." : "Create Stage"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stages
              .sort((a, b) => a.order - b.order)
              .map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-8 h-6 rounded-sm flex items-center justify-center text-white text-sm font-semibold"
                        style={{ backgroundColor: stage.color }}
                      >
                        {stage.order}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{stage.name}</h3>
                        <p className="text-sm text-gray-500">Order: {stage.order}</p>
                        {stage.proceedWithTestQty && (
                          <p className="text-sm text-blue-600">Proceed With Test Qty: {stage.proceedWithTestQty}</p>
                        )}
                        {stage.releaseRemainingAtStageId && (
                          <p className="text-sm text-green-600">
                            Release Remaining At: {stages.find(s => s.id === stage.releaseRemainingAtStageId)?.name || 'Unknown'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(stage)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Stage</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{stage.name}"? This action cannot be undone and will affect all related scheduling data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteStage(stage.id)}
                            className="bg-red-500 hover:bg-red-600"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit Stage Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Stage</DialogTitle>
          </DialogHeader>
          <form onSubmit={editStageForm.handleSubmit(handleEditStage)} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Stage Name</Label>
              <Input
                id="edit-name"
                {...editStageForm.register("name")}
                placeholder="e.g., Initial Machining"
              />
              {editStageForm.formState.errors.name && (
                <p className="text-sm text-red-500 mt-1">
                  {editStageForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-order">Order</Label>
              <Input
                id="edit-order"
                type="number"
                min="1"
                {...editStageForm.register("order", { valueAsNumber: true })}
              />
              {editStageForm.formState.errors.order && (
                <p className="text-sm text-red-500 mt-1">
                  {editStageForm.formState.errors.order.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-color">Color</Label>
              <div className="flex items-center space-x-3 mt-2">
                <Input
                  id="edit-color"
                  type="color"
                  className="w-16 h-10 border rounded cursor-pointer"
                  {...editStageForm.register("color")}
                />
                <div className="flex flex-wrap gap-2">
                  {predefinedColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="w-8 h-8 rounded border-2 border-gray-300 hover:border-gray-500"
                      style={{ backgroundColor: color }}
                      onClick={() => editStageForm.setValue("color", color)}
                    />
                  ))}
                </div>
              </div>
              {editStageForm.formState.errors.color && (
                <p className="text-sm text-red-500 mt-1">
                  {editStageForm.formState.errors.color.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-proceed-qty">Proceed With Test Qty (Optional)</Label>
              <Input
                id="edit-proceed-qty"
                type="number"
                min="0"
                placeholder="Enter quantity to proceed with testing"
                {...editStageForm.register("proceedWithTestQty", { 
                  valueAsNumber: true,
                  setValueAs: (value) => value === "" ? null : Number(value)
                })}
              />
              {editStageForm.formState.errors.proceedWithTestQty && (
                <p className="text-sm text-red-500 mt-1">
                  {editStageForm.formState.errors.proceedWithTestQty.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-release-stage">Release Remaining At Stage (Optional)</Label>
              <Select
                value={editStageForm.watch("releaseRemainingAtStageId")?.toString() || "none"}
                onValueChange={(value) => 
                  editStageForm.setValue("releaseRemainingAtStageId", value === "none" ? null : Number(value))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a later stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {stages
                    .filter((stage) => editingStage ? stage.id !== editingStage.id : true)
                    .sort((a, b) => a.order - b.order)
                    .map((stage) => (
                      <SelectItem key={stage.id} value={stage.id.toString()}>
                        {stage.name} (Order: {stage.order})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {editStageForm.formState.errors.releaseRemainingAtStageId && (
                <p className="text-sm text-red-500 mt-1">
                  {editStageForm.formState.errors.releaseRemainingAtStageId.message}
                </p>
              )}
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateStageMutation.isPending}
              >
                {updateStageMutation.isPending ? "Updating..." : "Update Stage"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}