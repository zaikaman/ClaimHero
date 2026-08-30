import * as React from "react";
import { cn } from "../../lib/utils";

type ImageLoadingStatus = "idle" | "loading" | "loaded" | "error";

interface AvatarContextValue {
  status: ImageLoadingStatus;
  setStatus: (status: ImageLoadingStatus) => void;
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "default" | "sm" | "lg";
}

function Avatar({ className, size = "default", children, ...props }: AvatarProps) {
  const [status, setStatus] = React.useState<ImageLoadingStatus>("idle");
  const value = React.useMemo(() => ({ status, setStatus }), [status]);

  const sizeStyles = {
    default: "size-8 text-xs",
    sm: "size-6 text-[10px]",
    lg: "size-10 text-sm",
  };

  return (
    <AvatarContext.Provider value={value}>
      <div
        data-slot="avatar"
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/60 font-medium select-none",
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children}
      </div>
    </AvatarContext.Provider>
  );
}

interface AvatarImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  onLoadingStatusChange?: (status: ImageLoadingStatus) => void;
}

function AvatarImage({
  className,
  src,
  alt = "User avatar",
  onLoadingStatusChange,
  ...props
}: AvatarImageProps) {
  const context = React.useContext(AvatarContext);
  const [status, setStatus] = React.useState<ImageLoadingStatus>(() =>
    src ? "loading" : "idle"
  );

  const setContextStatusRef = React.useRef(context?.setStatus);
  setContextStatusRef.current = context?.setStatus;

  const onStatusChangeRef = React.useRef(onLoadingStatusChange);
  onStatusChangeRef.current = onLoadingStatusChange;

  React.useEffect(() => {
    if (!src) {
      setStatus("error");
      setContextStatusRef.current?.("error");
      onStatusChangeRef.current?.("error");
      return;
    }

    let isMounted = true;
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    image.src = src;

    image.onload = () => {
      if (isMounted) {
        setStatus("loaded");
        setContextStatusRef.current?.("loaded");
        onStatusChangeRef.current?.("loaded");
      }
    };

    image.onerror = () => {
      if (isMounted) {
        setStatus("error");
        setContextStatusRef.current?.("error");
        onStatusChangeRef.current?.("error");
      }
    };

    return () => {
      isMounted = false;
    };
  }, [src]);

  if (status !== "loaded" || !src) return null;

  return (
    <img
      src={src}
      alt={alt}
      data-slot="avatar-image"
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      className={cn("absolute inset-0 size-full object-cover rounded-md", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  const context = React.useContext(AvatarContext);

  if (context && context.status === "loaded") {
    return null;
  }

  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center text-muted-foreground font-semibold uppercase",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { Avatar, AvatarFallback, AvatarImage };
