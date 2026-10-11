import { type ReactNode } from "react";

interface CardGridProps {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}

export function CardGrid({ children, cols = 3, className }: CardGridProps) {
  const gridClasses = {
    2: "grid grid-cols-1 gap-4 sm:grid-cols-2",
    3: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={`${gridClasses[cols]} ${className ?? ""}`}>
      {children}
    </div>
  );
}
