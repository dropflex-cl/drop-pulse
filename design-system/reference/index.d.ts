import type * as React from 'react';

export type IconName = 'sparkle' | 'eye' | 'check' | 'x' | 'loader' | 'check-circle' | 'alert' | 'chevron-right' | 'chevron-left' | 'plus' | 'inbox' | 'box' | 'megaphone' | 'chat' | 'lock' | 'image' | 'tag' | 'text' | 'store' | 'send' | 'arrow-up' | 'arrow-down' | 'pause' | 'power' | 'more' | 'undo' | 'edit' | 'search' | 'clock' | 'minus' | 'truck' | 'trend' | 'grip' | 'star' | 'settings' | 'shield' | 'upload' | 'link';
export interface IconProps { name: IconName; size?: 'sm'; label?: string; strokeWidth?: number; className?: string }
export declare function Icon(props: IconProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName; iconEnd?: IconName; loading?: boolean; block?: boolean;
  /** Atajo de teclado visible (escritorio): 'A', 'D', 'E'. */
  kbd?: string;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface IconButtonProps { icon: IconName; label: string; variant?: 'primary'; onClick?: () => void; className?: string }
export declare function IconButton(props: IconButtonProps): React.ReactElement;

export type ContentStatus = 'generado' | 'revision' | 'aprobado' | 'rechazado' | 'publicando' | 'publicado' | 'error';
export interface StatusBadgeProps { status: ContentStatus; size?: 'sm'; label?: string }
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;

export type MeterStage = 'done' | 'current' | 'review' | 'stuck' | 'error' | 'locked' | 'optional';
export interface StageMeterProps { stages: MeterStage[] }
export declare function StageMeter(props: StageMeterProps): React.ReactElement;

export interface ProductRowProps { name: string; image?: string; imageIndex?: number; stages?: MeterStage[]; reason?: string; tone?: 'warning' | 'danger' | 'success' | 'primary' | 'muted'; end?: React.ReactNode; onClick?: () => void }
export declare function ProductRow(props: ProductRowProps): React.ReactElement;

export interface AttentionItemProps { kind?: 'review' | 'error' | 'ads' | 'ads-up' | 'stuck'; title: string; product?: string; detail?: string; actions?: React.ReactNode }
export declare function AttentionItem(props: AttentionItemProps): React.ReactElement;

export interface Stage { title: string; state: 'done' | 'current' | 'review' | 'available' | 'locked' | 'error'; desc?: string; optional?: boolean; end?: React.ReactNode }
export interface StageListProps { stages: Stage[]; label?: string }
export declare function StageList(props: StageListProps): React.ReactElement;

export interface ReviewCardProps { section?: string; required?: boolean; angle?: 'primary' | 'secondary' | 'none'; note?: string; limit?: number; count?: number; unit?: string; faq?: { q: string; a: string }; originalLabel?: string; discardHint?: string; missing?: string; edited?: boolean; rows?: number; field: string; original?: React.ReactNode; proposal?: React.ReactNode; proposalText?: string; index?: number; total?: number; state?: 'pending' | 'editing' | 'accepted' | 'discarded'; keys?: boolean; hideActions?: boolean }
export declare function ReviewCard(props: ReviewCardProps): React.ReactElement;

export interface ImageTileProps { src?: string; alt?: string; state?: 'idle' | 'selected' | 'discarded' | 'generating' | 'error'; order?: number; imageIndex?: number; shape?: number }
export declare function ImageTile(props: ImageTileProps): React.ReactElement;

export interface SegmentedOption { value: string; label?: string; count?: number }
export interface SegmentedControlProps { options: (SegmentedOption | string)[]; value: string; onChange?: (v: string) => void; label: string; block?: boolean }
export declare function SegmentedControl(props: SegmentedControlProps): React.ReactElement;

export interface FieldProps { label: string; value?: string; id?: string; prefix?: string; suffix?: string; hint?: string; error?: string; disabled?: boolean; ai?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'] }
export declare function Field(props: FieldProps): React.ReactElement;

export interface PricePart { label: string; value: number; color?: string }
export interface PriceBreakdownProps { price: number; parts: PricePart[]; note?: string }
export declare function PriceBreakdown(props: PriceBreakdownProps): React.ReactElement;

export interface OfferPreviewProps { title: string; price: number; compareAt?: number; image?: string; imageIndex?: number; store?: string; cta?: string }
export declare function OfferPreview(props: OfferPreviewProps): React.ReactElement;

export interface MetricProps { label: string; value: string; target?: string; trend?: 'good' | 'bad' | 'warn' }
export declare function Metric(props: MetricProps): React.ReactElement;

export type Verdict = 'subir' | 'seguir' | 'vigilar' | 'apagar' | 'aprendiendo';
export interface CampaignCardProps { name: string; verdict?: Verdict; reason: string; verdictTitle?: string; metrics?: MetricProps[]; nextBudget?: string; paused?: boolean; meta?: string; imageIndex?: number; actions?: React.ReactNode[] | null }
export declare function CampaignCard(props: CampaignCardProps): React.ReactElement;

export interface NavigationProps { variant?: 'bar' | 'rail'; active: 'hoy' | 'productos' | 'campanas'; badges?: Partial<Record<'hoy' | 'productos' | 'campanas', number>>; items?: { id: string; label: string; icon: IconName }[] }
export declare function Navigation(props: NavigationProps): React.ReactElement;

export interface TopBarProps { title: string; subtitle?: string; back?: string; actions?: React.ReactNode; large?: boolean }
export declare function TopBar(props: TopBarProps): React.ReactElement;

export interface ToastProps { message: string; action?: string }
export declare function Toast(props: ToastProps): React.ReactElement;

export interface AssistantMessage { from: 'user' | 'ai'; text: string | string[]; apply?: string }
export interface AssistantSheetProps { variant?: 'sheet' | 'panel'; context?: string; contextImage?: number; messages?: AssistantMessage[]; suggestions?: string[]; placeholder?: string; style?: React.CSSProperties }
export declare function AssistantSheet(props: AssistantSheetProps): React.ReactElement;

export interface OnboardingHeaderProps { step: number; total?: number; optionalSteps?: number[]; back?: string; skip?: string; stepLabel?: string; title?: string; desc?: string }
export declare function OnboardingHeader(props: OnboardingHeaderProps): React.ReactElement;

export type Provider = 'shopify' | 'meta';
export interface ProviderMarkProps { provider: Provider; size?: 'lg' }
/** Marca genérica. Reemplazar por el logo oficial del proveedor. */
export declare function ProviderMark(props: ProviderMarkProps): React.ReactElement;

export type ConnectionState = 'idle' | 'connecting' | 'importing' | 'connected' | 'action' | 'error' | 'later';
export interface ConnectionCardProps { provider: Provider; state?: ConnectionState; account?: string; detail?: string; progress?: number; facts?: [string, string][]; actions?: React.ReactNode }
export declare function ConnectionCard(props: ConnectionCardProps): React.ReactElement;

export interface Permission { kind: 'read' | 'write' | 'never'; text: string }
export interface PermissionListProps { title?: string; items: Permission[]; note?: string }
export declare function PermissionList(props: PermissionListProps): React.ReactElement;

export interface Option { value: string; title: string; meta?: string; tone?: 'warning' | 'danger'; disabled?: boolean; tag?: string }
export interface OptionListProps { label: string; hint?: string; name?: string; value?: string; options: Option[] }
export declare function OptionList(props: OptionListProps): React.ReactElement;

export interface PickRowProps { name: string; imageIndex?: number; meta?: string; issues?: string[]; score?: 'Alta' | 'Media' | 'Baja' | string; checked?: boolean }
export declare function PickRow(props: PickRowProps): React.ReactElement;

export interface GenerationItem { name: string; imageIndex?: number; status: 'generado' | 'publicando' | 'cola' | 'error' | 'aprobado'; detail?: string }
export interface GenerationProgressProps { items: GenerationItem[]; eta?: string; title?: string; compact?: boolean; action?: React.ReactNode }
export declare function GenerationProgress(props: GenerationProgressProps): React.ReactElement;

export interface SetupItem { title: string; desc?: string; done?: boolean; action?: string }
export interface SetupChecklistProps { title?: string; items: SetupItem[] }
export declare function SetupChecklist(props: SetupChecklistProps): React.ReactElement;

export interface ProductInfoInputProps { value?: string; found?: string[]; fromShopify?: boolean; saving?: boolean; saved?: string; rows?: number; label?: string; hint?: string; placeholder?: string; suggest?: string[]; focused?: boolean }
export declare function ProductInfoInput(props: ProductInfoInputProps): React.ReactElement;

export interface ReferenceImageProps { src?: string; alt?: string; source?: 'shopify' | 'upload' | 'url'; state?: 'ready' | 'excluded' | 'uploading' | 'error'; cover?: boolean; progress?: number; error?: string; name?: string; imageIndex?: number; shape?: number }
export declare function ReferenceImage(props: ReferenceImageProps): React.ReactElement;

export interface UploadItem { name: string; state: 'uploading' | 'done' | 'error'; progress?: number; detail?: string }
export interface ImageUploaderProps { pickLabel?: string; dragLabel?: string; formats?: string; mode?: 'file' | 'url'; state?: 'idle' | 'dragover' | 'error' | 'fetching'; items?: UploadItem[]; url?: string; urlError?: string; compact?: boolean; hideModes?: boolean }
export declare function ImageUploader(props: ImageUploaderProps): React.ReactElement;

export interface StarsProps { value: number; size?: 'lg' }
export declare function Stars(props: StarsProps): React.ReactElement;

export interface ReviewImporterProps { state?: 'idle' | 'fetching' | 'done' | 'error'; url?: string; error?: string; progress?: number; detail?: string; summary?: string; actions?: React.ReactNode; minStars?: '1' | '4' | '5'; photosOnly?: boolean; filters?: boolean; primary?: boolean; title?: string }
export declare function ReviewImporter(props: ReviewImporterProps): React.ReactElement;

export interface ReviewSummaryProps { average: number; total: number; distribution: [number, number, number, number, number] }
export declare function ReviewSummary(props: ReviewSummaryProps): React.ReactElement;

export interface ReviewItemProps { author: string; country?: string; date?: string; rating: number; variant?: string; text: string; photos?: number; imageIndex?: number; translated?: boolean; original?: string; lang?: string; flags?: string[]; state?: 'pending' | 'approved' | 'rejected' | 'published'; editing?: boolean; edited?: boolean; hideActions?: boolean }
export declare function ReviewItem(props: ReviewItemProps): React.ReactElement;

export interface ScoreBarProps { value: number; size?: 'lg'; hideBand?: boolean }
export declare function ScoreBar(props: ScoreBarProps): React.ReactElement;

export type AngleRole = 'principal' | 'secundario';
export interface RoleChipProps { role: AngleRole | 'sugerido'; short?: boolean }
export declare function RoleChip(props: RoleChipProps): React.ReactElement | null;

export interface AngleRisk { text: string; penalty?: number; fix?: string }
export interface ScoreFactor { label: string; value: number }
export interface AngleCardProps { rank: number; name: string; score: number; role?: AngleRole; suggestedRole?: AngleRole; fit?: string; risks?: AngleRisk[]; breakdown?: ScoreFactor[]; expanded?: boolean; hideActions?: boolean }
export declare function AngleCard(props: AngleCardProps): React.ReactElement;

export interface AngleSuggestionProps { principal: string; principalScore: number; secundario: string; secundarioScore: number; combo?: string; missing?: { text: string; action?: string }[]; changed?: boolean }
export declare function AngleSuggestion(props: AngleSuggestionProps): React.ReactElement;

export interface IcpSummaryProps { text: string; tags?: string[]; approved?: boolean; action?: string }
export declare function IcpSummary(props: IcpSummaryProps): React.ReactElement;

export interface AngleDevelopmentProps { role: AngleRole; angle: string; status?: 'generando' | 'revision' | 'aprobado'; hooks?: string[]; pickedHook?: number; aida?: { atencion: string; interes: string; deseo: string; accion: string }; objections?: { q: string; a: string }[]; offer?: string; hideActions?: boolean }
export declare function AngleDevelopment(props: AngleDevelopmentProps): React.ReactElement;

export type Structure = 'abo' | 'cbo';
export interface StructurePickerProps { value: Structure; label?: string }
export declare function StructurePicker(props: StructurePickerProps): React.ReactElement;

export interface PresetSelectProps { value: string; options: { value: string; label: string }[]; source?: string; modified?: number; label?: string }
export declare function PresetSelect(props: PresetSelectProps): React.ReactElement;

export interface ConfigSectionProps { index: number; title: string; summary?: string; open?: boolean; done?: boolean; edited?: boolean; error?: string; children?: React.ReactNode }
export declare function ConfigSection(props: ConfigSectionProps): React.ReactElement;

export interface ChipInputProps { label: string; values?: string[]; placeholder?: string; hint?: string; disabled?: boolean }
export declare function ChipInput(props: ChipInputProps): React.ReactElement;

export interface RulePart { value: string; select?: boolean; prefix?: string; suffix?: string }
export interface RuleRowProps { parts: (string | RulePart)[]; off?: boolean }
export declare function RuleRow(props: RuleRowProps): React.ReactElement;

export interface RuleGroupProps { kind: 'esperar' | 'pausar' | 'escalar'; desc?: string; level?: string; add?: boolean; children?: React.ReactNode }
export declare function RuleGroup(props: RuleGroupProps): React.ReactElement;

export interface CreativeSlotProps { name: string; type?: 'image' | 'video'; ratio?: string; duration?: string; state?: 'ready' | 'uploading' | 'processing' | 'error'; progress?: number; error?: string; adset?: string; detail?: string; imageIndex?: number }
export declare function CreativeSlot(props: CreativeSlotProps): React.ReactElement;

export interface TreeAd { name: string; type?: 'image' | 'video' }
export interface TreeAdset { name: string; audience?: string; budget?: string; ads?: TreeAd[] }
export interface CampaignTreeProps { name: string; structure: Structure; budget?: string; adsets: TreeAdset[]; note?: string }
export declare function CampaignTree(props: CampaignTreeProps): React.ReactElement;

export interface DecisionRowProps { decision: 'esperar' | 'mantener' | 'pausar' | 'pausado' | 'escalar'; label?: string; name: string; metrics?: string; reason?: string; rule?: string; progress?: number; actions?: React.ReactNode; imageIndex?: number }
export declare function DecisionRow(props: DecisionRowProps): React.ReactElement;

export interface CharCountProps { count: number; limit?: number; unit?: string; live?: boolean }
export declare function CharCount(props: CharCountProps): React.ReactElement;

export interface EmptyStateProps { icon?: IconName; title: string; body?: string; action?: React.ReactNode; secondary?: React.ReactNode; tone?: 'neutral' | 'error'; busy?: boolean; children?: React.ReactNode }
export declare function EmptyState(props: EmptyStateProps): React.ReactElement;

export interface NoticeProps { tone?: 'warning' | 'info'; icon?: IconName; title: string; body?: string; action?: React.ReactNode }
export declare function Notice(props: NoticeProps): React.ReactElement;

export type BlockState = 'accepted' | 'edited' | 'pending' | 'current' | 'discarded' | 'missing' | 'omitted';
export interface PageOutlineProps { groups: { title: string; items: { label: string; state?: BlockState; required?: boolean }[] }[] }
export declare function PageOutline(props: PageOutlineProps): React.ReactElement;

export interface CopySummaryProps { sections: { title: string; items: { label: string; text?: string; tag?: 'edited' | 'kept' | 'omitted' | 'missing' }[] }[] }
export declare function CopySummary(props: CopySummaryProps): React.ReactElement;

export interface AiCostChipProps { total: number; cap?: number; running?: boolean }
export declare function AiCostChip(props: AiCostChipProps): React.ReactElement;

export interface AiStageCost { label: string; cost: number; runs?: number; retries?: number; note?: string; tokens?: string }
export interface AiCostCardProps { total: number; totalUsd: number; generations: number; cap?: number; stages?: AiStageCost[]; context?: string | null; compact?: boolean; audience?: 'merchant' | 'admin'; action?: React.ReactNode }
export declare function AiCostCard(props: AiCostCardProps): React.ReactElement;

export interface AiRun { kind: 'gen' | 'regen' | 'retry' | 'fail'; what: string; stage: string; when: string; cost?: number; model?: string; tokens?: string }
export interface AiRunListProps { runs: AiRun[]; audience?: 'merchant' | 'admin' }
export declare function AiRunList(props: AiRunListProps): React.ReactElement;

declare global {
  interface Window {
    DropFlex: {
      Button: typeof Button; IconButton: typeof IconButton; StatusBadge: typeof StatusBadge; StageMeter: typeof StageMeter;
      ProductRow: typeof ProductRow; AttentionItem: typeof AttentionItem; StageList: typeof StageList; ReviewCard: typeof ReviewCard;
      ImageTile: typeof ImageTile; SegmentedControl: typeof SegmentedControl; Field: typeof Field; PriceBreakdown: typeof PriceBreakdown;
      OfferPreview: typeof OfferPreview; Metric: typeof Metric; CampaignCard: typeof CampaignCard; Navigation: typeof Navigation;
      TopBar: typeof TopBar; Toast: typeof Toast; AssistantSheet: typeof AssistantSheet; Icon: typeof Icon;
      OnboardingHeader: typeof OnboardingHeader; ProviderMark: typeof ProviderMark; ConnectionCard: typeof ConnectionCard; PermissionList: typeof PermissionList;
      OptionList: typeof OptionList; PickRow: typeof PickRow; GenerationProgress: typeof GenerationProgress; SetupChecklist: typeof SetupChecklist;
      ProductInfoInput: typeof ProductInfoInput; ReferenceImage: typeof ReferenceImage; ImageUploader: typeof ImageUploader;
      Stars: typeof Stars; ReviewImporter: typeof ReviewImporter; ReviewSummary: typeof ReviewSummary; ReviewItem: typeof ReviewItem;
      ScoreBar: typeof ScoreBar; RoleChip: typeof RoleChip; AngleCard: typeof AngleCard; AngleSuggestion: typeof AngleSuggestion; IcpSummary: typeof IcpSummary; AngleDevelopment: typeof AngleDevelopment;
      StructurePicker: typeof StructurePicker; PresetSelect: typeof PresetSelect; ConfigSection: typeof ConfigSection; ChipInput: typeof ChipInput; RuleRow: typeof RuleRow; RuleGroup: typeof RuleGroup; CreativeSlot: typeof CreativeSlot; CampaignTree: typeof CampaignTree; DecisionRow: typeof DecisionRow;
      CharCount: typeof CharCount; EmptyState: typeof EmptyState; Notice: typeof Notice; PageOutline: typeof PageOutline; CopySummary: typeof CopySummary;
      AiCostChip: typeof AiCostChip; AiCostCard: typeof AiCostCard; AiRunList: typeof AiRunList;
    };
  }
}
