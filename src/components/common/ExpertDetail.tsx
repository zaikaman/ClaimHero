import React from "react";
import { useDetailMode } from "../../hooks/useDetailMode";
import { cn } from "../../lib/utils";

/** Render children only in Detailed (expert) mode. */
export const ExpertOnly: React.FC<{
  children: React.ReactNode;
  className?: string;
  as?: "span" | "div";
}> = ({ children, className, as: Component = "span" }) => {
  const { isDetailed } = useDetailMode();
  if (!isDetailed) return null;
  return <Component className={className}>{children}</Component>;
};

/** Render children only in Simple (everyday) mode. */
export const SimpleOnly: React.FC<{
  children: React.ReactNode;
  className?: string;
  as?: "span" | "div";
}> = ({ children, className, as: Component = "span" }) => {
  const { isSimple } = useDetailMode();
  if (!isSimple) return null;
  return <Component className={className}>{children}</Component>;
};

interface PlainLabelProps {
  /** Everyday text shown by default */
  simple: React.ReactNode;
  /** Expert text shown when Details is on. Falls back to simple. */
  detailed?: React.ReactNode;
  className?: string;
  as?: "span" | "div";
}

/** One label with two readings. No layout shift — same element, swapped copy. */
export const PlainLabel: React.FC<PlainLabelProps> = ({
  simple,
  detailed,
  className,
  as: Component = "span",
}) => {
  const { isDetailed } = useDetailMode();
  return <Component className={cn(className)}>{isDetailed ? (detailed ?? simple) : simple}</Component>;
};
