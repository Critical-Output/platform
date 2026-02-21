import { CourseApiError, type CourseRequestContext } from "./context";

export type LessonVisibility = "free_preview" | "members_only" | "specific_tier";

export type LessonVisibilitySettings = {
  visibility: LessonVisibility;
  requiredTier: string | null;
};

type SubscriptionTierRow = {
  plan_name: string | null;
  metadata: Record<string, unknown> | null;
};

const subscriptionTierKeys = ["tier", "plan", "plan_name", "membership_tier", "required_tier"] as const;

const asMetadataObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const normalizeTierName = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

export const toLessonVisibilitySettings = (metadata: unknown): LessonVisibilitySettings => {
  const metadataObject = asMetadataObject(metadata);
  const rawVisibility = metadataObject.visibility;
  const visibility: LessonVisibility =
    rawVisibility === "free_preview" || rawVisibility === "specific_tier"
      ? rawVisibility
      : "members_only";

  return {
    visibility,
    requiredTier: normalizeTierName(metadataObject.required_tier),
  };
};

export const hasRequiredTierAccess = (
  activeSubscriptionTiers: Set<string>,
  requiredTier: string | null,
): boolean => {
  if (!requiredTier) {
    return false;
  }

  return activeSubscriptionTiers.has(requiredTier);
};

export const toRestrictedLessonMetadata = (
  settings: LessonVisibilitySettings,
): Record<string, unknown> => {
  return {
    visibility: settings.visibility,
    required_tier: settings.requiredTier,
  };
};

const collectSubscriptionTierNames = (metadata: unknown): string[] => {
  const metadataObject = asMetadataObject(metadata);
  const tiers = new Set<string>();

  for (const key of subscriptionTierKeys) {
    const tierValue = normalizeTierName(metadataObject[key]);
    if (tierValue) {
      tiers.add(tierValue);
    }
  }

  const listValue = metadataObject.tiers;
  if (Array.isArray(listValue)) {
    for (const item of listValue) {
      const tierValue = normalizeTierName(item);
      if (tierValue) {
        tiers.add(tierValue);
      }
    }
  }

  return Array.from(tiers.values());
};

export const loadActiveSubscriptionTiers = async (
  supabase: CourseRequestContext["supabase"],
  brandId: string,
  customerId: string,
): Promise<Set<string>> => {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_name,metadata")
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .in("status", ["trialing", "active", "past_due"]);

  if (error) {
    throw new CourseApiError(500, `Could not load subscriptions: ${error.message}`);
  }

  const tiers = new Set<string>();

  for (const row of (data ?? []) as SubscriptionTierRow[]) {
    const planTier = normalizeTierName(row.plan_name);
    if (planTier) {
      tiers.add(planTier);
    }

    for (const metadataTier of collectSubscriptionTierNames(row.metadata)) {
      tiers.add(metadataTier);
    }
  }

  return tiers;
};
