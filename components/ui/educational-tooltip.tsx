"use client";
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface EducationalTooltipProps {
  content: string;
  children?: React.ReactNode;
}

export function EducationalTooltip({ content, children }: EducationalTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children || <Info className="h-4 w-4 text-muted-foreground cursor-help" />}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}