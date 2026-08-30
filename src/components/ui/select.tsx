import * as React from "react";
import { CaretDown } from "@phosphor-icons/react";
import { cn } from "../../lib/utils";

export interface SelectProps extends React.ComponentProps<"select"> {
  wrapperClassName?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, children, ...props }, ref) => {
    return (
      <div className={cn("relative inline-flex items-center group", wrapperClassName)}>
        <select
          ref={ref}
          className={cn(
            "h-8 w-full appearance-none rounded-md border border-white/[0.10] bg-white/[0.03] pl-2.5 pr-7 py-1 text-xs text-foreground font-sans transition-all cursor-pointer outline-none hover:border-white/[0.22] hover:bg-white/[0.06] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 [&>option]:bg-zinc-950 [&>option]:text-foreground",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <CaretDown className="pointer-events-none absolute right-2 size-3 text-muted-foreground transition-colors group-hover:text-foreground shrink-0" />
      </div>
    );
  }
);

Select.displayName = "Select";

export { Select };
