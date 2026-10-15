import { parseRupees } from "./listing-draft";
import type {
  PublicListingDetail,
  PublicListingSummary,
  PublicPhoto,
  PublicPriceComponent,
  PublicProperty,
  PublicUnit,
} from "./public-listings";

/* ------------------------------------------------------------------ */
/* Labels for backend enums                                             */
/* ------------------------------------------------------------------ */

const UNIT_TYPE_LABELS: Record<string, string> = {
  PRIVATE_ROOM: "Private room",
  SHARED_ROOM_BED: "Shared room",
  PG_BED: "PG bed",
  ENTIRE_FLAT: "Entire flat",
  ENTIRE_STUDIO: "Entire studio",
  OTHER: "Other space",
};

const GENDER_LABELS: Record<string, string> = {
  MALE: "Boys",
  FEMALE: "Girls",
  ANY: "Co-ed",
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  PG: "PG",
  HOSTEL: "Hostel",
  APARTMENT_FLAT: "Apartment",
  INDEPENDENT_HOUSE: "Independent house",
  ASSAM_TYPE_HOUSE: "Assam-type house",
  STUDIO_BUILDING: "Studio",
  OTHER: "Other place",
};

const RENT_BASIS_LABELS: Record<string, string> = {
  PER_PERSON: "per person",
  PER_ROOM: "per room",
  PER_UNIT: "for the whole place",
};

const BILLING_LABELS: Record<string, string> = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  ANNUALLY: "yearly",
  ONE_TIME: "one-time",
  USAGE_BASED: "metered",
};

