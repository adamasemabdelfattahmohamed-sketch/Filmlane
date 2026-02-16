import React, { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/utils/cn";

interface BackgroundRippleEffectProps {
  rows?: number;
  cols?: number;
  cellSize?: number;
  className?: string;
}

export function BackgroundRippleEffect({
  rows = 8,
  cols = 27,
  cellSize = 56,
  className,
}: BackgroundRippleEffectProps) {
  const [clickedCell, setClickedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <DivGrid
        rows={rows}
        cols={cols}
        cellSize={cellSize}
        borderColor="rgba(255, 255, 255, 0.05)"
        fillColor="rgba(255, 255, 255, 0)"
        clickedCell={clickedCell}
        onCellClick={(row, col) => setClickedCell({ row, col })}
        interactive={false}
      />
    </div>
  );
}

interface DivGridProps {
  rows: number;
  cols: number;
  cellSize: number;
  borderColor: string;
  fillColor: string;
  clickedCell: { row: number; col: number } | null;
  onCellClick?: (row: number, col: number) => void;
  interactive?: boolean;
  className?: string;
}

function DivGrid({
  rows,
  cols,
  cellSize,
  borderColor,
  fillColor,
  clickedCell,
  onCellClick,
  interactive = false,
  className,
}: DivGridProps) {
  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
    gap: 0,
  };

  return (
    <div
      className={cn(
        "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        className
      )}
      style={gridStyle}
    >
      {Array.from({ length: rows * cols }).map((_, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const isClicked =
          clickedCell && clickedCell.row === row && clickedCell.col === col;

        return (
          <motion.div
            key={index}
            className="relative"
            style={{
              width: cellSize,
              height: cellSize,
              border: `0.5px solid ${borderColor}`,
              backgroundColor: fillColor,
            }}
            initial={{ opacity: 0.4 }}
            whileHover={
              interactive ? { backgroundColor: "rgba(59, 130, 246, 0.1)" } : {}
            }
            onClick={() => interactive && onCellClick?.(row, col)}
            animate={
              isClicked
                ? {
                    opacity: [0.4, 0.8, 0.4],
                  }
                : { opacity: 0.4 }
            }
            transition={
              isClicked
                ? {
                    duration: 0.2,
                    ease: "easeOut",
                  }
                : {}
            }
          />
        );
      })}
    </div>
  );
}
