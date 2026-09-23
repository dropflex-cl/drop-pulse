import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Ellipsis,
  Eye,
  GripVertical,
  Image,
  Inbox,
  Link,
  LoaderCircle,
  Lock,
  Megaphone,
  MessageSquare,
  Minus,
  Package,
  Pause,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Tag,
  TrendingUp,
  TriangleAlert,
  Truck,
  Undo2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type IconName =
  | "sparkle" | "eye" | "check" | "x" | "loader" | "check-circle" | "alert"
  | "chevron-right" | "chevron-left" | "plus" | "inbox" | "box" | "megaphone"
  | "chat" | "lock" | "image" | "tag" | "text" | "store" | "send" | "arrow-up"
  | "arrow-down" | "pause" | "power" | "more" | "undo" | "edit" | "search"
  | "clock" | "minus" | "truck" | "trend" | "grip" | "star" | "settings" | "shield"
  | "upload" | "link" | "refresh";

// Significados fijos (design-system/README.md → Iconografía): destello = IA, ojo = en revisión,
// check = aprobado, triángulo = error, reloj = detenido, candado = bloqueada.
const ICONS: Record<IconName, LucideIcon> = {
  sparkle: Sparkles,
  eye: Eye,
  check: Check,
  x: X,
  loader: LoaderCircle,
  "check-circle": CircleCheck,
  alert: TriangleAlert,
  "chevron-right": ChevronRight,
  "chevron-left": ChevronLeft,
  plus: Plus,
  inbox: Inbox,
  box: Package,
  megaphone: Megaphone,
  chat: MessageSquare,
  lock: Lock,
  image: Image,
  tag: Tag,
  text: AlignLeft,
  store: Store,
  send: SendHorizontal,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  pause: Pause,
  power: Power,
  more: Ellipsis,
  undo: Undo2,
  edit: Pencil,
  search: Search,
  clock: Clock,
  minus: Minus,
  truck: Truck,
  trend: TrendingUp,
  grip: GripVertical,
  star: Star,
  settings: Settings,
  shield: ShieldCheck,
  upload: Upload,
  link: Link,
  refresh: RefreshCw,
};

export interface IconProps {
  name: IconName;
  /** 16px en chips y filas; 20px por defecto. */
  size?: "sm";
  /** Nombre accesible cuando el ícono va solo y significa algo. Sin él, queda oculto a lectores. */
  label?: string;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size, label, strokeWidth = 1.75, className }: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      className={cn("block shrink-0", size === "sm" ? "size-4" : "size-5", className)}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth={false}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable={false}
    />
  );
}