const CHARGE_LABELS: Record<string, string> = {
  RENT: "Rent",
  DEPOSIT: "Deposit",
  MAINTENANCE: "Maintenance",
  FOOD: "Food",
  ELECTRICITY: "Electricity",
  WATER: "Water",
  INTERNET: "Internet",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatShortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export function displayUnitKind(unit: PublicUnit): string {
  if (unit.layout?.trim()) return unit.layout.trim();
  return UNIT_TYPE_LABELS[unit.unit_type] ?? unit.unit_type;
}

export function displayUnitLine(unit: PublicUnit): string {
  const kind = displayUnitKind(unit);
  const gender = GENDER_LABELS[unit.gender_scope] ?? unit.gender_scope;
  if (
    unit.unit_type === "SHARED_ROOM_BED" &&
    typeof unit.capacity === "number" &&
    Number.isSafeInteger(unit.capacity) &&
    unit.capacity >= 2
  ) {
    return `${kind} · ${unit.capacity} beds · ${gender}`;
  }
  return `${kind} · ${gender}`;
}

export function displayPropertyType(propertyType: string): string {
  return PROPERTY_TYPE_LABELS[propertyType] ?? propertyType;
}

export function displayRentBasis(rentBasis: string): string {
  return RENT_BASIS_LABELS[rentBasis] ?? rentBasis;
}

export function displayAvailability(
  availabilityStatus: string,
  availableFrom: string | null
): string {
  if (availabilityStatus === "AVAILABLE_NOW") return "Available now";
  if (availabilityStatus === "AVAILABLE_FROM_DATE") {
    return availableFrom
      ? `Available from ${formatShortDate(availableFrom)}`
      : "Available from date";
  }
  if (availabilityStatus === "OCCUPIED") return "Currently full";
  return availabilityStatus;
}

export function displayLocation(property: PublicProperty): string {
  const place = [property.locality, property.city]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
  const area = property.area_name?.trim();
  if (place && area) return `${place} · ${area}`;
  if (place) return place;
  if (area) return area;
  return "Location on request";
}

/* ------------------------------------------------------------------ */
/* Money                                                                */
/* ------------------------------------------------------------------ */

export function formatPaise(amountPaise: number | null): string | null {
  if (
    amountPaise === null ||
    amountPaise === undefined ||
    !Number.isSafeInteger(amountPaise) ||
    amountPaise < 0
  ) {
    return null;
  }
  const rupees = amountPaise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRate(
  row: Pick<
    PublicPriceComponent,
    "amount_paise" | "rate_paise_per_unit" | "consumption_unit"
  >
): string {
  const amount = formatPaise(row.amount_paise);
  if (amount) return amount;
  const rate = formatPaise(row.rate_paise_per_unit);
  if (rate) {
    return row.consumption_unit?.trim()
      ? `${rate} per ${row.consumption_unit.trim()}`
      : `${rate} per unit`;
  }
  return "Varies";
}

export function displayChargeLabel(row: PublicPriceComponent): string {
  if (row.charge_type === "OTHER") return row.label?.trim() || "Other";
  return CHARGE_LABELS[row.charge_type] ?? row.charge_type;
}

export function displayPriceRow(row: PublicPriceComponent): {
  label: string;
  amount: string;
} {
  const frequency = BILLING_LABELS[row.billing_frequency] ?? row.billing_frequency;
  const label = `${displayChargeLabel(row)} · ${frequency}${
    row.mandatory ? "" : " · optional"
  }${row.refundable ? " · refundable" : ""}`;
  return { label, amount: formatRate(row) };
}

export function monthlyPrice(listing: PublicListingSummary | PublicListingDetail): {
  prefix: string;
  amount: string | null;
  suffix: string | null;
  unavailableLabel: string | null;
  note: string | null;
} {
  const formatted = formatPaise(listing.monthly_total_paise);
  if (!formatted) {
    return {
      prefix: "",
      amount: null,
      suffix: null,
      unavailableLabel: "Monthly total unavailable",
      note: "The monthly baseline cannot be calculated from this listing's current price rows. Open the details for every listed charge.",
    };
  }
  const extras: string[] = [];
  if (listing.has_variable_charges) extras.push("variable charges");
  if (listing.has_usage_charges) extras.push("usage-based charges");
  if (listing.has_optional_charges) extras.push("optional extras");
  if (listing.has_one_time_charges) extras.push("one-time charges");
  if (extras.length === 0) {
    return { prefix: "", amount: formatted, suffix: "/month", unavailableLabel: null, note: null };
  }
  return {
    prefix: "from ",
    amount: formatted,
    suffix: "/month",
    unavailableLabel: null,
    note: `Plus ${extras.join(", ")}.`,
  };
}

/* ------------------------------------------------------------------ */
/* House policies                                                       */
/* ------------------------------------------------------------------ */

const HOUSE_POLICIES: {
  key:
    | "couple_friendly"
    | "visitors_allowed"
    | "pets_allowed"
    | "smoking_allowed"
    | "alcohol_allowed";
  positive: string;
  negative: string;
}[] = [
  {
    key: "couple_friendly",
    positive: "Couples welcome",
    negative: "Couples not welcome",
  },
  {
    key: "visitors_allowed",
    positive: "Visitors allowed",
    negative: "Visitors not allowed",
  },
  {
    key: "pets_allowed",
    positive: "Pets allowed",
    negative: "Pets not allowed",
  },
  {
    key: "smoking_allowed",
    positive: "Smoking allowed",
    negative: "Smoking not allowed",
  },
  {
    key: "alcohol_allowed",
    positive: "Alcohol allowed",
    negative: "Alcohol not allowed",
  },
];

/** User-facing house-policy lines. Unknown (null) policies are omitted. */
export function policyFacts(unit: PublicUnit): string[] {
  return HOUSE_POLICIES.filter(
    (policy) => unit[policy.key] !== null
  ).map((policy) =>
    unit[policy.key] === true ? policy.positive : policy.negative
  );
}

/* ------------------------------------------------------------------ */
/* Photos                                                               */
/* ------------------------------------------------------------------ */

export function detailCoverPhoto(photos: PublicPhoto[]): PublicPhoto | null {
  const explicit = photos.filter((photo) => photo.is_cover);
  const candidates = explicit.length > 0 ? explicit : photos;
  if (candidates.length === 0) return null;
  return candidates.reduce((best, photo) =>
    photo.display_order < best.display_order ||
    (photo.display_order === best.display_order && photo.id < best.id)
      ? photo
      : best
  );
}

/* ------------------------------------------------------------------ */
/* Browse filters                                                       */
/* ------------------------------------------------------------------ */

export function parseBudgetRupees(raw: string): {
  rupees: number | null;
  error: string | null;
} {
  if (raw.trim() === "") return { rupees: null, error: null };
  const rupees = parseRupees(raw);
  if (rupees === null) {
    return {
      rupees: null,
      error: "Enter a whole-rupee budget greater than zero.",
    };
  }
  return { rupees, error: null };
}

export function budgetPaise(rupees: number | null): number | null {
  if (rupees === null) return null;
  if (!Number.isSafeInteger(rupees) || rupees <= 0) return null;
  const paise = rupees * 100;
  return Number.isSafeInteger(paise) ? paise : null;
}
