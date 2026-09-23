// Componentes de DropFlex. Props: design-system/reference/index.d.ts.
// Comportamiento y textos: design-system/reference/<Componente>/README.md.
export { Icon, type IconName, type IconProps } from "./icon";
export { Button, buttonClasses, type ButtonProps, type NativeButtonProps } from "./button";
export { IconButton, type IconButtonProps } from "./icon-button";
export { StatusBadge, type ContentStatus, type StatusBadgeProps } from "./status-badge";
export { StageMeter, type MeterStage, type StageMeterProps } from "./stage-meter";
export { Thumb } from "./thumb";
export { ProductRow, rowClasses, type ProductRowProps, type RowTone } from "./product-row";
export { AttentionItem, type AttentionItemProps, type AttentionKind } from "./attention-item";
export { StageList, type Stage, type StageListProps, type StageState } from "./stage-list";
export { ReviewCard, ReviewActions, type ReviewCardProps, type ReviewState } from "./review-card";
export { ImageTile, type ImageTileProps, type ImageTileState } from "./image-tile";
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from "./segmented-control";
export { Field, type FieldProps } from "./field";
export { PriceBreakdown, type PriceBreakdownProps, type PricePart } from "./price-breakdown";
export { OfferPreview, ReviewsStorePreview, type OfferPreviewProps, type ReviewsStorePreviewProps } from "./offer-preview";
export { Metric, MetricGrid, type MetricProps, type MetricTrend } from "./metric";
export { CampaignCard, VerdictNote, type CampaignCardProps, type Verdict, type VerdictProps } from "./campaign-card";
export { Navigation, type NavigationProps, type NavId, type NavItem } from "./navigation";
export { TopBar, type TopBarProps } from "./top-bar";
export { Toast, Toaster, notify, notifyUndo, type ToastProps } from "./toast";
export { AssistantSheet, type AssistantMessage, type AssistantSheetProps } from "./assistant-sheet";
// Onboarding (design-system/onboarding.md)
export { OnboardingHeader, type OnboardingHeaderProps } from "./onboarding-header";
export { ConnectionCard, ProviderMark, type ConnectionCardProps, type ConnectionState, type Provider } from "./connection-card";
export { PermissionList, type Permission, type PermissionListProps } from "./permission-list";
export { OptionList, type Option, type OptionListProps } from "./option-list";
export { PickRow, type PickRowProps } from "./pick-row";
export { GenerationProgress, type GenerationItem, type GenerationProgressProps } from "./generation-progress";
export { SetupChecklist, type SetupChecklistProps, type SetupItem } from "./setup-checklist";
export { StateChip } from "./state-chip";
// Producto sin optimizar (design-system/arquitectura.md › 8)
export { ProductInfoInput, INFO_TOPICS, type ProductInfoInputProps } from "./product-info-input";
export { ReferenceImage, ReferenceAddTile, type ReferenceImageProps, type ReferenceImageState } from "./reference-image";
export { ImageUploader, ACCEPTED_TYPES, type ImageUploaderProps, type UploadItem, type UploaderMode } from "./image-uploader";
// Reseñas importadas (design-system/arquitectura.md › 9)
export { Stars, type StarsProps } from "./stars";
export { Switch, type SwitchProps } from "./switch";
export { ReviewImporter, type MinStars, type ReviewImporterProps, type ReviewImporterState } from "./review-importer";
export { ReviewSummary, type ReviewSummaryProps } from "./review-summary";
export { ReviewItem, type ReviewItemProps, type ReviewItemState } from "./review-item";
