import React, { useEffect, useMemo, useRef } from "react";
import { useMutation } from "convex/react";
import usePresence from "@convex-dev/presence/react";
import { api } from "../../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import type {
  ClaimAccessRole,
  StudioPresenceActivity,
  StudioPresenceData,
  StudioPresenceEntry,
} from "../../types";

export const PRESENCE_COLORS = ["#00e5ff", "#10b981", "#f59e0b", "#a78bfa", "#f43f5e", "#38bdf8"];

export function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

export function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function parsePresenceData(entry: StudioPresenceEntry): StudioPresenceData | null {
  const raw = entry.data as Partial<StudioPresenceData> | undefined;
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.displayName !== "string" || !raw.displayName) return null;
  if (raw.role !== "owner" && raw.role !== "editor" && raw.role !== "viewer") return null;
  const activity: StudioPresenceActivity =
    raw.activity === "editing" ||
    raw.activity === "synthesizing" ||
    raw.activity === "reviewing" ||
    raw.activity === "viewing" ||
    raw.activity === "idle"
      ? raw.activity
      : "viewing";
  return {
    displayName: raw.displayName,
    initials: typeof raw.initials === "string" && raw.initials ? raw.initials : initialsForName(raw.displayName),
    role: raw.role,
    tier: typeof raw.tier === "string" ? raw.tier : "",
    activity,
    section: typeof raw.section === "string" ? raw.section : undefined,
    color: typeof raw.color === "string" && raw.color ? raw.color : colorForUserId(entry.userId),
  };
}

export function activityLabel(activity: StudioPresenceActivity): string {
  switch (activity) {
    case "editing":
      return "editing";
    case "synthesizing":
      return "synthesizing";
    case "reviewing":
      return "reviewing";
    case "idle":
      return "idle";
    default:
      return "viewing";
  }
}

interface FacePileProps {
  entries: Array<{ userId: string; data: StudioPresenceData | null; isSelf: boolean; image?: string }>;
  max?: number;
}

export const CollaboratorFacePile: React.FC<FacePileProps> = ({ entries, max = 5 }) => {
  const visible = entries.slice(0, max);
  const overflow = entries.length - visible.length;
  return (
    <TooltipProvider>
      <div className="flex items-center">
        <div className="flex -space-x-1.5">
          {visible.map((entry) => (
            <Tooltip key={entry.userId}>
              <TooltipTrigger asChild>
                <span>
                  <Avatar
                    size="sm"
                    className="ring-2 ring-card cursor-default"
                    style={entry.data ? { borderColor: entry.data.color } : undefined}
                  >
                    {entry.image && <AvatarImage src={entry.image} alt={entry.data?.displayName || "Teammate"} />}
                    <AvatarFallback
                      className="text-[10px] font-bold"
                      style={
                        entry.data
                          ? { backgroundColor: `${entry.data.color}1f`, color: entry.data.color }
                          : undefined
                      }
                    >
                      {entry.data?.initials || "?"}
                    </AvatarFallback>
                  </Avatar>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    {entry.data?.displayName || "Teammate"}
                    {entry.isSelf ? " (you)" : ""}
                  </div>
                  {entry.data && (
                    <div className="text-muted-foreground capitalize">
                      {entry.data.role} • {activityLabel(entry.data.activity)}
                      {entry.data.section ? ` • ${entry.data.section}` : ""}
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
          {overflow > 0 && (
            <Avatar size="sm" className="ring-2 ring-card bg-muted">
              <AvatarFallback className="text-[10px] font-mono">+{overflow}</AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

interface StudioPresenceBridgeProps {
  claimId: string;
  userId: string;
  displayName: string;
  role: ClaimAccessRole;
  tier: string;
  activity: StudioPresenceActivity;
  section?: string;
  avatarMap?: Record<string, string>;
  onOthersChange?: (others: Array<{ userId: string; data: StudioPresenceData }>) => void;
}

export const StudioPresenceBridge: React.FC<StudioPresenceBridgeProps> = ({
  claimId,
  userId,
  displayName,
  role,
  tier,
  activity,
  section,
  avatarMap,
  onOthersChange,
}) => {
  const roomId = `appeal:${claimId}`;
  const presenceState = usePresence(api.presence, roomId, userId) as
    | StudioPresenceEntry[]
    | undefined;
  const updateState = useMutation(api.presence.updateState);

  const payloadRef = useRef<StudioPresenceData | null>(null);
  const onOthersChangeRef = useRef(onOthersChange);
  onOthersChangeRef.current = onOthersChange;

  const payload: StudioPresenceData = useMemo(
    () => ({
      displayName: displayName.slice(0, 64) || "Advocate",
      initials: initialsForName(displayName).slice(0, 4),
      role,
      tier: tier.slice(0, 64),
      activity,
      section: section?.slice(0, 64),
      color: colorForUserId(userId),
    }),
    [displayName, role, tier, activity, section, userId]
  );

  useEffect(() => {
    payloadRef.current = payload;
    const timer = setTimeout(() => {
      updateState({ roomId, data: payload }).catch(() => {
        // Presence is best-effort; heartbeat keeps the roster alive.
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [payload, roomId, updateState]);

  const entries = useMemo(() => {
    const list = presenceState || [];
    return list
      .filter((entry) => entry.online)
      .map((entry) => ({
        userId: entry.userId,
        data: entry.userId === userId ? payload : parsePresenceData(entry),
        isSelf: entry.userId === userId,
        image: avatarMap?.[entry.userId],
      }))
      .sort((a, b) => Number(b.isSelf) - Number(a.isSelf));
  }, [presenceState, payload, userId, avatarMap]);

  const others = useMemo(
    () =>
      entries
        .filter((entry) => !entry.isSelf && entry.data)
        .map((entry) => ({ userId: entry.userId, data: entry.data as StudioPresenceData })),
    [entries]
  );

  useEffect(() => {
    onOthersChangeRef.current?.(others);
  }, [others]);

  const activeOthers = others.filter(
    (entry) => entry.data.activity === "editing" || entry.data.activity === "synthesizing"
  );

  // Only teammates are shown; your own presence is implied.
  const peerEntries = entries.filter((entry) => !entry.isSelf);

  if (peerEntries.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <CollaboratorFacePile entries={peerEntries} />
      <div className="hidden md:flex flex-col leading-tight min-w-0">
        <span className="text-[11px] text-foreground font-medium truncate">
          {others.length === 1
            ? `${others[0].data.displayName} is ${activityLabel(others[0].data.activity)}`
            : others.length > 1
              ? `${others.length} teammates online`
              : `${peerEntries.length} ${peerEntries.length === 1 ? "teammate" : "teammates"} online`}
        </span>
        {activeOthers.length > 0 && (
          <span className="text-[10px] font-mono text-amber-400 truncate">
            {activeOthers.map((entry) => entry.data.displayName).join(", ")}{" "}
            {activeOthers.length === 1 ? "is" : "are"} editing — coordinate before saving
          </span>
        )}
      </div>
      {activeOthers.length > 0 && (
        <Badge variant="warning" className="text-[9px] font-mono px-1.5 py-0 h-5 shrink-0">
          Live edit
        </Badge>
      )}
    </div>
  );
};

export function PresenceStatusDot({ online }: { online: boolean }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 rounded-full shrink-0",
        online ? "bg-emerald-400" : "bg-muted-foreground/40"
      )}
    />
  );
}
