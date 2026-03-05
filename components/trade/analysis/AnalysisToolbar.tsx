"use client";
import { Button } from '@/components/ui/button';
import { MousePointer2, Minus, Crosshair, TrendingUp, MoveRight, RotateCcw, Trash2, Square, Type } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAnalysisStore, ToolType } from '@/stores/trading/analysis.store';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AnalysisToolbarProps {
  symbol: string;
}

export function AnalysisToolbar({ symbol }: AnalysisToolbarProps) {
  const { activeTool, setActiveTool } = useAnalysisStore();

  const tools = [
    { id: 'cursor', icon: MousePointer2, label: 'Cursor' },
    { id: 'crosshair', icon: Crosshair, label: 'Crosshair' },
    { id: 'trendline', icon: TrendingUp, label: 'Trendline' },
    { id: 'ray', icon: MoveRight, label: 'Ray' },
    { id: 'horizontal-line', icon: Minus, label: 'Horiz. Line' },
    { id: 'rectangle', icon: Square, label: 'Rectangle' },
    { id: 'text', icon: Type, label: 'Text Note' },
  ];

  return (
    <div className="w-12 border-r h-full flex flex-col items-center py-4 bg-muted/10 gap-2 z-30 bg-card">
      <ToggleGroup
        type="single"
        value={activeTool}
        onValueChange={(val) => val && setActiveTool(val as ToolType)}
        className="flex flex-col gap-2"
      >
        <TooltipProvider delayDuration={0}>
          {tools.map(t => (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={t.id}
                  aria-label={t.label}
                  className="h-9 w-9 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-colors hover:bg-muted"
                >
                  <t.icon className="h-5 w-5" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{t.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </ToggleGroup>

      <div className="h-px w-8 bg-border my-2" />

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <IconAction
          icon={RotateCcw}
          label="Undo (Ctrl+Z)"
          onClick={() => useAnalysisStore.getState().undoDrawing(symbol)}
        />
        <IconAction
          icon={Trash2}
          label="Delete Selected (Del)"
          onClick={() => {
            const state = useAnalysisStore.getState();
            if (state.selectedDrawingId) {
              state.deleteDrawing(symbol, state.selectedDrawingId);
            }
          }}
          disabled={!useAnalysisStore.getState().selectedDrawingId}
        />
      </div>
    </div>
  );
}

// Helper

function IconAction({ icon: Icon, label, onClick, disabled }: any) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
            onClick={onClick}
            disabled={disabled}
          >
            <Icon className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right"><p>{label}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
