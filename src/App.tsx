import SystemLanguagePicker from "./SystemLanguagePicker";
import { getSystemLanguage, useSystemLanguage } from "./systemLanguage";
import { translateInterfaceText, translateNeuroReason, translateSystemText } from "./systemTranslations";
import { plateMatches } from "./plateSearch";
import { fleetReviewSearchMatches } from "./fleetReviewSearch";
import "./FleetReview.css";
import SubmittedTickets from "./SubmittedTickets";
import KnowledgeLibrary from "./KnowledgeLibrary";
import "./Workshop.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AcousticDiagnostics from "./AcousticDiagnostics";
import {
  PButton,
  PSpinner,
  PTag,
  PTabs,
  PTabsItem,
} from "./BootstrapUI";
import {
  Activity,
  ArrowLeft,
  Mic,
  AlertTriangle,
  Bus,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  CloudUpload,
  FileText,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Settings2,
  Truck,
  Wrench,
  Gauge,
  Radio,
  Thermometer,
  CircleHelp,
  CircleDot,
  Cog,
  CarFront,
  Boxes,
  X,
  Sun,
  Moon,
  LogOut,
  KeyRound,
  Users as UsersIcon,
} from "lucide-react";
import VoiceInput, { isSpeechRecognitionAvailable } from "./VoiceInput";
import MechanicVoice from "./MechanicVoice";
import { historyAnswerKind, isDiagnosisCommand, isRepairHistoryQuestion, isTicketCommand, voiceCancellation, voiceConfirmation, type MechanicLanguageCode } from "./neuroVoiceIntents";
import { MechanicLanguage, mechanicInstruction } from "./MechanicLanguage";
import { repairExample } from "./repairExample";
import RepairExperience, { type RepairExperienceData } from "./RepairExperience";
import PartOffers from "./PartOffers";
import AdminQaReview from "./AdminQaReview";
import NeuroWorkflow, { NeuroChatHistory, type NeuroChatTurn, type ManualEvidenceItem } from "./NeuroWorkflow";
import { normalizeManualText } from "./manualText";
import { selectNeuroTool } from "./neuroTools";
import NeuroFleetOverview, { MeasurementTrend, type NeuroPriorityVehicle, type StoredHistory, type NeuroTrendSession } from "./NeuroFleetOverview";
import Plate from "./Plate";
import { mechanicPlanIntent, stepHint, hasStepValue } from "./neuroPlanIntents";
import { bindVoiceTicket, matchesVoiceTicket, type VoiceTicketBinding } from "./voiceTicketBinding";
import { translateNeuroDvs as t } from "./neuroDvsTranslations";
import { AUTH_CHANNEL_NAME, AUTH_EPOCH_KEY, createAuthBoundary } from "./authBoundary";
import { canSaveAssignments, visibleConversation } from "./vehicleAccess";
import "./ProcurementDraft.css";
import AssistantAnswer from "./AssistantAnswer";
import { assistantHistoryForRequest, readRecordTarget, recordReturnPath, recordSearch, resolveRecord, type AssistantEvidence, type RecordTarget } from "./evidence";

type VehicleType = "грузовой автомобиль" | "автобус" | "автомобиль 4×4";
type Vehicle = {
  id: string;
  plate: string;
  model: string;
  year: number;
  vin: string;
  color?: string;
  photo?: {
    url: string;
    credit?: string;
    sourceUrl?: string;
    license?: string;
    illustrative: true;
    label?: string;
  } | null;
  issueZones?: {
    id: "front_left" | "front_right" | "rear_left" | "rear_right" | "engine" | "transmission" | "body";
    status: "suspected" | "confirmed" | "no_data";
    label: string;
    source?: string;
    note?: string;
    updatedAt?: string;
    attachmentUrl?: string;
    demo?: boolean;
  }[];
  route: string;
  status: "ready" | "attention" | "repair";
  odometerKm: number;
  obdOdometerKm: number;
  lastSeen: string;
  nextServiceKm: number;
  driver: string;
  crew?: { mechanic: string; expert: string; technologist: string; buyer: string; chief: string };
  engine: string;
  vehicleType?: VehicleType;
  neuroVehicleId?: string;
  measurementPriority?: "normal" | "quarantine" | "attention";
  fuelLevel: number;
  batteryVoltage: number;
  coolantTemp: number;
  dtcs: string[];
  dtcDetails?: { code: string; title: string; description: string; scope: "generic_code"; source?: { title: string; url: string; page: number } | null }[];
  ml: { label: string; confidence: number; detail: string; recordedAt: string };
  telemetry: {
    id: string;
    recordedAt: string;
    source: string;
    odometerKm: number | null;
    rpm: number;
    speed: number;
    coolantTemp: number;
    batteryVoltage: number;
    raw: Record<string, unknown>;
  }[];
  tires?: {
    demo: boolean;
    measuredAt: string;
    positions: { position: string; treadDepthMm: number | null; status: string }[];
  };
  history: {
    id: string;
    date: string;
    odometerKm: number;
    type: string;
    title: string;
    description: string;
    part?: string;
    result?: string;
    parts?: { partId: string; quantity: number; name?: string; sku?: string }[];
  }[];
  notes: {
    id: string;
    text: string;
    createdAt: string;
    category?: string;
    status?: "open" | "resolved";
  }[];
  partsKit?: {
    partId: string;
    quantity: number;
    status: "present" | "missing" | "unknown";
  }[];
  attachments: {
    id: string;
    name: string;
    url: string;
    originalUrl?: string;
    previewUrl?: string;
    originalMime?: string;
    previewMime?: "image/webp";
    mime: string;
    createdAt: string;
  }[];
  inspection: {
    items: {
      id: string;
      status: "pending" | "ok" | "issue" | "na";
      comment: string;
      finding?: string;
    }[];
    status: "draft" | "completed";
    updatedAt: string;
  };
};
type IssueZoneId = NonNullable<Vehicle["issueZones"]>[number]["id"];
type Request = {
  id: string;
  vehicleId: string;
  type: "repair" | "procurement" | "selection";
  title: string;
  description: string;
  priority: "normal" | "high" | "critical";
  status: "new" | "in_progress" | "done";
  part: string;
  quantity: number;
  createdAt: string;
  workItems?: {
    id: string;
    title: string;
    quantity: number;
    unit: string;
    done: boolean;
    urgency?: Urgency;
  }[];
  parts?: { partId: string; quantity: number; usedQuantity: number; name?: string; sku?: string; urgency?: Urgency }[];
  result?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  plan?: MaintenancePlanSnapshot;
  idempotencyKey?: string;
};
type Urgency = "urgent" | "soon" | "next_service";
type MaintenancePart = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  demo: true;
  fit: { model: boolean; vinVerified: false; source: string };
  stock: { quantity: number | null; location: string | null };
  leadTimeDays: number | null;
  purchasePreview: {
    status: "in_stock" | "scheduled" | "order_now" | "unplanned";
    orderDate: string | null;
    neededBy: string | null;
    arrivalDate: string | null;
    arrivalRisk: boolean | null;
    reason: string;
  };
};
type MaintenanceForecast = {
  status: "ready" | "insufficient_history" | "service_due";
  source: string | null;
  confidence: "normal" | "reduced";
  averageKmPerDay: number | null;
  currentOdometerKm: number | null;
  remainingKm: number | null;
  expectedDate: string | null;
  dateRange: { from: string; to: string } | null;
  reason: string | null;
  odometerConflict: { manualKm: number; obdKm: number; deltaKm: number } | null;
  evidence: { recordedAt: string; odometerKm: number; source: string }[];
};
type MaintenancePlanSnapshot = {
  calculatedAt: string;
  forecast: MaintenanceForecast;
  lines?: {
    partId: string;
    quantity: number;
    usedQuantity: number;
    urgency?: Urgency;
    catalog?: {
      sku?: string;
      name?: string;
      unit?: string;
      stock?: { quantity: number | null; location: string | null };
      leadTimeDays?: number | null;
      purchasePreview?: MaintenancePart["purchasePreview"];
    };
  }[];
  workItems?: { id: string; title: string; quantity: number; unit: string; urgency?: Urgency }[];
};
type MaintenancePlan = {
  vehicleId: string;
  calculatedAt: string;
  forecast: MaintenanceForecast;
  parts: MaintenancePart[];
};
const getPartFallbackDemand = (vehicle: Vehicle, plan: MaintenancePlan | null, partId: string) => {
  const missingKitPart = vehicle.partsKit?.find((item) => item.partId === partId && item.status === "missing" && item.quantity > 0);
  const plannedPart = plan?.parts.find((part) => part.id === partId && part.purchasePreview.status !== "in_stock");
  return Math.max(missingKitPart?.quantity || 0, plannedPart ? 1 : 0);
};
type PlanningDraft = {
  idempotencyKey: string;
  observation: string;
  defectConfirmed: boolean;
  title: string;
  workUrgency: Urgency;
  parts: Record<string, { quantity: string; urgency: Urgency }>;
};
type Source = {
  id: string;
  title: string;
  type: "manual" | "community" | "reference";
  url: string;
  description: string;
  tags: string[];
  manual?: string;
  pdfPage?: number;
};
type Integration = {
  id: string;
  name: string;
  kind: string;
  status: string;
  description: string;
  lastSync?: string;
};
type Template = { id: string; section: string; label: string };
type Part = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  stock: number | null;
  demo: boolean;
  vehicleModels: string[];
};
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  evidence?: AssistantEvidence;
  webSearch?: boolean;
  webDomain?: string;
};
type VehicleDraftState = {
  items?: Vehicle["inspection"]["items"];
  note?: string;
  noteCategory?: string;
  kit?: NonNullable<Vehicle["partsKit"]>;
  form?: {
    type: string;
    title: string;
    description: string;
    priority: string;
    part: string;
    quantity: string;
  };
  requestWork?: string;
  requestPartId?: string;
  requestPartQty?: string;
  requestPartOther?: string;
  message?: string;
  requestDraft?: string;
  telemetryText?: string;
};
const vehicleDraftKey = (id: string) => `mehay-draft-${id}`;
function readVehicleDraft(id: string): VehicleDraftState | null {
  try {
    return JSON.parse(authBoundary.read(vehicleDraftKey(id)) || "null");
  } catch {
    return null;
  }
}
function updateVehicleDraft(id: string, patch: Partial<VehicleDraftState>) {
  const existing = readVehicleDraft(id) || {};
  authBoundary.persist(
    vehicleDraftKey(id),
    JSON.stringify({ ...existing, ...patch }),
  );
}
type Data = {
  vehicles: Vehicle[];
  requests: Request[];
  sources: Source[];
  integrations: Integration[];
  checklistTemplate: Template[];
  ai: { configured: boolean; model: string };
  acousticDemo?: boolean;
};
type AuthUser = { id: string; username: string; displayName: string; role: "admin" | "mechanic" };
type AdminUser = AuthUser & { active: boolean; createdAt: string; updatedAt: string };
const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const appPath = (path: string) => {
  if (/^https?:\/\//i.test(path) || path.startsWith("blob:") || path.startsWith("data:")) return path;
  const local = path.startsWith("/") ? path : `/${path}`;
  return APP_BASE && local !== APP_BASE && !local.startsWith(`${APP_BASE}/`)
    ? `${APP_BASE}${local}`
    : local;
};
const authChannel = typeof BroadcastChannel === "undefined" ? null : (() => {
  try { return new BroadcastChannel(AUTH_CHANNEL_NAME); }
  catch { return null; }
})();
const authBoundary = createAuthBoundary(
  sessionStorage,
  (destination) => window.location.replace(destination),
  localStorage,
  (epoch) => { try { authChannel?.postMessage(epoch); } catch { /* Focus revalidation remains authoritative. */ } },
);
function startAuthTransition(destination: string) { authBoundary.begin(destination); }
const readRoute = () => {
  let path = window.location.pathname;
  if (APP_BASE && (path === APP_BASE || path.startsWith(`${APP_BASE}/`))) path = path.slice(APP_BASE.length) || "/";
  else if (!APP_BASE && (path === "/mehay" || path.startsWith("/mehay/"))) path = path.slice(6) || "/";
  return ["/", "/login", "/app"].includes(path.replace(/\/$/, "") || "/") ? path.replace(/\/$/, "") || "/" : "/";
};
const nav = [
  ["Обзор", LayoutDashboard],
  ["Автопарк", Truck],
  ["Акустика", Radio],
  ["Осмотры", ClipboardCheck],
  ["Заявки", Wrench],
  ["База знаний", BookOpen],
  ["Интеграции", Settings2],
] as const;
const rub = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
const confidencePct = (n: number) => Math.round(n <= 1 ? n * 100 : n);
const date = (s: string) =>
  new Date(s).toLocaleDateString(getSystemLanguage(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Moscow",
  });
const stateName = {
  ready: "Без замечаний",
  attention: "Требует внимания",
  repair: "В ремонте",
};
const tagState = { ready: "success-frosted", attention: "warning-frosted", repair: "error-frosted" } as const;
function VehicleStatus({ vehicle }: { vehicle: Vehicle }) {
  const priority = vehicle.measurementPriority;
  const language = getSystemLanguage();
  const measured = priority && <PTag variant={priority === "quarantine" ? "error-frosted" : priority === "normal" ? "success-frosted" : "warning-frosted"}>НейроДВС · {translateSystemText(priority === "quarantine" ? "Карантин" : priority === "normal" ? "Без отклонений" : "Требует внимания", language)}</PTag>;
  return <>{measured}{(!priority || vehicle.status === "repair") && <PTag variant={tagState[vehicle.status]}>{translateSystemText(stateName[vehicle.status], language)}</PTag>}</>;
}
const vehicleTabs = [
  ["summary", "Сводка"],
  ["diagnostics", "Диагностика"],
  ["service", "История"],
  ["inspection", "Осмотр"],
  ["planning", "План работ"],
  ["files", "Файлы"],
  ["parts", "Детали и отчёт"],
] as const;
const engineManuals = [
  { value: "ЯМЗ-236М2", label: "ЯМЗ-236М2 · эксплуатация и ремонт" },
  { value: "ЯМЗ-536", label: "ЯМЗ-536 · эксплуатация и ремонт" },
  { value: "ЗМЗ-5234.10", label: "ЗМЗ-5234.10 · руководство по ремонту" },
  { value: "ЗМЗ-40904.10", label: "ЗМЗ-40904.10 · общее руководство серии 409" },
  { value: "ЗМЗ-40905.10", label: "ЗМЗ-40905.10 · общее руководство серии 409" },
] as const;
const matchingEngineManual = (engine?: string) => engineManuals.find(({ value }) =>
  engine?.toLowerCase().replaceAll("ё", "е").includes(value.toLowerCase().replaceAll("ё", "е")),
)?.value || "";
const vehicleRank = (status: Vehicle["status"]) =>
  status === "repair" ? 0 : status === "attention" ? 1 : 2;
const requestHeading = (request: Request) => {
  const title = request.title?.trim();
  if (title) return title;
  const work = request.workItems?.find((item) => item.title.trim())?.title;
  const part = request.parts?.[0]?.name || request.parts?.[0]?.sku || request.parts?.[0]?.partId || request.part;
  if (request.type === "repair") return work ? `Ремонт: ${work}` : "Заявка на ремонт";
  if (request.type === "procurement") return part ? `Закупка: ${part}` : "Закупка запчастей";
  return part ? `Подбор запчасти: ${part}` : "Подбор запчастей";
};
const getProcurementBalance = (requests: Request[], vehicleId: string, partId: string, fallbackDemand = 0) => {
  const remaining = (type: Request["type"]) => requests
    .filter((request) => request.vehicleId === vehicleId && request.type === type && request.status !== "done" && request.approvalStatus !== "rejected" && !(type === "repair" && request.plan && request.approvalStatus === "pending"))
    .flatMap((request) => request.parts || [])
    .filter((part) => part.partId === partId && Number.isSafeInteger(part.quantity - part.usedQuantity) && part.quantity > part.usedQuantity)
    .reduce((sum, part) => sum + part.quantity - part.usedQuantity, 0);
  const repairDemand = remaining("repair");
  const activeProcurement = remaining("procurement");
  const demand = Math.max(repairDemand, fallbackDemand);
  return { repairDemand, activeProcurement, demand, uncovered: Math.max(0, demand - activeProcurement) };
};
const catalogPartName = (partId: string, catalog: { id?: string; name?: string; sku?: string }[]) => {
  const part = catalog.find((item) => item.id === partId);
  return part?.name || part?.sku || partId;
};
const requestPartName = (request: { parts?: { partId: string; name?: string; sku?: string }[]; plan?: MaintenancePlanSnapshot }, partId: string, catalog: { id?: string; name?: string; sku?: string }[]) => {
  const snapshot = request.plan?.lines?.find((line) => line.partId === partId)?.catalog;
  if (snapshot?.name || snapshot?.sku) return snapshot.name || snapshot.sku!;
  const savedPart = request.parts?.find((part) => part.partId === partId);
  if (savedPart?.name || savedPart?.sku) return savedPart.name || savedPart.sku!;
  return catalogPartName(partId, catalog);
};
const requestManualPart = (request: Request, catalog: { id?: string; name?: string; sku?: string }[]) => {
  const name = request.part?.trim();
  if (!name) return "";
  const normalized = name.toLocaleLowerCase();
  const catalogNames = (request.parts || []).flatMap((item) => [
    item.name,
    item.sku,
    item.partId,
    catalogPartName(item.partId, catalog),
  ]).filter(Boolean).map((item) => item!.trim().toLocaleLowerCase());
  return catalogNames.includes(normalized) ? "" : name;
};
const vehicleColor = (name?: string) => {
  const value = (name || "").toLowerCase();
  if (value.includes("бел")) return "#e6e8e3";
  if (value.includes("сер")) return "#89918f";
  if (value.includes("чер")) return "#303433";
  if (value.includes("син")) return "#426c92";
  if (value.includes("крас")) return "#ad5145";
  if (value.includes("зел")) return "#55745f";
  if (value.includes("оранж")) return "#c67c3b";
  if (value.includes("серебр")) return "#bbc0be";
  return "#a4aaa5";
};
const safeUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
};
const sourceUrl = (source: Source) => {
  const href = safeUrl(source.url) || (source.url.startsWith("/api/manuals/") ? new URL(appPath(source.url), window.location.origin).href : null);
  if (!href || !source.pdfPage) return href;
  const parsed = new URL(href);
  if (/\.pdf$/i.test(parsed.pathname)) parsed.hash = `page=${source.pdfPage}`;
  return parsed.href;
};
const authenticatedResourceUrl = (url: string) => {
  const resolved = appPath(url);
  const identity = authBoundary.identity;
  const parsed = new URL(resolved, window.location.origin);
  if (parsed.origin === window.location.origin && parsed.pathname.includes("/uploads/")) {
    if (identity) parsed.searchParams.set("mehay-user-id", identity);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return parsed.href;
};
const safeResourceUrl = (url: string) => {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin && parsed.pathname.includes("/uploads/")) {
      return authenticatedResourceUrl(url);
    }
  } catch {
    // Fall through to the general safe URL check.
  }
  return safeUrl(url) || (url.startsWith("/uploads/") || Boolean(APP_BASE && url.startsWith(`${APP_BASE}/uploads/`)) ? authenticatedResourceUrl(url) : null);
};
const interfaceText = (text: string) => translateSystemText(text, getSystemLanguage());
const procurementReason = (reason: string) => ({
  stock_available: "Остатка достаточно для выбранного количества",
  lead_time_and_buffer: "Срок рассчитан с трёхдневным запасом до ТО",
  past_order_deadline: "Крайний срок заказа уже прошёл",
  urgent_category: "Срочная потребность не откладывается к ТО",
  missing_forecast: "Нет подтверждённого прогноза даты ТО",
  unknown_lead_time: "Срок поставки неизвестен",
  unknown_stock: "Остаток на складе неизвестен",
  invalid_demand: "Проверьте количество детали",
} as Record<string, string>)[reason] || "Срок закупки не рассчитан";
const forecastReason = (reason?: string | null) => ({
  insufficient_history: "Недостаточно записей пробега",
  odometer_conflict: "Показания пробега расходятся",
  service_due: "Порог обслуживания достигнут",
  missing_forecast: "Нет подтверждённого прогноза",
} as Record<string, string>)[reason || ""] || "Нет подтверждённой динамики пробега";
const purchaseStatusLabel = (status?: MaintenancePart["purchasePreview"]["status"]) => ({
  in_stock: "Есть на складе",
  scheduled: "Плановая закупка",
  order_now: "Заказать сейчас",
  unplanned: "Срок неизвестен",
} as Record<string, string>)[status || ""] || "Статус неизвестен";
const appendTranscript = (current: string, transcript: string) =>
  `${current}${current.trim() ? " " : ""}${transcript.trim()}`;
function UrgencyOptions() {
  return <>
    <option value="urgent">Срочно необходимо</option>
    <option value="soon">Желательно в ближайшее время</option>
    <option value="next_service">К следующему ТО</option>
  </>;
}

function urgencyLabel(value?: Urgency) {
  return value === "urgent" ? "Срочно" : value === "soon" ? "В ближайшее время" : value === "next_service" ? "К следующему ТО" : "Срочность не указана";
}
const issueZoneOrder: { id: IssueZoneId; label: string; position: string }[] = [
  { id: "front_left", label: "Переднее левое", position: "front-left" },
  { id: "front_right", label: "Переднее правое", position: "front-right" },
  { id: "engine", label: "Двигатель", position: "engine" },
  { id: "transmission", label: "Трансмиссия", position: "transmission" },
  { id: "body", label: "Кузов", position: "body" },
  { id: "rear_left", label: "Заднее левое", position: "rear-left" },
  { id: "rear_right", label: "Заднее правое", position: "rear-right" },
];

type NeuroFleetVehicle = {
  vehicle_id: string;
  garage_no: string;
  make: string;
  model: string;
  engine_model: string;
  sessions: NeuroTrendSession[];
};
type NeuroDiagnosis = {
  resultHash: string;
  diagnosis: Record<string, unknown>;
  guidance: {
    status: "normal" | "anomaly" | "check_failed" | "uncertain" | "stop" | "model_conflict" | "warning_confirmation_required";
    message: string;
    timingMarks?: { outcome: null | "matched" | "mismatched" };
    recommendations: { operationKind?: "repair" | "inspection"; procedure?: ManualEvidenceItem[]; text: string; translations?: Partial<Record<"en" | "hi" | "tg" | "uz", string>>; excerpt?: string; stepKey?: string; manual: string; pdfPage: number; url: string }[];
    canCreateTicket: boolean;
    canCreateDefectoscopyTicket?: boolean;
    ticketBlockReason?: string;
    urgency?: "low" | "medium" | "high";
    risk?: "low" | "medium" | "high";
    confidence?: { value: number | null; percent: number | null; threshold: number; thresholdPercent: number; label: string };
    quality?: { value: string; label: string };
    nextAction?: string;
    warningAcknowledged?: boolean;
    warningAcknowledgementRequired?: boolean;
  };
};
const neuroSessionStatus = (status: string) => ({
  normal: "Без отклонений",
  anomaly: "Есть отклонение",
  ready: "Готово к проверке",
  measured: "Измерение выполнено",
  completed: "Измерение выполнено",
  confirmed: "Измерение подтверждено",
  check_failed: "Проверка не пройдена",
  failed: "Проверка не пройдена",
  invalid: "Некорректное измерение",
} as Record<string, string>)[status.toLowerCase()] || "Статус измерения";
const neuroQualityLabel = (quality: unknown) => ({ good: "хорошее", warning: "требует внимания", bad: "непригодное" } as Record<string, string>)[String(quality || "").toLowerCase()] || quality;
const asksVehicleHistory = (text: string) => /(?:что\s+(?:раньше|было)\s+(?:у\s+)?(?:этой\s+)?машин|какие\s+(?:есть\s+)?заявк|(?:прошл|предыдущ).{0,20}(?:замер|провер|диагноз|заявк)|истори.{0,20}(?:машин|автомобил|провер|диагноз|заявк)|what happened before|previous (?:checks|diagnoses|tickets)|which tickets|show (?:the )?vehicle history)/iu.test(text);

const historyUnavailableCopy: Record<MechanicLanguageCode, string> = {
  ru: "Для этого диагноза сопоставимых записей ремонта не найдено.", en: "No comparable repair records were found for this diagnosis.", hi: "इस निदान के लिए मिलते-जुलते मरम्मत रिकॉर्ड नहीं मिले।", tg: "Барои ин ташхис сабтҳои монанди таъмир ёфт нашуданд.", uz: "Bu tashxis uchun o‘xshash taʼmirlash yozuvlari topilmadi.",
};
function DiagnosticQueue({ vehicles, requests, acoustic, onOpen, onRequest }: {
  vehicles: Vehicle[];
  requests: Request[];
  acoustic: boolean;
  onOpen: (id: string, tab: "diagnostics" | "inspection" | "planning", session?: string) => void;
  onRequest: (request: Request) => void;
}) {
  const [measurements, setMeasurements] = useState<NeuroPriorityVehicle[]>([]);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    setMeasurements([]);
    setFailed(false);
    setShowAll(false);
    if (acoustic) {
      api<{ priorityVehicles: NeuroPriorityVehicle[] }>("/api/neuro/summary")
        .then((result) => { if (active) setMeasurements(result.priorityVehicles); })
        .catch(() => { if (active) setFailed(true); });
    }
    return () => { active = false; };
  }, [acoustic]);
  const queue = vehicles.map((vehicle) => {
    const measure = acoustic ? measurements.find((entry) => entry.vehicle_id === (vehicle.neuroVehicleId || vehicle.id)) : undefined;
    const tickets = requests.filter((entry) => entry.vehicleId === vehicle.id && entry.status !== "done" && entry.approvalStatus !== "rejected");
    const inspection = vehicle.inspection?.status === "draft";
    const quarantine = measure?.status === "quarantine" || vehicle.measurementPriority === "quarantine";
    return { vehicle, measure, tickets, inspection, quarantine };
  }).filter(({ vehicle, measure, tickets, inspection, quarantine }) => measure || quarantine || vehicle.status !== "ready" || tickets.length || inspection)
    .sort((a, b) => Number(b.quarantine) - Number(a.quarantine) || Number(Boolean(b.measure)) - Number(Boolean(a.measure)) ||
      (a.measure && b.measure ? measurements.indexOf(a.measure) - measurements.indexOf(b.measure) : 0) || vehicleRank(a.vehicle.status) - vehicleRank(b.vehicle.status));
  const query = search.trim();
  const filteredQueue = queue.filter(({ vehicle, tickets }) => fleetReviewSearchMatches(vehicle, tickets, query));
  const language = getSystemLanguage();
  return <section className="panel fleet-review" aria-labelledby="fleet-review-title">
    <h2 id="fleet-review-title">{translateSystemText("Очередь внимания", language)} <span>({queue.length})</span></h2>
    <label className="fleet-review-search">
      <span>{translateSystemText("Поиск по номеру, машине или заявке", language)}</span>
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={translateSystemText("Номер, модель, название или ID заявки", language)} />
    </label>
    {failed && <p role="status">{translateSystemText("Свежую сводку замеров загрузить не удалось. Ниже показаны сохранённые данные парка.", language)}</p>}
    {!queue.length && <p>{translateSystemText("Все проверки завершены.", language)}</p>}
    {queue.length > 0 && !filteredQueue.length && <p role="status">{translateSystemText("По запросу ничего не найдено", language)}</p>}
    <ul className="fleet-review-list">{(query || showAll ? filteredQueue : filteredQueue.slice(0, 3)).map(({ vehicle, measure, tickets, inspection, quarantine }) =>
      <li key={vehicle.id}>
        <div className="fleet-review-identity"><Plate value={vehicle.plate} size="compact" /><strong>{vehicle.model}</strong><VehicleStatus vehicle={vehicle} /></div>
        {measure && <p>{translateNeuroReason(measure.reason, getSystemLanguage())}</p>}
        <div className="fleet-review-actions">
          {(measure || quarantine || vehicle.status === "attention") && <button type="button" onClick={() => onOpen(vehicle.id, "diagnostics", measure?.session_id)}>{translateSystemText("Открыть диагностику", language)}</button>}
          {inspection && <button type="button" onClick={() => onOpen(vehicle.id, "inspection")}>{translateSystemText("Продолжить осмотр", language)}</button>}
          {vehicle.status === "repair" && <button type="button" onClick={() => onOpen(vehicle.id, "planning")}>{translateSystemText("Открыть план работ", language)}</button>}
          {tickets.map((ticket) => <button type="button" key={ticket.id} onClick={() => onRequest(ticket)}>{translateSystemText("Заявка ·", language)} {ticket.title} · {ticket.id}</button>)}
        </div>
      </li>)}</ul>
    {queue.length > 3 && !query && <button className="btn btn-outline-secondary" type="button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? translateSystemText("Свернуть очередь", language) : translateInterfaceText("Показать все ({0})", language, [queue.length])}</button>}
  </section>;
}
function VehicleMeasurementSummary({ vehicleId }: { vehicleId: string }) {
  const [checks, setChecks] = useState<NeuroTrendSession[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ checks: NeuroTrendSession[] }>(`/api/neuro/history?${new URLSearchParams({ vehicleId })}`)
      .then(result => { if (active) setChecks(result.checks); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [vehicleId]);
  return checks
    ? <MeasurementTrend sessions={checks} />
    : <p role="status">{failed ? "Не удалось загрузить историю замеров." : "Загружаем историю замеров…"}</p>;
}

type NeuroExchange = { manualVerified?: boolean; id: string; sessionId: string; question: string; answer: string; evidence: ManualEvidenceItem[]; author?: { userId: string; login: string; displayName: string } };
type AssistantMode = "voice" | "question";

function NeuroDvsPage({ assistantHost, assistantMode, assistantOpenId, openAssistant, routerConfigured, cardId, requestedSession, onProcureHistorical, currentMechanic }: { assistantHost: HTMLElement | null; assistantMode: AssistantMode | null; assistantOpenId: number; openAssistant: (mode: AssistantMode) => void; routerConfigured: boolean; cardId: string; requestedSession: string; onProcureHistorical: (part: string) => void; currentMechanic: Pick<AuthUser, "id" | "username" | "displayName"> }) {
  const [fleet, setFleet] = useState<NeuroFleetVehicle[]>([]);
  const [vehicleHistory, setVehicleHistory] = useState<StoredHistory | null>(null);
  const [vehicleHistoryError, setVehicleHistoryError] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const [vehicleId, setVehicleId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [diagnosis, setDiagnosis] = useState<NeuroDiagnosis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [ticketPreview, setTicketPreview] = useState<{ previewToken: string; preview: { purpose?: "repair" | "defectoscopy"; vehicleId: string; sessionId: string; engineModel: string; faultCode: string; confidence: { value: number | null; percent: number | null; threshold: number; thresholdPercent: number; label: string }; signalQuality: { value: string; label: string }; urgency: "low" | "medium" | "high"; urgencyMeaning: string; conclusion: string; operations: { text: string; manual: string; pdfPage: number }[]; historicalNote: string; spareParts: string[] } } | null>(null);
  const [draftUrgency, setDraftUrgency] = useState<"low" | "medium" | "high">("medium");
  const [comparison, setComparison] = useState<{ context: string; part: string } | null>(null);
  const [historicalPart, setHistoricalPart] = useState("");
  const [question, setQuestion] = useState("");
  const questionDraftVersion = useRef(0);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [answers, setAnswers] = useState<{ text: string; manual: string; pdfPage: number; url: string }[] | null>(null);
  const [answerUnavailable, setAnswerUnavailable] = useState(false);
  const [questionBusy, setQuestionBusy] = useState(false);
  const [voiceTicketPending, setVoiceTicketPending] = useState<VoiceTicketBinding<NeuroDiagnosis> | null>(null);
  const [conversation, setConversation] = useState<{ contextKey: string; status: "loading" | "ready" | "error"; exchanges: NeuroExchange[] } | null>(null);
  const [conversationAuthorizationKey, setConversationAuthorizationKey] = useState("");
  const [pendingChatByContext, setPendingChatByContext] = useState<Record<string, NeuroExchange[]>>({});
  const conversationRead = useRef(0);
  const currentAssistantWindow = useRef({ host: assistantHost, openId: assistantOpenId });
  currentAssistantWindow.current = { host: assistantHost, openId: assistantOpenId };
  const [voiceTicketPurpose, setVoiceTicketPurpose] = useState<"repair" | "defectoscopy">("repair");
  const [planStep, setPlanStep] = useState(0);
  const [planMode, setPlanMode] = useState(false);
  const planReturnScrollY = useRef<number | null>(null);
  const restorePlanScroll = useRef(false);
  const diagnosisReturnScrollY = useRef<number | null>(null);
  const capturePlanReturnOrigin = () => { planReturnScrollY.current = window.scrollY; };
  const [performedSteps, setPerformedSteps] = useState<number[]>([]);
  const voiceReplyPending = useRef(false);
  const [planListening, setPlanListening] = useState(false);
  useEffect(() => {
    setPlanListening(Boolean(assistantHost && assistantMode === "voice" && isSpeechRecognitionAvailable()));
    if (assistantHost && assistantMode === "question") assistantHost.querySelector("textarea")?.focus({ preventScroll: true });
  }, [assistantHost, assistantMode]);

  const [pageRequest, setPageRequest] = useState({ step: -1, sequence: 0 });
  const [stepNote, setStepNote] = useState("");
  const [voiceFeedback, setVoiceFeedback] = useState("");
  const lastSentQuestion = useRef("");
  const voiceLanguage = useSystemLanguage();
  const ui = (text: string) => t(text, voiceLanguage);
  const sessionSelect = useRef<HTMLSelectElement>(null);
  const currentVehicle = fleet.find((item) => item.vehicle_id === vehicleId);
  const currentSession = currentVehicle?.sessions.find((item) => item.session_id === sessionId);
  const contextKey = `${vehicleId}:${sessionId}`;
  const activeContext = useRef(contextKey);
  activeContext.current = contextKey;
  useEffect(() => {
    activeContext.current = contextKey;
    questionRun.current++;
    questionRequestActive.current = null;
    setQuestionBusy(false);
    setPendingQuestion("");
    return () => {
      if (activeContext.current === contextKey) activeContext.current = "";
      voiceReplyPending.current = false;
      window.speechSynthesis?.cancel();
    };
  }, [contextKey]);
  const diagnosisRun = useRef(0);
  const questionRun = useRef(0);
  const questionRequestActive = useRef<number | null>(null);
  const [experience, setExperience] = useState<{ diagnosis: NeuroDiagnosis; data: RepairExperienceData | null; error: string } | null>(null);
  const hasRepairHistory = diagnosis?.guidance.status === "anomaly" && Boolean(diagnosis.diagnosis.anomaly_type);
  const currentExperience = experience?.diagnosis === diagnosis ? experience : null;
  const repairRisk = repairExample(currentExperience?.data?.cases || []);
  useEffect(() => {
    if (!hasRepairHistory || !diagnosis) return;
    let active = true;
    api<RepairExperienceData>(`/api/neuro/experience?${new URLSearchParams({ vehicleId, sessionId })}`)
      .then(data => { if (active) setExperience({ diagnosis, data, error: "" }); })
      .catch(cause => { if (active) setExperience({ diagnosis, data: null, error: cause instanceof Error ? cause.message : "Историю ремонтов загрузить не удалось." }); });
    return () => { active = false; };
  }, [vehicleId, sessionId, diagnosis, hasRepairHistory]);
  const conversationPath = `/api/neuro/vehicles/${encodeURIComponent(vehicleId)}/sessions/${encodeURIComponent(sessionId)}/conversation`;
  const [conversationNotice, setConversationNotice] = useState("");
  const visibleExchanges = visibleConversation({ activeContext: contextKey, loadedContext: conversation?.contextKey || null, loadState: conversation?.status || "loading", serverSnapshot: conversation?.exchanges || [], pendingWrites: pendingChatByContext[contextKey] || [] });
  const chatTurns: NeuroChatTurn[] = visibleExchanges.flatMap(exchange => [
    { role: "mechanic", sessionId: exchange.sessionId, author: exchange.author ? `${exchange.author.displayName} (@${exchange.author.login})` : undefined, text: exchange.question, evidence: [] },
    { role: "assistant", manualVerified: exchange.manualVerified === true, sessionId: exchange.sessionId, text: exchange.answer, evidence: exchange.evidence },
  ]);
  useEffect(() => {
    setConversationNotice("");
    if (!vehicleId || !sessionId) return;
    let active = true;
    const readId = ++conversationRead.current;
    setConversation({ contextKey, status: "loading", exchanges: [] });
    api<{ exchanges: NeuroExchange[] }>(conversationPath).then(({ exchanges }) => {
      if (!active || conversationRead.current !== readId) return;
      setConversation({ contextKey, status: "ready", exchanges });
    }).catch(() => {
      if (active && conversationRead.current === readId) {
        setConversation({ contextKey, status: "error", exchanges: [] });
        setConversationNotice("Не удалось загрузить предыдущие вопросы по этой машине.");
      }
    });
    return () => { active = false; };
  }, [vehicleId, sessionId, contextKey, conversationPath]);

  useEffect(() => {
    if (!assistantHost || !assistantOpenId || !vehicleId || !sessionId) return;
    let active = true;
    const readId = ++conversationRead.current;
    const authorizationKey = `${assistantOpenId}:${contextKey}`;
    setConversation({ contextKey, status: "loading", exchanges: [] });
    setConversationNotice("");
    api<{ exchanges: NeuroExchange[] }>(conversationPath).then(({ exchanges }) => {
      if (!active || conversationRead.current !== readId) return;
      setConversation({ contextKey, status: "ready", exchanges });
      setConversationAuthorizationKey(authorizationKey);
    }).catch(() => {
      if (active && conversationRead.current === readId) {
        setConversation({ contextKey, status: "error", exchanges: [] });
        setConversationNotice("Не удалось загрузить предыдущие вопросы по этой машине.");
      }
    });
    return () => { active = false; };
  }, [assistantHost, assistantOpenId, vehicleId, sessionId, contextKey, conversationPath]);

  useEffect(() => {
    let active = true;
    api<{ vehicles: NeuroFleetVehicle[] }>("/api/neuro/fleet").then(({ vehicles }) => {
      if (!active) return;
      setFleet(vehicles);
      const match = vehicles.find(item => item.vehicle_id === cardId);
      setVehicleId(match?.vehicle_id || "");
      setSessionId(match?.sessions.find(item => item.session_id === requestedSession)?.session_id || match?.sessions[0]?.session_id || "");
      if (!match) setError("Измерения для этой машины не найдены.");
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить список измерений"); });
    return () => { active = false; };
  }, [cardId, requestedSession]);
  useEffect(() => {
    if (!vehicleId) { setVehicleHistory(null); return; }
    let active = true;
    setVehicleHistoryError("");
    setVehicleHistory(null);
    api<NonNullable<typeof vehicleHistory>>(`/api/neuro/history?${new URLSearchParams({ vehicleId })}`)
      .then((result) => { if (active) setVehicleHistory(result); })
      .catch(() => { if (active) { setVehicleHistory(null); setVehicleHistoryError("Историю диагнозов и заявок загрузить не удалось."); } });
    return () => { active = false; };
  }, [vehicleId, historyRevision]);
  function clearContext() {
    diagnosisRun.current++;
    questionRun.current++;
    questionRequestActive.current = null;
    setPendingQuestion("");
    voiceReplyPending.current = false;
    setBusy(false); setQuestionBusy(false);
    setVoiceTicketPending(null);
    setPlanStep(0); setPageRequest({ step: -1, sequence: 0 }); setPerformedSteps([]); setPlanListening(false); setStepNote("");
    setVoiceFeedback(""); lastSentQuestion.current = "";
    setDiagnosis(null); setTicketId(""); setTicketPreview(null); setHistoricalPart(""); setComparison(null); setAnswers(null); setAnswerUnavailable(false); setQuestion(""); setError("");
  }
  async function diagnose() {
    setVoiceTicketPending(null);
    setPlanStep(0); setPageRequest({ step: -1, sequence: 0 }); setPerformedSteps([]); setPlanListening(false); setStepNote("");
    if (!vehicleId || !sessionId) return;
    if (diagnosis?.guidance.status === "check_failed") { sessionSelect.current?.focus(); return; }
    const selectedContext = `${vehicleId}:${sessionId}`;
    const run = ++diagnosisRun.current;
    setBusy(true); setError(""); setTicketId("");
    setDiagnosis(null); setTicketPreview(null); setHistoricalPart(""); setComparison(null);
    setAnswers(null); setAnswerUnavailable(false);
    try {
      const result = await api<NeuroDiagnosis>("/api/neuro/diagnose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId, sessionId }) });
      setHistoryRevision(value => value + 1);
      if (activeContext.current === selectedContext && diagnosisRun.current === run) { setDiagnosis(result); setDraftUrgency(result.guidance.urgency || "medium"); setTicketPreview(null); }
    } catch (cause) { if (activeContext.current === selectedContext && diagnosisRun.current === run) { setDiagnosis(null); setError(cause instanceof Error ? cause.message : "Не удалось выполнить диагностику"); } }
    finally { if (diagnosisRun.current === run) setBusy(false); }
  }
  const autoDiagnosed = useRef("");
  useEffect(() => {
    if (!currentVehicle || !currentSession || !sessionId) return;
    const key = `${vehicleId}:${sessionId}`;
    if (autoDiagnosed.current === key) return;
    autoDiagnosed.current = key;
    void diagnose();
  }, [vehicleId, sessionId, currentVehicle, currentSession]);
  function rememberExchange(question: string, answer: string, evidence: ManualEvidenceItem[] = [], savedId?: string) {
    setPendingQuestion("");
    const exchange = { id: savedId || crypto.randomUUID(), manualVerified: Boolean(savedId), sessionId, question, answer, evidence: savedId ? evidence : [], author: { userId: currentMechanic.id, login: currentMechanic.username, displayName: currentMechanic.displayName } };
    setPendingChatByContext(history => ({ ...history, [contextKey]: [...(history[contextKey] || []), exchange].slice(-50) }));
    void (savedId ? Promise.resolve() : api(conversationPath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(exchange) }))
      .then(() => {
        if (activeContext.current !== contextKey) return;
        if (assistantHost && (currentAssistantWindow.current.host !== assistantHost || currentAssistantWindow.current.openId !== assistantOpenId)) return;
        const readId = ++conversationRead.current;
        setConversation({ contextKey, status: "loading", exchanges: [] });
        api<{ exchanges: NeuroExchange[] }>(conversationPath).then(({ exchanges }) => {
          if (activeContext.current === contextKey && conversationRead.current === readId && (!assistantHost || (currentAssistantWindow.current.host === assistantHost && currentAssistantWindow.current.openId === assistantOpenId))) {
            setConversation({ contextKey, status: "ready", exchanges });
            if (assistantHost && assistantOpenId && currentAssistantWindow.current.host === assistantHost && currentAssistantWindow.current.openId === assistantOpenId) setConversationAuthorizationKey(`${assistantOpenId}:${contextKey}`);
            const ids = new Set(exchanges.map(item => item.id));
            setPendingChatByContext(current => ({ ...current, [contextKey]: (current[contextKey] || []).filter(item => !ids.has(item.id)) }));
          }
        }).catch(() => {
          if (activeContext.current === contextKey && conversationRead.current === readId && (!assistantHost || (currentAssistantWindow.current.host === assistantHost && currentAssistantWindow.current.openId === assistantOpenId))) {
            setConversation({ contextKey, status: "error", exchanges: [] });
            setConversationNotice("Не удалось загрузить предыдущие вопросы по этой машине.");
          }
        });
      })
      .catch(() => {
        setPendingChatByContext(current => ({ ...current, [contextKey]: (current[contextKey] || []).filter(item => item.id !== exchange.id) }));
        if (activeContext.current === contextKey) setConversationNotice("Ответ показан. Сохранить его в истории замера не удалось.");
      });
  }
  function speakVoiceReply(source: string, language = voiceLanguage) {
    if (!voiceReplyPending.current) return;
    const text = normalizeManualText(source);
    setVoiceFeedback(text);
    voiceReplyPending.current = false;
    if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = ({ ru: "ru-RU", en: "en-US", hi: "hi-IN", tg: "tg-TJ", uz: "uz-UZ" } as const)[language];
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
  async function askManualText(text: string) {
    setVoiceTicketPending(null);
    const query = text.trim();
    if (!query || !currentVehicle || questionRequestActive.current !== null) return;
    const run = ++questionRun.current;
    questionRequestActive.current = run;
    const submittedDraftVersion = questionDraftVersion.current;
    setQuestion("");
    lastSentQuestion.current = query;
    const isCurrent = () => run === questionRun.current && activeContext.current === contextKey;
    const restoreQuestion = () => { if (questionDraftVersion.current === submittedDraftVersion) setQuestion(query); };
    setError(""); setVoiceFeedback(""); setAnswers(null); setAnswerUnavailable(false);
    try {
    const tool = selectNeuroTool(query);
    if (tool === "diagnose" || isDiagnosisCommand(query, voiceLanguage)) {
      setAnswers(null); setAnswerUnavailable(false);
      await diagnose();
      return;
    }
    if (tool === "ticket" || isTicketCommand(query, voiceLanguage)) {
      const purpose = /дефектовк/iu.test(query) ? "defectoscopy" : "repair";
      if (purpose === "repair" ? !diagnosis?.guidance.canCreateTicket : !diagnosis?.guidance.canCreateDefectoscopyTicket) {
        setError(purpose === "defectoscopy" ? "Для заявки на дефектовку нужна проверка из руководства для этого двигателя." : "Для заявки ТОиР сначала нужен подтверждённый диагноз с рекомендациями из руководства.");
        restoreQuestion();
      } else {
        setVoiceTicketPurpose(purpose);
        setVoiceTicketPending(bindVoiceTicket(vehicleId, sessionId, diagnosis));
      }
      return;
    }
    setPendingQuestion(query);
    setQuestionBusy(true);
    let routedTool: "manual" | "vehicle_history" | "history" | "ticket" | "diagnose" | "fallback" = asksVehicleHistory(query) ? "vehicle_history" : "fallback";
    const shouldRoute = routerConfigured && routedTool !== "vehicle_history" && !isRepairHistoryQuestion(query, voiceLanguage);
    if (shouldRoute) {
      setQuestionBusy(true);
      try {
      const routed = await api<{ tool: "manual" | "vehicle_history" | "history" | "ticket" | "diagnose" | "fallback" }>("/api/neuro/tool-route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, vehicleId, sessionId, hasDiagnosis: Boolean(diagnosis), canCreateTicket: Boolean(diagnosis?.guidance.canCreateTicket || diagnosis?.guidance.canCreateDefectoscopyTicket), language: voiceLanguage }) });
        if (!isCurrent()) return;
        routedTool = routed.tool;
      } catch { routedTool = "fallback"; }
    }
    if (!isCurrent()) return;
    if (routedTool === "diagnose") { setAnswers(null); setAnswerUnavailable(false); await diagnose(); return; }
    if (routedTool === "ticket") {
      const purpose = /дефектовк/iu.test(query) ? "defectoscopy" : "repair";
      if (purpose === "repair" ? !diagnosis?.guidance.canCreateTicket : !diagnosis?.guidance.canCreateDefectoscopyTicket) { setError("Для выбранного типа заявки нет подтверждённой операции из руководства."); restoreQuestion(); }
      else { setVoiceTicketPurpose(purpose); setVoiceTicketPending(bindVoiceTicket(vehicleId, sessionId, diagnosis)); }
      return;
    }
    if (routedTool === "vehicle_history") {
      setQuestionBusy(true); setError(""); setAnswers(null); setAnswerUnavailable(false);
      try {
        const history = await api<{ checks: NeuroTrendSession[]; diagnoses: { session_id: string; created_at: string; status: string; anomaly_type?: string; anomaly_score?: number }[]; tickets: { ticket_id: string; session_id: string; created_at: string; urgency: string; anomaly_type?: string }[] }>(`/api/neuro/history?${new URLSearchParams({ vehicleId })}`);
        if (!isCurrent()) return;
        const statusLabels: Record<string, Record<string, string>> = {
          ru: { normal: "без отклонений", anomaly: "есть отклонение", check_failed: "замер не прошёл" }, en: { normal: "no anomaly", anomaly: "anomaly", check_failed: "measurement failed" },
          hi: { normal: "कोई असामान्यता नहीं", anomaly: "असामान्यता", check_failed: "मापन विफल" }, tg: { normal: "бе камбудӣ", anomaly: "камбудӣ муайян шуд", check_failed: "санҷиш нагузашт" }, uz: { normal: "og‘ish yo‘q", anomaly: "og‘ish bor", check_failed: "o‘lchovdan o‘tmadi" },
        };
        const historyLabels = {
          ru: { measurements: "Последние замеры:", tickets: "Созданные заявки:", score: "оценка" }, en: { measurements: "Recent measurements:", tickets: "Created tickets:", score: "score" },
          hi: { measurements: "हाल के मापन:", tickets: "बनाए गए टिकट:", score: "स्कोर" }, tg: { measurements: "Санҷишҳои охирин:", tickets: "Дархостҳои сохташуда:", score: "баҳо" }, uz: { measurements: "So‘nggi o‘lchovlar:", tickets: "Yaratilgan arizalar:", score: "baho" },
        } as const;
        const lead = ({ ru: `История машины ${vehicleId}.`, en: `History for vehicle ${vehicleId}.`, hi: `${vehicleId} वाहन का इतिहास।`, tg: `Таърихи мошини ${vehicleId}.`, uz: `${vehicleId} avtomobilining tarixi.` } as const)[voiceLanguage];
        const labels = historyLabels[voiceLanguage];
        const checks = history.checks.slice(0, 5).map((item) => `${item.session_id} · ${statusLabels[voiceLanguage][item.status] || item.status}${typeof item.anomaly_score === "number" ? ` · ${labels.score} ${Math.round(item.anomaly_score * 100)}%` : ""}`);
        const tickets = history.tickets.slice(0, 5).map((item) => `${item.ticket_id} · ${item.session_id} · ${item.urgency}`);
        const noChecks = ({ ru: "Замеров нет.", en: "No measurements.", hi: "कोई मापन नहीं।", tg: "Санҷиш нест.", uz: "O‘lchovlar yo‘q." } as const)[voiceLanguage];
        const noTickets = ({ ru: "Заявок нет.", en: "No tickets.", hi: "कोई टिकट नहीं।", tg: "Дархост нест.", uz: "Arizalar yo‘q." } as const)[voiceLanguage];
        const reply = `${lead} ${labels.measurements} ${checks.length ? checks.join("; ") : noChecks} ${labels.tickets} ${tickets.length ? tickets.join("; ") : noTickets}`;
      } catch (cause) { if (!isCurrent()) return; restoreQuestion(); voiceReplyPending.current = false; setError(cause instanceof Error ? cause.message : "Историю машины загрузить не удалось."); }
      return;
    }
    if (routedTool === "history" || isRepairHistoryQuestion(query, voiceLanguage) || /(?:задержал|занял[аои]? больше|причин[аыу] задержки)/iu.test(query)) {
      setQuestionBusy(true); setError(""); setAnswers(null); setAnswerUnavailable(false);
      try {
        if (diagnosis?.guidance.status !== "anomaly") {
          const reply = ({ ru: "Сначала выполните диагностику, чтобы подобрать сопоставимые записи истории ремонта.", en: "Run diagnostics first to find comparable repair records.", hi: "मिलते-जुलते मरम्मत रिकॉर्ड खोजने के लिए पहले निदान करें।", tg: "Барои ёфтани сабтҳои монанд аввал ташхис гузаронед.", uz: "O‘xshash taʼmirlash yozuvlarini topish uchun avval tashxis o‘tkazing." } as const)[voiceLanguage];
          return;
        }
        const history = await api<RepairExperienceData>(`/api/neuro/experience?${new URLSearchParams({ vehicleId, sessionId })}`);
        if (!isCurrent()) return;
        const best = repairExample(history.cases);
        if (!best) { const reply = historyUnavailableCopy[voiceLanguage]; rememberExchange(query, reply); speakVoiceReply(reply); return; }
        const isHours = historyAnswerKind(query, voiceLanguage) === "hours";
        const sample = best.synthetic ? ({ ru: "синтетические данные", en: "synthetic data", hi: "सिंथेटिक डेटा", tg: "маълумоти синтетикӣ", uz: "синтетик маълумот" } as const)[voiceLanguage] : "";
        const caveat = ({ ru: "Ориентир, не норматив.", en: "For reference only; not a standard.", hi: "यह केवल संदर्भ है, मानक नहीं।", tg: "Ин танҳо маълумоти роҳнамо аст, меъёр нест.", uz: "Bu faqat mo‘ljal, me’yor emas." } as const)[voiceLanguage];
        const partMissing = ({ ru: "деталь не указана", en: "no part listed", hi: "पुर्ज़े का उल्लेख नहीं है", tg: "қисм нишон дода нашудааст", uz: "qism ko‘rsatilmagan" } as const)[voiceLanguage];
        const delayRecord = ({
          ru: `${best.vehicleId} · план ${best.plannedHours} ч, факт ${best.actualHours} ч, ожидание ${best.waitingHours} ч. Причина по записи: ${best.cause}`,
          en: `${best.vehicleId} · planned ${best.plannedHours} h, actual ${best.actualHours} h, waiting ${best.waitingHours} h. Workshop note (RU): ${best.cause}`,
          hi: `${best.vehicleId} · योजना ${best.plannedHours} घंटे, वास्तविक ${best.actualHours}, प्रतीक्षा ${best.waitingHours}। मूल टिप्पणी (रूसी): ${best.cause}`,
          tg: `${best.vehicleId} · нақша ${best.plannedHours} соат, воқеӣ ${best.actualHours}, интизорӣ ${best.waitingHours}. Сабти аслӣ (русӣ): ${best.cause}`,
          uz: `${best.vehicleId} · reja ${best.plannedHours} soat, amalda ${best.actualHours}, kutish ${best.waitingHours}. Asl qayd (ruscha): ${best.cause}`,
        } as const)[voiceLanguage];
        const historyAnswer = routedTool === "history" || !isRepairHistoryQuestion(query, voiceLanguage)
          ? `${delayRecord} ${sample} ${caveat}`
          : isHours
          ? ({ ru: `В похожей записи указано ${best.actualHours} фактических ч. ${sample} ${caveat}`, en: `A comparable record lists ${best.actualHours} actual hours. ${sample} ${caveat}`, hi: `मिलते-जुलते रिकॉर्ड में ${best.actualHours} वास्तविक घंटे दर्ज हैं। ${sample} ${caveat}`, tg: `Дар сабти монанд ${best.actualHours} соати воқеӣ нишон дода шудааст. ${sample} ${caveat}`, uz: `O‘xshash yozuvda ${best.actualHours} amaldagi soat qayd etilgan. ${sample} ${caveat}` } as const)[voiceLanguage]
          : ({ ru: `В похожей записи указана деталь: ${best.part || partMissing}. ${sample} Применимость проверяет механик.`, en: `A comparable record lists: ${best.part || partMissing}. ${sample} A mechanic must confirm applicability.`, hi: `मिलते-जुलते रिकॉर्ड में पुर्जा: ${best.part || partMissing}। ${sample} लागू होने की पुष्टि मैकेनिक करे।`, tg: `Дар сабти монанд қисм: ${best.part || partMissing}. ${sample} Механик бояд мувофиқатро санҷад.`, uz: `O‘xshash yozuvda detal: ${best.part || partMissing}. ${sample} Mosligini mexanik tekshirishi kerak.` } as const)[voiceLanguage];
        rememberExchange(query, historyAnswer);
        speakVoiceReply(historyAnswer);
    } catch (cause) { if (!isCurrent()) return; restoreQuestion(); voiceReplyPending.current = false; setError(cause instanceof Error ? cause.message : "Историю ремонтов загрузить не удалось."); }
      return;
    }
    setQuestionBusy(true); setError(""); setAnswers(null); setAnswerUnavailable(false);
    try {
      const previousQuestion = [...chatTurns].reverse().find((turn) => turn.role === "mechanic" && turn.sessionId === sessionId)?.text;
      const result = await api<{ exchangeId?: string; answer?: string; answerUnavailable?: boolean; results: { text: string; manual: { title: string }; pdfPage: number; url: string }[] }>("/api/manuals/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engineModel: currentVehicle.engine_model, query, answer: true, saveConversation: true, language: voiceLanguage, ...(previousQuestion ? { previousQuestion } : {}), vehicleId, vehicleModel: currentVehicle.model, sessionId, fault: diagnosis?.guidance.status === "anomaly" ? String(rawDiagnosis.anomaly_title || "") : "" }) });
      if (!isCurrent()) return;
      const evidence: ManualEvidenceItem[] = result.results.map((item) => ({ text: item.text, manual: item.manual.title, pdfPage: item.pdfPage, url: item.url }));
      setAnswers(evidence);
      setAnswerUnavailable(Boolean(result.answerUnavailable));
      const reply = result.answer || evidence[0]?.text || (result.answerUnavailable ? "Не удалось подготовить ответ по источникам." : "Данных в руководствах недостаточно для ответа.");
      rememberExchange(query, reply, evidence, result.exchangeId);
      if (result.answer || evidence.length) speakVoiceReply(reply);
      else voiceReplyPending.current = false;
    } catch (cause) { if (!isCurrent()) return; restoreQuestion(); voiceReplyPending.current = false; setError(cause instanceof Error ? cause.message : "Поиск по руководствам не выполнен"); }
    } catch (cause) {
      if (!isCurrent()) return;
      restoreQuestion();
      voiceReplyPending.current = false;
      setError(cause instanceof Error ? cause.message : "Не удалось обработать вопрос.");
    } finally {
      if (questionRequestActive.current === run) {
        questionRequestActive.current = null;
        if (activeContext.current === contextKey) { setQuestionBusy(false); setPendingQuestion(""); }
      }
    }
  }
  async function askManual(e: React.FormEvent) { e.preventDefault(); await askManualText(question); }
  async function prepareTicket(purpose: "repair" | "defectoscopy" = "repair", diagnosisOverride?: NeuroDiagnosis) {
    setVoiceTicketPending(null);
    const ticketDiagnosis = diagnosisOverride || diagnosis;
    if (!ticketDiagnosis || !currentVehicle || !currentSession) return;
    if (purpose === "repair" ? !ticketDiagnosis.guidance.canCreateTicket : !ticketDiagnosis.guidance.canCreateDefectoscopyTicket) { setError("Для выбранного типа заявки требуется подтверждённое основание из руководства."); return; }
    const run = ++diagnosisRun.current;
    const isCurrent = () => run === diagnosisRun.current && activeContext.current === contextKey;
    setBusy(true); setError("");
    try {
      const operations = ticketDiagnosis.guidance.recommendations.filter(item => purpose === "repair" ? item.operationKind === "repair" : item.operationKind === "inspection").map((item) => item.text);
      const result = await api<{ previewToken: string; preview: NonNullable<typeof ticketPreview>["preview"] }>("/api/neuro/tickets/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId, sessionId, urgency: draftUrgency, operations, purpose, ...(purpose === "repair" && historicalPart ? { historicalPart } : {}) }) });
      if (isCurrent()) setTicketPreview(result);
    } catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : "Не удалось подготовить просмотр заявки ТОиР"); }
    finally { if (isCurrent()) setBusy(false); }
  }
  async function confirmTicket() {
    if (!ticketPreview || ticketPreview.preview.vehicleId !== vehicleId || ticketPreview.preview.sessionId !== sessionId || ticketId) return;
    const run = ++diagnosisRun.current;
    const isCurrent = () => run === diagnosisRun.current && activeContext.current === contextKey;
    setBusy(true); setError("");
    try {
      const result = await api<{ ticket_id: string; status: string }>("/api/neuro/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewToken: ticketPreview.previewToken, confirmed: true }) });
      setHistoryRevision(value => value + 1);
      if (isCurrent()) { setTicketId(result.ticket_id); setTicketPreview(null); }
    } catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : "Не удалось создать заявку ТОиР"); }
    finally { if (isCurrent()) setBusy(false); }
  }
  async function acknowledgeWarning() {
    if (!diagnosis || diagnosis.guidance.status !== "warning_confirmation_required") return;
    const run = ++diagnosisRun.current;
    const isCurrent = () => run === diagnosisRun.current && activeContext.current === contextKey;
    setBusy(true); setError("");
    try {
      const result = await api<NeuroDiagnosis>("/api/neuro/diagnosis/acknowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId, sessionId, resultHash: diagnosis.resultHash, confirmed: true }) });
      if (!isCurrent()) return;
      setDiagnosis(result); setDraftUrgency(result.guidance.urgency || "medium"); setTicketPreview(null);
    } catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : "Подтверждение качества не сохранено"); }
    finally { if (isCurrent()) setBusy(false); }
  }
  async function saveTimingMarks(outcome: "matched" | "mismatched") {
    if (!diagnosis || diagnosis.guidance.status !== "anomaly" || !currentVehicle || !currentSession) return;
    const run = ++diagnosisRun.current;
    const isCurrent = () => run === diagnosisRun.current && activeContext.current === contextKey;
    setBusy(true); setError("");
    try {
      const result = await api<NeuroDiagnosis>("/api/neuro/diagnosis/timing-marks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId, sessionId, resultHash: diagnosis.resultHash, outcome }) });
      if (!isCurrent()) return;
      setDiagnosis(result); setDraftUrgency(result.guidance.urgency || "medium"); setTicketPreview(null);
      setHistoryRevision(value => value + 1);
      if (outcome === "mismatched" && result.guidance.canCreateTicket) await prepareTicket("repair", result);
    } catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : "Результат сравнения меток не сохранён"); }
    finally { if (isCurrent()) setBusy(false); }
  }
  const rawDiagnosis = diagnosis?.diagnosis || {};
  const abstained = diagnosis?.guidance.status === "check_failed" || diagnosis?.guidance.status === "uncertain" || diagnosis?.guidance.status === "stop" || diagnosis?.guidance.status === "model_conflict" || diagnosis?.guidance.status === "warning_confirmation_required";
  const displayDiagnosis = diagnosis?.guidance.status === "check_failed" ? "Измерение не прошло проверку" : diagnosis?.guidance.status === "stop" ? "Стоп: качество замера непригодно" : diagnosis?.guidance.status === "model_conflict" ? "Ошибка соответствия модели и кода" : diagnosis?.guidance.status === "warning_confirmation_required" ? "Качество замера требует подтверждения" : diagnosis?.guidance.status === "uncertain" ? "Недостаточно данных для диагноза" : diagnosis?.guidance.status === "normal" ? "Значимых отклонений не обнаружено" : String(rawDiagnosis.anomaly_title || rawDiagnosis.diagnosis || rawDiagnosis.label || rawDiagnosis.anomaly_type || rawDiagnosis.status || "Результат получен");
  const confidence = diagnosis?.guidance.confidence?.percent !== null && diagnosis?.guidance.confidence?.percent !== undefined ? `${diagnosis.guidance.confidence.percent}%` : typeof rawDiagnosis.confidence === "number" ? `${Math.round(rawDiagnosis.confidence <= 1 ? rawDiagnosis.confidence * 100 : rawDiagnosis.confidence)}%` : ui("не определена");
  const riskValue = diagnosis?.guidance.risk || rawDiagnosis.risk || rawDiagnosis.risk_level;
  const riskText = ui(({ low: "Низкий риск · к следующему осмотру", medium: "Средний риск · к ближайшему плановому ТО", high: "Высокий риск · до следующего рейса" } as Record<string, string>)[String(riskValue)] || (riskValue ? String(riskValue) : "Риск не определён"));
  const statusIcon = diagnosis?.guidance.status === "normal" ? "✓" : diagnosis?.guidance.status === "anomaly" ? "⚠" : diagnosis?.guidance.status === "warning_confirmation_required" ? "!" : "⛔";
  const diagnosisDetails = ([
    ...(!abstained ? [["Код", rawDiagnosis.anomaly_type || rawDiagnosis.code] as [string, unknown]] : []),
    ["Оценка аномалии", !abstained && typeof rawDiagnosis.anomaly_score === "number" ? `${Math.round(rawDiagnosis.anomaly_score * 100)}%` : undefined],
    ["Уверенность", confidence],
    ["Порог уверенности", diagnosis?.guidance.confidence?.thresholdPercent !== undefined ? `${diagnosis.guidance.confidence.thresholdPercent}%` : undefined],
    ["Качество замера", diagnosis?.guidance.quality?.label || neuroQualityLabel(rawDiagnosis.signal_quality || rawDiagnosis.quality || rawDiagnosis.measurement_quality || rawDiagnosis.quality_score)],
    ["Риск", riskText],
  ] as [string, unknown][]).filter(([, value]) => value !== undefined && value !== null && value !== "");
  const nextActionLabels: Record<string, Record<typeof voiceLanguage, string>> = {
    repeat_measurement: { ru: "Повторите акустический замер и откройте новую запись.", en: "Repeat the acoustic measurement and open the new recording.", hi: "ध्वनि मापन दोहराएँ और नई रिकॉर्डिंग खोलें।", tg: "Садои муҳаррикро аз нав сабт кунед ва сабти навро кушоед.", uz: "Dvigatel tovushini qayta yozing va yangi yozuvni oching." },
    acknowledge_warning_or_repeat: { ru: "Сверьте качество записи. Подтвердите продолжение или повторите замер.", en: "Review the recording quality. Confirm to continue or repeat the measurement.", hi: "रिकॉर्डिंग की गुणवत्ता जाँचें। जारी रखने की पुष्टि करें या मापन दोहराएँ।", tg: "Сифати сабтро санҷед. Идомаро тасдиқ кунед ё ченкуниро такрор кунед.", uz: "Yozuv sifatini tekshiring. Davom etishni tasdiqlang yoki qayta o‘lchang." },
    repeat_or_defectoscopy: { ru: "Сверьте модель двигателя и повторите замер. При необходимости назначьте дефектовку.", en: "Verify the engine model and repeat the measurement. Arrange an inspection if needed.", hi: "इंजन मॉडल जाँचें और मापन दोहराएँ। ज़रूरत पर दोष निरीक्षण कराएँ।", tg: "Модели муҳаррикро санҷед ва ченкуниро такрор кунед. Дар ҳолати зарурӣ санҷиши нуқсонҳоро таъин кунед.", uz: "Dvigatel modelini tekshiring va qayta o‘lchang. Zarur bo‘lsa, nosozlikni tekshirtiring." },
    routine_checks: { ru: "Продолжайте плановые проверки машины.", en: "Continue the scheduled vehicle checks.", hi: "वाहन की निर्धारित जाँच जारी रखें।", tg: "Санҷишҳои нақшавии мошинро идома диҳед.", uz: "Avtomobilning rejali tekshiruvlarini davom ettiring." },
    inspection: { ru: "Назначьте дефектовку. Для этого случая пока нет подтверждённой процедуры.", en: "Arrange an inspection. No procedure has been verified for this case.", hi: "दोष निरीक्षण कराएँ। इस मामले की प्रक्रिया की पुष्टि नहीं हुई है।", tg: "Санҷиши нуқсонҳоро таъин кунед. Барои ин ҳолат тартиби тасдиқшуда дастрас нест.", uz: "Nosozlikni tekshirtiring. Bu holat uchun tasdiqlangan tartib topilmadi." },
    first_step: { ru: "Откройте первый шаг плана и сверьте его со страницей руководства.", en: "Open the first step and check it against the manual page.", hi: "पहला चरण खोलें और निर्देश पुस्तिका के पृष्ठ से मिलान करें।", tg: "Қадами аввалро кушоед ва онро бо саҳифаи дастур муқоиса кунед.", uz: "Birinchi qadamni oching va qo‘llanma sahifasi bilan solishtiring." },
    diagnose: { ru: "Получите результат текущего замера командой «Проведи диагностику».", en: "Ask for a diagnosis of the current measurement.", hi: "वर्तमान मापन के निदान का अनुरोध करें।", tg: "Натиҷаи ташхиси ченкунии ҷориро дархост кунед.", uz: "Joriy o‘lchovning diagnostika natijasini so‘rang." },
  };
  const guidance = diagnosis?.guidance;
  const anomalyAction = guidance?.recommendations.length ? "first_step" : "inspection";
  const actionKey = guidance ? guidance.nextAction || (guidance.status === "anomaly" ? anomalyAction : "") : "diagnose";
  const nextActionText = nextActionLabels[actionKey]?.[voiceLanguage] || diagnosis?.guidance.message;

  const quickNavigation = (
    <nav className="neuro-quick-nav" aria-label={ui("Быстрая навигация")}>
      {!!guidance?.recommendations.length && <button type="button" onPointerDown={capturePlanReturnOrigin} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") capturePlanReturnOrigin(); }} onClick={() => {
        if (planReturnScrollY.current === null) capturePlanReturnOrigin();
        setPlanMode(true);
      }}><ClipboardCheck size={16} aria-hidden="true" />{ui("К плану работ")}</button>}
      <button type="button" onClick={() => openAssistant("question")}><MessageSquareText size={16} aria-hidden="true" />{ui("Задать вопрос")}</button>
    </nav>
  );
  const workflowRecommendations = (diagnosis?.guidance.recommendations.flatMap((item): ManualEvidenceItem[] => item.procedure?.length ? item.procedure : [item]) || []).map(item => {
    const translated = voiceLanguage !== "ru" && !!item.translations?.[voiceLanguage];
    return { ...item, sourceText: item.text, language: translated ? voiceLanguage : "ru" as const, originalLanguage: voiceLanguage !== "ru" && !translated, text: mechanicInstruction(voiceLanguage, currentVehicle?.engine_model || "", String(rawDiagnosis.anomaly_type || ""), item) };
  });
  const openRecommendationStep = (recommendationIndex: number) => {
    const items = diagnosis?.guidance.recommendations || [];
    const index = items.slice(0, recommendationIndex).reduce((total, item) => total + (item.procedure?.length || 1), 0);
    setPlanStep(Math.min(index, Math.max(0, workflowRecommendations.length - 1)));
    capturePlanReturnOrigin();
    setPlanMode(true);
  };
  const returnToDiagnosis = () => {
    restorePlanScroll.current = planReturnScrollY.current !== null;
    setPlanMode(false);
  };
  useEffect(() => {
    if (planMode || !restorePlanScroll.current) return;
    restorePlanScroll.current = false;
    const scrollY = planReturnScrollY.current;
    planReturnScrollY.current = null;
    if (scrollY !== null) window.setTimeout(() => {
      if (scrollY > 0) window.scrollTo(0, scrollY);
      else document.querySelector(".neuro-dvs")?.scrollIntoView({ block: "start" });
    }, 0);
  }, [planMode]);
  useEffect(() => {
    if (!diagnosis || diagnosisReturnScrollY.current === null) return;
    const scrollY = diagnosisReturnScrollY.current;
    diagnosisReturnScrollY.current = null;
    window.setTimeout(() => {
      if (scrollY > 0) window.scrollTo(0, scrollY);
      else document.querySelector(".neuro-dvs")?.scrollIntoView({ block: "start" });
    }, 0);
  }, [diagnosis]);
  const defectoscopyPreview = ticketPreview?.preview.purpose === "defectoscopy" && <section className="neuro-ticket-preview" aria-label={ui("Просмотр заявки на дефектовку")}><h3>{ui("Заявка на дефектовку · проверьте перед передачей в ТОиР")}</h3><p>{ticketPreview.preview.vehicleId} · {ticketPreview.preview.sessionId} · {ticketPreview.preview.engineModel}</p><p>{ticketPreview.preview.conclusion}</p><h4>{ui("Проверки и основания из руководства")}</h4><ul>{ticketPreview.preview.operations.map((item, index) => <li key={index}>{item.text} — {item.manual}, стр. {item.pdfPage}</li>)}</ul><p>{ui("Запчасти: не указаны. Ремонтные операции не включены.")}</p><PButton type="button" variant="primary" disabled={busy || !!ticketId || ticketPreview.preview.vehicleId !== vehicleId || ticketPreview.preview.sessionId !== sessionId} onClick={() => void confirmTicket()}>{ui("Подтвердить и передать в ТОиР")}</PButton> <PButton type="button" variant="secondary" disabled={busy} onClick={() => setTicketPreview(null)}>{ui("Отменить просмотр")}</PButton></section>;
  const repairTicketPreview = ticketPreview && ticketPreview.preview.purpose !== "defectoscopy" && <section className="neuro-ticket-preview" style={{ flex: "1 1 100%", width: "100%", minWidth: 0, boxSizing: "border-box" }} aria-label={ui("Проверка заявки перед отправкой")} tabIndex={assistantHost ? -1 : undefined}><h3>{ui("Проверьте заявку перед передачей в ТОиР")}</h3><dl><div><dt>{ui("Машина / сессия")}</dt><dd>{ticketPreview.preview.vehicleId} · {ticketPreview.preview.sessionId}</dd></div><div><dt>{ui("Двигатель / код")}</dt><dd>{ticketPreview.preview.engineModel} · {ticketPreview.preview.faultCode}</dd></div><div><dt>{ui("Уверенность / качество")}</dt><dd>{ticketPreview.preview.confidence.percent === null ? ui("не определена") : `${ticketPreview.preview.confidence.percent}%`} (порог {ticketPreview.preview.confidence.thresholdPercent}%) · {ui(ticketPreview.preview.signalQuality.label)}</dd></div><div><dt>{ui("Приоритет")}</dt><dd>{ticketPreview.preview.urgencyMeaning}</dd></div><div><dt>{ui("Заключение")}</dt><dd>{ticketPreview.preview.conclusion}</dd></div><div><dt>{ui("Операции и основания")}</dt><dd><ul>{ticketPreview.preview.operations.map((item, index) => <li key={index}>{item.text} — {item.manual}, стр. {item.pdfPage}</li>)}</ul></dd></div>{ticketPreview.preview.historicalNote && <div><dt>{ui("Историческая подсказка")}</dt><dd>{ticketPreview.preview.historicalNote}</dd></div>}<div><dt>{ui("Запчасти")}</dt><dd>{ticketPreview.preview.spareParts.length ? ticketPreview.preview.spareParts.join(", ") : ui("Не указаны")}</dd></div></dl><p>{ui("Подтверждение отправит ровно этот просмотр. Голосовые команды не меняют приоритет и не подтверждают передачу.")}</p><PButton type="button" variant="primary" disabled={busy || !!ticketId || ticketPreview.preview.vehicleId !== vehicleId || ticketPreview.preview.sessionId !== sessionId} onClick={() => void confirmTicket()}>{ui("Подтвердить и передать в ТОиР")}</PButton> <PButton type="button" variant="secondary" disabled={busy} onClick={() => setTicketPreview(null)}>{ui("Отменить просмотр")}</PButton></section>;
  useEffect(() => {
    if (!assistantHost || !repairTicketPreview) return;
    const preview = assistantHost.querySelector<HTMLElement>('[aria-label="Проверка заявки перед отправкой"]');
    preview?.scrollIntoView({ block: "nearest" });
    preview?.focus({ preventScroll: true });
  }, [assistantHost, ticketPreview]);
  return <>
    <section className="panel full-panel neuro-dvs"><h2><Activity size={21}/> {ui("Акустическая диагностика двигателя")}</h2>
      {error && <p className="auth-error" role="alert">{interfaceText(error)}</p>}
      {diagnosis && planMode && <div className="neuro-result neuro-plan-view" aria-label={ui("План работ по руководству")}>
        <button className="neuro-plan-return" type="button" onClick={returnToDiagnosis}><ArrowLeft size={17} />{ui("Вернуться к результату диагностики")}</button>
        <NeuroWorkflow key={contextKey} vehicle={currentVehicle?.vehicle_id || ""} engine={currentVehicle?.engine_model || ""} session={sessionId} checkedAt={currentSession?.checked_at || ""} confidence={confidence} status={displayDiagnosis} fault={String(rawDiagnosis.anomaly_title || rawDiagnosis.anomaly_type || "")} recommendations={workflowRecommendations} listening={planListening} onVoice={() => openAssistant("voice")} onRead={typeof window.speechSynthesis !== "undefined" ? () => { const current = workflowRecommendations[planStep]; if (current) { voiceReplyPending.current = true; speakVoiceReply(current.text, current.language); } } : undefined} pageRequest={pageRequest.step === planStep ? pageRequest.sequence : 0} voiceNote={stepNote} step={planStep} completed={performedSteps} onComplete={() => setPerformedSteps((items) => items.includes(planStep) ? items : [...items, planStep])} onStep={(step) => { setStepNote(""); setPlanStep(step); }} appPath={appPath} planOnly />
        {!assistantHost && repairTicketPreview}
      </div>}
      {diagnosis && !planMode && <div className={`neuro-result neuro-result--${diagnosis.guidance.status}`} aria-live="polite"><div><div className="eyebrow">{ui("РЕЗУЛЬТАТ ДИАГНОСТИКИ")}{currentSession ? ` · ${new Date(currentSession.checked_at).toLocaleString(voiceLanguage === "tg" ? "tg-TJ" : voiceLanguage === "uz" ? "uz-UZ" : voiceLanguage === "hi" ? "hi-IN" : voiceLanguage === "en" ? "en-US" : "ru-RU")}` : ""}</div><h2 className="diagnostic-verdict"><span aria-hidden="true">{statusIcon}</span> {ui(displayDiagnosis)}</h2>{nextActionText && <p className="diagnosis-next"><strong>{ui("Следующее действие")}</strong> {ui(nextActionText)}</p>}{abstained && <p>{ui(diagnosis.guidance.status === "check_failed" ? "Данные замера не прошли проверку. Выберите другую запись; диагноз и заявка по этой сессии не формируются." : diagnosis.guidance.status === "warning_confirmation_required" ? "Заявка недоступна до явного подтверждения качества или повторного замера." : diagnosis.guidance.status === "model_conflict" ? "Не применяйте этот код к выбранной машине. Проверьте модель и запись; далее нужна дефектовка." : "Результат не даёт оснований для диагноза. Требуется проверка механика.")}</p>}{quickNavigation}{diagnosis.guidance.timingMarks && <section className="timing-marks-card" aria-labelledby="timing-marks-title"><h3 id="timing-marks-title">{ui("Проверка момента начала подачи топлива")}</h3><p>{ui("Сверьте метки по пункту 5.12.1 руководства и сохраните результат. Для этой проверки достаточно отметить, совпали ли метки.")}</p>{diagnosis.guidance.timingMarks?.outcome === "matched" ? <p className="timing-marks-result" role="status"><strong>{ui("Метки совпали.")}</strong> {ui("Аномалия остаётся. Проверьте другие возможные причины по руководству.")}</p> : diagnosis.guidance.timingMarks?.outcome === "mismatched" ? <p className="timing-marks-result" role="status"><strong>{ui("Метки не совпали.")}</strong> {ui("Результат сохранён. Подготовлен отдельный предварительный просмотр подтверждённой регулировки.")}</p> : null}<div className="timing-marks-actions"><PButton type="button" variant="secondary" disabled={busy} onClick={() => void saveTimingMarks("matched")}>{ui("Метки совпадают")}</PButton><PButton type="button" variant="primary" disabled={busy} onClick={() => void saveTimingMarks("mismatched")}>{ui("Метки не совпадают")}</PButton></div></section>}<details className="diagnosis-background"><summary><CircleHelp size={17} aria-hidden="true" />{ui("Обоснование результата")}</summary><p>{ui(diagnosis.guidance.message)}</p>{diagnosis.guidance.confidence?.percent !== null && diagnosis.guidance.confidence?.percent !== undefined && diagnosis.guidance.confidence.thresholdPercent !== undefined && <p>{ui(`Уверенность {confidence} по шкале 0–100%; порог {threshold}%`).replace("{confidence}", confidence).replace("{threshold}", String(diagnosis.guidance.confidence.thresholdPercent))}</p>}{!abstained && typeof rawDiagnosis.description === "string" && <p>{rawDiagnosis.description}</p>}</details>{diagnosisDetails.length > 0 && <dl className="neuro-facts">{diagnosisDetails.map(([label, value]) => <div key={label} className={label === "Качество замера" ? `neuro-quality neuro-quality--${diagnosis.guidance.quality?.value === "good" ? "good" : diagnosis.guidance.quality?.value === "warning" ? "warning" : diagnosis.guidance.quality?.value === "bad" ? "bad" : "unknown"}` : ""}><dt>{ui(label)}</dt><dd style={label === "Риск" ? { color: riskValue === "high" ? "var(--verdict-stop, #a42b27)" : riskValue === "medium" ? "var(--verdict-warning, #805300)" : riskValue === "low" ? "var(--verdict-normal, #15633f)" : undefined, fontWeight: 700 } : undefined}>{ui(String(value))}</dd></div>)}</dl>}{diagnosis.guidance.status === "warning_confirmation_required" && <PButton type="button" variant="primary" disabled={busy} onClick={() => void acknowledgeWarning()}>{ui("Подтверждаю проверку результата")}</PButton>}</div><PTag variant={diagnosis.guidance.status === "normal" ? "success" : diagnosis.guidance.status === "anomaly" ? "warning" : "secondary"}>{ui(diagnosis.guidance.status === "check_failed" ? "Замер не подтверждён" : diagnosis.guidance.status === "uncertain" ? "Недостаточно данных" : diagnosis.guidance.status === "warning_confirmation_required" ? "Нужно подтверждение" : diagnosis.guidance.status === "normal" ? "Отклонений нет" : diagnosis.guidance.status === "model_conflict" ? "Ошибка модели" : diagnosis.guidance.status === "stop" ? "СТОП" : "Требуется внимание")}</PTag></div>}
      {!planMode && <>
      {!diagnosis && quickNavigation}
      <div className="neuro-controls">
        <label>{ui("Сессия измерения")}<select ref={sessionSelect} disabled={busy || questionBusy} value={sessionId} onChange={(e) => { setVoiceTicketPending(null); setSessionId(e.target.value); clearContext(); }}><option value="">{ui("Выберите сессию")}</option>{currentVehicle?.sessions.map((item) => <option key={item.session_id} value={item.session_id}>{new Date(item.checked_at).toLocaleString(voiceLanguage === "tg" ? "tg-TJ" : voiceLanguage === "uz" ? "uz-UZ" : voiceLanguage === "hi" ? "hi-IN" : voiceLanguage === "en" ? "en-US" : "ru-RU")} · {interfaceText(neuroSessionStatus(item.status))}</option>)}</select></label>
        <PButton type="button" variant="primary" disabled={!vehicleId || !sessionId || busy} onPointerDown={() => { if (diagnosis) diagnosisReturnScrollY.current = window.scrollY; }} onClick={() => diagnosis?.guidance.status === "check_failed" ? sessionSelect.current?.focus() : void diagnose()}>{ui(busy ? "Проверяем…" : diagnosis?.guidance.status === "check_failed" ? "Выбрать другую запись" : diagnosis ? "Получить результат повторно" : "Провести диагностику")}</PButton>
      </div>
      <NeuroFleetOverview selectedVehicleId={vehicleId} sessions={currentVehicle?.sessions || []} history={vehicleHistory} historyError={vehicleHistoryError} onOpen={(nextVehicleId, nextSessionId, focusHistory) => { const nextVehicle = fleet.find((item) => item.vehicle_id === nextVehicleId); if (!nextVehicle?.sessions.some((item) => item.session_id === nextSessionId)) return; if (nextVehicleId !== vehicleId || nextSessionId !== sessionId) { clearContext(); setVehicleId(nextVehicleId); setSessionId(nextSessionId); } window.requestAnimationFrame(() => document.querySelector(focusHistory ? "#neuro-vehicle-history" : ".neuro-dvs")?.scrollIntoView({ behavior: "smooth", block: "start" })); }} />
      {repairRisk && <aside className="repair-insight" aria-label={ui("Опыт парка по этому диагнозу")}>
        <strong><Clock3 size={18}/> {ui("Что учесть перед ремонтом")}</strong>
        <p>{repairRisk.model} · {repairRisk.vehicleId} · {repairRisk.engineModel}. {repairRisk.cause}</p>
        <dl className="work-hours">{[["План", repairRisk.plannedHours], ["Факт", repairRisk.actualHours], ["Ожидание", repairRisk.waitingHours]].map(([label, hours]) => <div key={label}><dt>{ui(String(label))}</dt><dd>{hours} ч</dd></div>)}</dl>
        <a href="#repair-experience" onClick={event => { event.preventDefault(); document.getElementById("repair-experience")?.focus(); }}>{ui("Посмотреть историю и детали")}</a>
        {repairRisk.synthetic && <small>{ui("Демонстрационная запись автопарка")}</small>}
      </aside>}
      {diagnosis?.guidance.ticketBlockReason === "inspection_only" && <p role="status">{ui("Выполните проверку на месте и запишите результат осмотра в карточке машины.")}</p>}
      {diagnosis?.guidance.canCreateDefectoscopyTicket && <div className="neuro-ticket"><PButton type="button" variant="secondary" disabled={busy || !!ticketPreview || !!ticketId} onClick={() => void prepareTicket("defectoscopy")}>{ui(ticketId ? "Заявка создана" : "Заявка на дефектовку")}</PButton><span>{ui("Только проверка из руководства; без ремонта и запчастей.")}</span></div>}
      {diagnosis?.guidance.recommendations.length ? <div className="neuro-section"><h3>{ui("Рекомендации")}</h3><ul>{diagnosis.guidance.recommendations.map((item, i) => <li key={`${item.manual}-${item.pdfPage}-${i}`}>{normalizeManualText(item.text)}{item.excerpt && item.excerpt !== item.text ? <details><summary>Основание в руководстве</summary><p className="neuro-excerpt">{normalizeManualText(item.excerpt)}</p></details> : null} <a href={appPath(item.url)} target="_blank" rel="noreferrer">{item.manual}, стр. {item.pdfPage}</a> <button type="button" onClick={() => openRecommendationStep(i)}>{ui("Открыть этот шаг в плане работ")}</button></li>)}</ul></div> : null}
      {diagnosis?.guidance.status === "anomaly" && !diagnosis.guidance.canCreateTicket && diagnosis.guidance.ticketBlockReason === "manual_evidence_required" && <aside className="neuro-defectoscopy" role="status"><strong>Нужна дефектовка</strong><p>{diagnosis.guidance.message} Для заявки ТОиР пока нет подтверждённой операции со ссылкой на руководство. Запишите условия замера и результаты осмотра в карточке машины.</p></aside>}
      {diagnosis?.guidance.canCreateTicket && ticketPreview?.preview.purpose !== "defectoscopy" && <div className="neuro-ticket" style={{ flexWrap: "wrap" }}><label>{ui("Приоритет заявки")}<select value={draftUrgency} disabled={busy || !!ticketPreview || !!ticketId} onChange={(e) => setDraftUrgency(e.target.value as "low" | "medium" | "high")}><option value="high">{ui("Высокий · до следующего рейса")}</option><option value="medium">{ui("Средний · к ближайшему плановому ТО")}</option><option value="low">{ui("Низкий · к следующему осмотру")}</option></select></label><PButton type="button" variant="primary" disabled={busy || !!ticketPreview || !!ticketId} onClick={() => void prepareTicket()}>{ui(ticketId ? "Заявка создана" : "Подготовить просмотр заявки")}</PButton>{historicalPart && <p>{ui("Кандидат детали из истории:")} <strong>{historicalPart}</strong>. {ui("Требует проверки применимости.")}</p>}{!assistantHost && repairTicketPreview}{ticketId && <p role="status">{ui("Номер заявки:")} <strong>{ticketId}</strong></p>}</div>}
      </>}
      {defectoscopyPreview && (assistantHost ? createPortal(defectoscopyPreview, assistantHost) : defectoscopyPreview)}
    </section>
    {assistantHost && createPortal(<section className="panel full-panel neuro-qa">
      <div className="neuro-qa-thread">
      {assistantMode === "voice" && workflowRecommendations[planStep] && <p aria-live="polite"><strong>{ui("План работ")} · {planStep + 1}/{workflowRecommendations.length}</strong><br />{workflowRecommendations[planStep].title || workflowRecommendations[planStep].text}</p>}
      {assistantMode === "voice" && <MechanicVoice key={contextKey} listening={planListening} onListeningChange={setPlanListening} disabled={!currentVehicle} language={voiceLanguage} onCommand={(phrase) => {
        if (busy || questionBusy) { setVoiceFeedback("Обрабатываю предыдущую команду."); return; }
        setVoiceFeedback(""); setError("");
        voiceReplyPending.current = false;
        const normalized = phrase.trim().toLocaleLowerCase("ru").replace(/[.!?]+$/u, "");
        if (voiceTicketPending) {
          if (voiceConfirmation(normalized, voiceLanguage)) {
            const current = matchesVoiceTicket(voiceTicketPending, vehicleId, sessionId, diagnosis);
            setVoiceTicketPending(null);
            if (current) void prepareTicket(voiceTicketPurpose);
            else setError("Контекст изменился. Повторите диагностику перед созданием заявки.");
            return;
          }
          if (voiceCancellation(normalized, voiceLanguage)) { setVoiceTicketPending(null); return; }
          setVoiceTicketPending(null);
        }
        if (/^(отправить|отправь|send)$/iu.test(normalized)) {
          if (question.trim() && question.trim() !== lastSentQuestion.current) {
            voiceReplyPending.current = true; void askManualText(question);
          } else { setVoiceFeedback(lastSentQuestion.current ? "Вопрос уже отправлен. Можно задать следующий." : "Произнесите вопрос целиком, и я сразу отвечу."); }
          return;
        }
        const planCommand = mechanicPlanIntent(normalized, voiceLanguage);
        const recommendations = workflowRecommendations;
        if (planCommand) {
          if (!recommendations.length) {
            voiceReplyPending.current = true;
            speakVoiceReply(nextActionLabels[actionKey]?.[voiceLanguage] || nextActionText || nextActionLabels.diagnose[voiceLanguage]);
            return;
          }
          setStepNote("");
          if (planCommand === "torque" || planCommand === "clearance") {
            const current = recommendations[planStep];
            const related = recommendations.flatMap((item, index) => hasStepValue(planCommand, item.sourceText) ? [`Шаг ${index + 1}: ${item.title || item.text}`] : []);
            const reference = current.language === "ru" && !hasStepValue(planCommand, current.sourceText) && related.length ? " " + related.join(". ") : "";
            const reply = stepHint(planCommand, current.text, current.pdfPage, current.language, hasStepValue(planCommand, current.sourceText)) + reference;
            setStepNote(reply);
            voiceReplyPending.current = true;
            speakVoiceReply(reply, current.language);
          } else if (planCommand === "figure") {
            setPageRequest(prev => ({ step: planStep, sequence: prev.sequence + 1 }));
            voiceReplyPending.current = true;
            const page = recommendations[planStep].pdfPage;
            speakVoiceReply(({ ru: `Страница руководства ${page}.`, en: `Manual page ${page}.`, hi: `निर्देश पुस्तिका का पृष्ठ ${page}।`, tg: `Саҳифаи ${page} дастур.`, uz: `Qo‘llanmaning ${page}-sahifasi.` })[voiceLanguage]);
          } else if (planCommand === "done") {
            setPerformedSteps((items) => items.includes(planStep) ? items : [...items, planStep]);
            voiceReplyPending.current = true;
            speakVoiceReply(({ ru: "Шаг отмечен выполненным.", en: "Step marked complete.", hi: "चरण पूरा हुआ चिह्नित किया गया।", tg: "Қадам иҷрошуда қайд шуд.", uz: "Qadam bajarildi deb belgilandi." } as const)[voiceLanguage]);
          } else if (planCommand === "next" || planCommand === "previous") {
            const next = planCommand === "previous" ? Math.max(planStep - 1, 0) : Math.min(planStep + 1, recommendations.length - 1);
            setPlanStep(next);
            voiceReplyPending.current = true;
            speakVoiceReply(recommendations[next].text, recommendations[next].language);
          } else {
            voiceReplyPending.current = true;
            speakVoiceReply(recommendations[planStep].text, recommendations[planStep].language);
          }
          return;
        }
        if (isRepairHistoryQuestion(phrase, voiceLanguage)) {
          voiceReplyPending.current = true;

          setQuestion(phrase.slice(0, 500)); void askManualText(phrase);
          return;
        }
        if (isTicketCommand(phrase, voiceLanguage)) {
          voiceReplyPending.current = false;
          const purpose = /дефектовк/iu.test(phrase) ? "defectoscopy" : "repair";
          if (purpose === "repair" ? !diagnosis?.guidance.canCreateTicket : !diagnosis?.guidance.canCreateDefectoscopyTicket) { setError("Для выбранного типа заявки нет подтверждённой операции из руководства."); return; }
          setVoiceTicketPurpose(purpose);
          setVoiceTicketPending(bindVoiceTicket(vehicleId, sessionId, diagnosis));
          return;
        }
        if (isDiagnosisCommand(phrase, voiceLanguage)) { voiceReplyPending.current = false; void diagnose(); return; }
        voiceReplyPending.current = true;
        setQuestion(phrase.slice(0, 500));
        void askManualText(phrase);
      }} />}
      {voiceFeedback && !error && !busy && !questionBusy && <p className="voice-result" role="status">{ui(voiceFeedback)}</p>}
      {voiceTicketPending && <div className="context-empty" role="status"><p>{ui("Команда распознана для")} {currentVehicle?.vehicle_id} · {sessionId}. {ui("Просмотр откроется для проверки; голосом отправить заявку нельзя.")}</p><PButton type="button" variant="primary" disabled={busy || !matchesVoiceTicket(voiceTicketPending, vehicleId, sessionId, diagnosis)} onClick={() => { if (matchesVoiceTicket(voiceTicketPending, vehicleId, sessionId, diagnosis)) void prepareTicket(voiceTicketPurpose); else { setVoiceTicketPending(null); setError("Контекст изменился. Повторите диагностику перед созданием заявки."); } }}>{ui(voiceTicketPurpose === "defectoscopy" ? "Открыть просмотр дефектовки" : "Открыть просмотр заявки")}</PButton> <PButton type="button" variant="secondary" onClick={() => setVoiceTicketPending(null)}>{ui("Отмена")}</PButton></div>}
      {repairTicketPreview}
      {error && <p className="auth-error" role="alert">{ui(error)}</p>}
      <NeuroChatHistory turns={conversationAuthorizationKey === `${assistantOpenId}:${contextKey}` ? chatTurns : []} appPath={appPath} pendingQuestion={pendingQuestion} pending={questionBusy} />
      {answerUnavailable && <p className="auth-error" role="status">{ui("Сервис подготовки ответа недоступен. Откройте поиск по руководствам в общем помощнике, чтобы посмотреть страницы самостоятельно.")}</p>}
      {conversationNotice && <p role="status">{ui(conversationNotice)}</p>}
      {conversationAuthorizationKey !== `${assistantOpenId}:${contextKey}` && <p role="status">{ui(conversationNotice || "Загрузка")}</p>}
      {answers && (answers.length ? <div className="neuro-section"><details><summary>{ui("Страницы руководства")} · {answers.length}</summary>{answers.map((item, i) => <article key={`${item.manual}-${item.pdfPage}-${i}`}><p>{normalizeManualText(item.text)}</p><a href={appPath(item.url)} target="_blank" rel="noreferrer">{item.manual}, стр. {item.pdfPage}</a></article>)}</details></div> : !answerUnavailable && <p className="context-empty" role="status">{ui("В руководствах нет прямого основания для решения. Данных недостаточно: требуется оценка механика и дефектовка.")}</p>)}
      </div>
      <form className="neuro-qa-composer" onSubmit={(e) => void askManual(e)}><label>{ui("Вопрос или команда")}<textarea rows={3} maxLength={500} value={question} onChange={(e) => { questionDraftVersion.current++; setQuestion(e.target.value); }} placeholder={ui("Можно ли своим ходом перегнать машину на базу?")} /></label><PButton type="submit" variant="primary" disabled={!currentVehicle || question.length < 3 || questionBusy || busy}>{ui(questionBusy ? "Ищем в руководствах…" : "Отправить")}</PButton></form>
    </section>, assistantHost)}
    {!planMode && <NeuroWorkflow key={contextKey} vehicle={currentVehicle?.vehicle_id || ""} engine={currentVehicle?.engine_model || ""} session={sessionId} checkedAt={currentSession?.checked_at || ""} confidence={typeof rawDiagnosis.confidence === "number" ? `${Math.round(rawDiagnosis.confidence <= 1 ? rawDiagnosis.confidence * 100 : rawDiagnosis.confidence)}%` : "не определена"} status={diagnosis ? displayDiagnosis : currentSession ? interfaceText(neuroSessionStatus(currentSession.status)) : "Ожидает выбора измерения"} fault={String(rawDiagnosis.anomaly_title || rawDiagnosis.anomaly_type || "")} recommendations={workflowRecommendations} listening={planListening} onVoice={() => openAssistant("voice")} onRead={typeof window.speechSynthesis !== "undefined" ? () => { const current = workflowRecommendations[planStep]; if (current) { voiceReplyPending.current = true; speakVoiceReply(current.text, current.language); } } : undefined} pageRequest={pageRequest.step === planStep ? pageRequest.sequence : 0} voiceNote={stepNote} step={planStep} completed={performedSteps} onComplete={() => setPerformedSteps((items) => items.includes(planStep) ? items : [...items, planStep])} onStep={(step) => { setStepNote(""); setPlanStep(step); }} appPath={appPath} />}
    {!planMode && diagnosis && <MechanicLanguage status={diagnosis.guidance.status === "normal" ? "normal" : diagnosis.guidance.status === "anomaly" ? "anomaly" : diagnosis.guidance.status === "check_failed" || diagnosis.guidance.status === "stop" || diagnosis.guidance.status === "model_conflict" ? "check_failed" : "uncertain"} engineModel={currentVehicle?.engine_model || ""} anomalyCode={String(rawDiagnosis.anomaly_type || "")} recommendations={diagnosis.guidance.recommendations.map((item) => ({ ...item, url: appPath(item.url) }))} onOpenStep={openRecommendationStep} />}
    {!planMode && hasRepairHistory && <RepairExperience key={`history:${contextKey}`} engineModel={currentVehicle?.engine_model || ""} data={currentExperience?.data || null} error={currentExperience?.error || ""} selectionLocked={busy || !!ticketId} onSelectPart={(part) => { setVoiceTicketPending(null); setTicketPreview(null); setHistoricalPart(part); }} onComparePart={(part) => setComparison({ context: contextKey, part })} selectedHistoricalPart={historicalPart} />}
    {!planMode && hasRepairHistory && currentVehicle && comparison?.context === contextKey && <PartOffers key={contextKey + comparison.part} vehicleId={vehicleId} vehicleName={currentVehicle.model} partName={comparison.part} quantity={1} onProcure={() => { onProcureHistorical(comparison.part); setComparison(null); }} />}

  </>;
}
const issueStatusLabel = (status?: NonNullable<Vehicle["issueZones"]>[number]["status"]) =>
  status === "confirmed" ? "Подтверждено механиком" : status === "suspected" ? "Подозрение" : "Нет записи";
function IssueZoneMap({
  zones,
  vehicleType,
  selected,
  onSelect,
  onOpenInspection,
  onSave,
  saving,
  saveError,
}: {
  zones: NonNullable<Vehicle["issueZones"]>;
  vehicleType?: VehicleType;
  selected: IssueZoneId | "";
  onSelect: (id: IssueZoneId | "") => void;
  onOpenInspection: () => void;
  onSave: (id: IssueZoneId, status: NonNullable<Vehicle["issueZones"]>[number]["status"], note: string) => void;
  saving: boolean;
  saveError: string;
}) {
  const savedZone = zones.find((item) => item.id === selected);
  const zone = savedZone || (selected ? {
    id: selected,
    label: issueZoneOrder.find((item) => item.id === selected)?.label || "Зона автомобиля",
    status: "no_data" as const,
  } : undefined);
  const [draftStatus, setDraftStatus] = useState<NonNullable<Vehicle["issueZones"]>[number]["status"]>(zone?.status || "no_data");
  const [draftNote, setDraftNote] = useState(zone?.note || "");
  const [formError, setFormError] = useState("");
  useEffect(() => {
    setDraftStatus(zone?.status || "no_data");
    setDraftNote(zone?.note || "");
    setFormError("");
  }, [selected, zone?.status, zone?.note, zone?.updatedAt]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    if (draftStatus !== "no_data" && !draftNote.trim()) {
      setFormError("Добавьте описание наблюдения для этого статуса.");
      return;
    }
    setFormError("");
    onSave(selected, draftStatus, draftNote.trim());
  };
  return (
    <section className="issue-zone-card" aria-labelledby="issue-zone-heading">
      <div className="issue-zone-heading">
        <div>
          <h3 id="issue-zone-heading">Зоны автомобиля</h3>
          <p>Выберите область, чтобы посмотреть записи механика</p>
        </div>
        <span className="issue-zone-front"><ChevronDown size={15} /> Перед автомобиля</span>
      </div>
      <div className="issue-zone-layout">
        <div className={`issue-zone-diagram ${vehicleType === "автобус" ? "bus-variant" : vehicleType === "грузовой автомобиль" ? "truck-variant" : ""}`} role="group" aria-label={`${vehicleType === "автобус" ? "Схема автобуса" : vehicleType === "грузовой автомобиль" ? "Схема грузового автомобиля" : "Схема автомобиля"} сверху. Перед автомобиля сверху, левая сторона водителя слева.`}>
          <svg viewBox="0 0 240 330" aria-hidden="true" focusable="false">
            {vehicleType === "автобус" ? <g className="schematic-bus">
              <rect className="schematic-shadow" x="47" y="10" width="146" height="310" rx="28" />
              <rect className="schematic-body" x="55" y="14" width="130" height="300" rx="24" />
              <path className="schematic-glass" d="M70 30 Q70 22 80 22 H160 Q170 22 170 32 L170 68 H70Z" />
              <path className="schematic-glass" d="M70 260 H170 L164 292 Q162 302 151 302 H89 Q78 302 76 292Z" />
              <path className="schematic-line" d="M70 82 H170 M70 124 H170 M70 166 H170 M70 208 H170 M70 248 H170" />
              <path className="schematic-cabin" d="M78 84 H162 V246 H78Z" />
              <rect className="schematic-wheel" x="38" y="72" width="20" height="48" rx="7" />
              <rect className="schematic-wheel" x="182" y="72" width="20" height="48" rx="7" />
              <rect className="schematic-wheel" x="38" y="216" width="20" height="48" rx="7" />
              <rect className="schematic-wheel" x="182" y="216" width="20" height="48" rx="7" />
            </g> : vehicleType === "грузовой автомобиль" ? <g className="schematic-truck">
              <path className="schematic-shadow" d="M55 30 Q55 18 69 16 H171 Q185 18 185 32 V206 H196 V273 H44 V206 H55Z" />
              <path className="schematic-body" d="M61 32 Q61 25 72 24 H168 Q179 26 179 34 V201 H61Z" />
              <path className="schematic-cabin" d="M70 39 H170 V83 H70Z" />
              <path className="schematic-glass" d="M76 43 H164 V74 H76Z" />
              <path className="schematic-line" d="M66 91 H174 M66 191 H174 M78 99 V182 M162 99 V182" />
              <path className="schematic-cabin" d="M60 213 H180 V266 H60Z" />
              <path className="schematic-glass" d="M69 218 H171 V239 H69Z" />
              <path className="schematic-line" d="M120 242 V265" />
              <rect className="schematic-wheel" x="38" y="55" width="20" height="44" rx="7" />
              <rect className="schematic-wheel" x="182" y="55" width="20" height="44" rx="7" />
              <rect className="schematic-wheel" x="38" y="211" width="20" height="42" rx="7" />
              <rect className="schematic-wheel" x="182" y="211" width="20" height="42" rx="7" />
            </g> : <>
            <path className="schematic-shadow" d="M60 40 Q60 18 83 15 L157 15 Q180 18 180 40 L198 80 L198 250 L181 292 Q176 310 156 313 L84 313 Q64 310 59 292 L42 250 L42 80Z" />
            <path className="schematic-body" d="M67 45 Q68 29 86 27 L154 27 Q172 29 173 45 L187 83 L187 248 L171 287 Q168 299 153 301 L87 301 Q72 299 69 287 L53 248 L53 83Z" />
            <path className="schematic-glass" d="M76 59 Q78 44 91 42 L149 42 Q162 44 164 59 L176 91 L64 91Z" />
            <path className="schematic-cabin" d="M64 103 L176 103 L176 224 L64 224Z" />
            <path className="schematic-glass" d="M64 236 L176 236 L163 275 Q160 285 149 286 L91 286 Q80 285 77 275Z" />
            <path className="schematic-line" d="M53 98 H187 M53 229 H187 M84 104 V222 M156 104 V222" />
            <rect className="schematic-wheel" x="31" y="74" width="24" height="59" rx="8" />
            <rect className="schematic-wheel" x="185" y="74" width="24" height="59" rx="8" />
            <rect className="schematic-wheel" x="31" y="207" width="24" height="59" rx="8" />
            <rect className="schematic-wheel" x="185" y="207" width="24" height="59" rx="8" />
            </>}
          </svg>
          {issueZoneOrder.map((entry) => {
            const record = zones.find((item) => item.id === entry.id);
            const zoneLabel = record?.label && record.label !== entry.label ? record.label : interfaceText(entry.label);
            const active = selected === entry.id;
            const status = record?.status || "no_data";
            const ZoneIcon = { engine: Wrench, transmission: Cog, body: CarFront, front_left: CircleDot, front_right: CircleDot, rear_left: CircleDot, rear_right: CircleDot }[entry.id];
            return (
              <button
                key={entry.id}
                type="button"
                className={`zone-hit ${entry.position} ${status} ${active ? "selected" : ""}`}
                aria-pressed={active}
                aria-label={`${zoneLabel}: ${interfaceText(issueStatusLabel(status))}`}
                title={`${zoneLabel} · ${interfaceText(issueStatusLabel(status))}`}
                onClick={() => onSelect(active ? "" : entry.id)}
              >
                <span className="zone-hit-icon" aria-hidden="true"><ZoneIcon size={16} /></span>
                <span className="zone-hit-label">{zoneLabel}</span>
                <span className="zone-hit-status">{interfaceText(issueStatusLabel(status))}</span>
              </button>
            );
          })}
        </div>
        <div className="issue-zone-detail" aria-live="polite">
          {!zone ? (
            <div className="zone-empty">
              <strong>Выберите зону на схеме</strong>
              <span>Данные осмотра и работ показываются только при наличии записи.</span>
            </div>
          ) : (
            <>
              <div className={`zone-state ${zone.status}`}><span aria-hidden="true">{zone.status === "confirmed" ? "!" : zone.status === "suspected" ? "?" : "·"}</span>{interfaceText(issueStatusLabel(zone.status))}</div>
              <h4>{issueZoneOrder.some((entry) => entry.id === zone.id && entry.label === zone.label) ? interfaceText(zone.label) : zone.label}</h4>
              {zone.status === "no_data" ? (
                <p>Наблюдений по этой зоне нет. Схема не определяет неисправности автоматически.</p>
              ) : (
                <>
                  {zone.note && <p>{zone.note}</p>}
                  {zone.updatedAt && <small>Запись от {date(zone.updatedAt)}{zone.source ? ` · ${zone.source}` : ""}</small>}
                  {zone.attachmentUrl && safeResourceUrl(zone.attachmentUrl) && <a className="zone-attachment" href={safeResourceUrl(zone.attachmentUrl)!} target="_blank" rel="noreferrer">Открыть фото или файл</a>}
                </>
              )}
              {zone.demo && <small>Демо-запись</small>}
              <form className="zone-observation-form" onSubmit={submit}>
                <label>
                  Статус наблюдения
                  <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as typeof draftStatus)} disabled={saving}>
                    <option value="no_data">Нет наблюдения</option>
                    <option value="suspected">Подозрение</option>
                    <option value="confirmed">Подтверждено механиком</option>
                  </select>
                </label>
                <label>
                  Что заметили
                  <textarea value={draftNote} onChange={(event) => setDraftNote(event.target.value)} maxLength={2000} rows={3} placeholder="Опишите факт наблюдения; решение остаётся за механиком." disabled={saving} />
                </label>
                <div className="zone-save-row">
                  <span>{draftNote.length}/2000</span>
                  <button className="zone-inspection-link" type="submit" disabled={saving || !selected}>
                    {saving ? <><PSpinner size="xs" aria={{ "aria-label": interfaceText("Сохраняем наблюдение") }} /> Сохраняем…</> : "Сохранить наблюдение"}
                  </button>
                </div>
                {(formError || saveError) && <p className="zone-save-error" role="alert">{formError || saveError}</p>}
              </form>
              <button type="button" className="zone-inspection-link" onClick={onOpenInspection}>Перейти к осмотру</button>
            </>
          )}
        </div>
      </div>
      <div className="issue-zone-legend" aria-label="Обозначения">
        <span><i className="suspected" /> Подозрение</span><span><i className="confirmed" /> Подтверждено</span><span><i className="no-data" /> Нет записи</span><span><Wrench size={15} aria-hidden="true" /> Двигатель</span><span><Cog size={15} aria-hidden="true" /> Трансмиссия</span>
      </div>
    </section>
  );
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const isCredentialRequest = url === "/api/auth/login" || url === "/api/auth/setup";
  if (!authBoundary.catchUp(window.location.href)) throw new DOMException("Сеанс завершён", "AbortError");
  if (authBoundary.transitioning && !isCredentialRequest) throw new DOMException("Сеанс завершён", "AbortError");
  const requestGeneration = authBoundary.generation;
  const controller = new AbortController();
  const releaseRequest = authBoundary.track(controller);
  const requestUrl = appPath(url);
  const headers = new Headers(init?.headers);
  const identity = authBoundary.identity;
  if (identity && url !== "/api/auth/session" && !isCredentialRequest) {
    headers.set("X-Mehay-User-Id", identity);
  }
  try {
    const r = await fetch(requestUrl, { ...init, headers, signal: controller.signal });
    if (!authBoundary.isCurrent(requestGeneration)) throw new DOMException("Сеанс завершён", "AbortError");
    if (r.status === 401 && !isCredentialRequest) {
      window.dispatchEvent(new Event("mehay-auth-expired"));
      throw new DOMException("Сеанс завершён", "AbortError");
    }
    if (r.status === 204) return undefined as T;
    let body: unknown;
    try {
      body = await r.json();
    } catch {
      body = { error: "Сервер вернул некорректный ответ" };
    }
    if (!authBoundary.isCurrent(requestGeneration)) throw new DOMException("Сеанс завершён", "AbortError");
    if (!r.ok) {
      const raw = (body as { error?: string }).error || "";
      const known: Record<string, string> = {
        invalid_credentials: "Неверный логин или пароль",
        rate_limited: "Слишком много попыток. Подождите 15 минут и повторите.",
        setup_complete: "Первичная настройка уже выполнена. Войдите в систему.",
        invalid_setup: "Проверьте имя пользователя, имя сотрудника и пароль",
        authentication_required: "Сеанс завершён. Войдите снова.",
        admin_required: "Управление пользователями доступно только администратору",
        invalid_user: "Проверьте данные сотрудника",
    invalid_password: "Пароль должен содержать от 8 до 128 символов",
        user_not_found: "Сотрудник не найден",
        "AI assistant is not configured": "Помощник не настроен на сервере",
        "Assistant provider request failed": "Поставщик помощника отклонил запрос",
        "Assistant provider timed out": "Помощник не ответил вовремя",
        "Invalid telemetry payload": "Проверьте состав и значения JSON-телеметрии",
        "Invalid inspection": "Осмотр содержит неполные или некорректные данные",
        "Invalid file type": "Допустимы фотографии JPEG, PNG или WebP",
        "File too large": "Размер фотографии превышает 8 МБ",
      };
      throw new Error(known[raw] || raw || `Ошибка сервера (${r.status})`);
    }
    return body as T;
  } finally {
    releaseRequest();
  }
}
function AdminVehicleAssignments() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [vehicles, setVehicles] = useState<NeuroFleetVehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [assigned, setAssigned] = useState<string[]>([]);
  const [loadedAssignmentUserIds, setLoadedAssignmentUserIds] = useState<string[]>([]);
  const [loadedAssignmentVehicleId, setLoadedAssignmentVehicleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    api<{ users: AdminUser[] }>("/api/admin/users").then(({ users: list }) => { if (active) setUsers(list); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить сотрудников"); });
    api<{ vehicles: NeuroFleetVehicle[] }>("/api/neuro/fleet").then(({ vehicles: list }) => { if (active) { setVehicles(list); setVehicleId(current => current || list[0]?.vehicle_id || ""); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить машины"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!vehicleId) { setAssigned([]); setLoadedAssignmentUserIds([]); return; }
    let active = true;
    setLoadedAssignmentVehicleId(null); setAssigned([]); setLoadedAssignmentUserIds([]);
    setLoading(true); setError(""); setNotice("");
    api<{ assignments: { userId: string; active: boolean }[] }>(`/api/neuro/vehicles/${encodeURIComponent(vehicleId)}/assignments`)
      .then(({ assignments }) => { if (active) { const userIds = assignments.filter(item => item.active).map(item => item.userId); setAssigned(userIds); setLoadedAssignmentUserIds(userIds); setLoadedAssignmentVehicleId(vehicleId); } })
      .catch(cause => { if (active) { setAssigned([]); setLoadedAssignmentVehicleId(null); setError(cause instanceof Error ? cause.message : "Не удалось загрузить назначения"); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [vehicleId]);
  const assignmentReady = canSaveAssignments({ selectedVehicleId: vehicleId, loadedVehicleId: loadedAssignmentVehicleId, loading, saving });
  async function saveAssignments() {
    if (!assignmentReady) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await api<{ assignments: { userId: string; active: boolean }[] }>(`/api/neuro/vehicles/${encodeURIComponent(vehicleId)}/assignments`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: assigned, expectedUserIds: loadedAssignmentUserIds }) });
      const userIds = result.assignments.filter(item => item.active).map(item => item.userId);
      setAssigned(userIds); setLoadedAssignmentUserIds(userIds); setLoadedAssignmentVehicleId(vehicleId); setNotice(interfaceText("Назначения сохранены."));
    } catch (cause) {
      if (cause instanceof Error && cause.message === "assignment_conflict") {
        setLoadedAssignmentVehicleId(null); setAssigned([]); setLoadedAssignmentUserIds([]); setLoading(true);
        try {
          const { assignments } = await api<{ assignments: { userId: string; active: boolean }[] }>(`/api/neuro/vehicles/${encodeURIComponent(vehicleId)}/assignments`);
          const userIds = assignments.filter(item => item.active).map(item => item.userId);
          setAssigned(userIds); setLoadedAssignmentUserIds(userIds); setLoadedAssignmentVehicleId(vehicleId);
          setNotice(interfaceText("Назначения изменил другой администратор. Список обновлён; проверьте его и примените изменения повторно."));
        } catch (refreshCause) { setError(refreshCause instanceof Error ? refreshCause.message : "Не удалось обновить назначения"); }
        finally { setLoading(false); }
      } else setError(cause instanceof Error ? cause.message : "Не удалось сохранить назначения");
    }
    finally { setSaving(false); }
  }
  const mechanics = users.filter(user => user.active && user.role === "mechanic");
  const selected = vehicles.find(item => item.vehicle_id === vehicleId);
  return <section className="admin-users" aria-labelledby="vehicle-assignment-heading">
    <header><div><h2 id="vehicle-assignment-heading">{interfaceText("Доступ механиков к машинам")}</h2><p>{interfaceText("Назначенные механики могут читать историю вопросов и ответов по выбранной машине.")}</p></div></header>
    {vehicles.length > 0 && <label>{interfaceText("Машина")}<select value={vehicleId} disabled={loading || saving} onChange={event => setVehicleId(event.target.value)}>{vehicles.map(vehicle => <option key={vehicle.vehicle_id} value={vehicle.vehicle_id}>{vehicle.garage_no || vehicle.vehicle_id} · {vehicle.make} {vehicle.model}</option>)}</select></label>}
    {selected && <fieldset className="admin-assignment-list" disabled={!assignmentReady}><legend>{interfaceText("Назначенные механики")}</legend>
      {mechanics.length ? mechanics.map(user => <label key={user.id} className="admin-assignment-option"><input type="checkbox" checked={assigned.includes(user.id)} onChange={event => setAssigned(current => event.target.checked ? [...current, user.id] : current.filter(id => id !== user.id))} /><span>{user.displayName}</span><small>@{user.username}</small></label>) : <p className="muted">{interfaceText("Нет активных учётных записей механиков.")}</p>}
      <PButton type="button" variant="primary" disabled={!assignmentReady} onClick={() => void saveAssignments()}>{saving ? interfaceText("Сохраняем…") : interfaceText("Сохранить назначения")}</PButton>
    </fieldset>}
    {loading && <p className="muted" role="status">{interfaceText("Загружаем…")}</p>}{error && <p className="auth-error" role="alert">{interfaceText(error)}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}

function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ username: "", displayName: "", password: "", role: "mechanic" as AuthUser["role"] });
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const load = async () => {
    setLoading(true);
    try { setUsers((await api<{ users: AdminUser[] }>("/api/admin/users")).users); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить сотрудников"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api<AdminUser>("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setForm({ username: "", displayName: "", password: "", role: "mechanic" });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось создать учётную запись"); }
    finally { setSaving(false); }
  }
  async function update(user: AdminUser, patch: Partial<AdminUser>) {
    setSaving(true); setError("");
    try { await api<AdminUser>(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось обновить учётную запись"); }
    finally { setSaving(false); }
  }
  async function resetPassword(user: AdminUser) {
    const password = passwords[user.id] || "";
    if (password.length < 8 || password.length > 128) { setError("Новый пароль должен содержать от 8 до 128 символов."); return; }
    setSaving(true); setError("");
    try { await api<void>(`/api/admin/users/${encodeURIComponent(user.id)}/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); setPasswords((current) => ({ ...current, [user.id]: "" })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось обновить пароль"); }
    finally { setSaving(false); }
  }
  return <section className="admin-users">
    <header><div><h2>Пользователи</h2><p>Учётные записи сотрудников парка. Права доступа проверяет сервер.</p></div></header>
    <form className="admin-create" onSubmit={create}>
      <h3>Добавить сотрудника</h3>
      <label>Имя<input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
      <label>Имя пользователя<input required autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
      <label>Пароль (от 8 до 128 символов)<input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      <label>Роль<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AuthUser["role"] })}><option value="mechanic">Механик</option><option value="admin">Администратор</option></select></label>
      <PButton type="submit" variant="primary" disabled={saving || form.password.length < 8 || form.password.length > 128}><Plus size={16} /> Создать</PButton>
    </form>
    {error && <p className="auth-error" role="alert">{interfaceText(error)}</p>}
    {loading ? <p className="muted" role="status">Загружаем список…</p> : <div className="admin-user-list">{users.map((user) => <article key={user.id} className="admin-user">
      <div className="admin-user-heading"><strong>{user.displayName}</strong><span>{user.username}</span><PTag variant={user.active ? "success-frosted" : "secondary"}>{user.active ? "Активен" : "Отключён"}</PTag></div>
      <div className="admin-user-controls">
        <label>Роль<select value={user.role} disabled={saving} onChange={(e) => void update(user, { role: e.target.value as AuthUser["role"] })}><option value="mechanic">Механик</option><option value="admin">Администратор</option></select></label>
        <PButton type="button" variant="secondary" disabled={saving} onClick={() => void update(user, { active: !user.active })}>{user.active ? "Отключить" : "Включить"}</PButton>
        <div className="admin-password"><label htmlFor={`password-${user.id}`}>Новый пароль · 8–128 символов</label><input id={`password-${user.id}`} type="password" autoComplete="new-password" minLength={8} maxLength={128} value={passwords[user.id] || ""} onChange={(e) => setPasswords((current) => ({ ...current, [user.id]: e.target.value }))} /><PButton type="button" variant="secondary" disabled={saving || (passwords[user.id] || "").length < 8 || (passwords[user.id] || "").length > 128} onClick={() => void resetPassword(user)}><KeyRound size={16} /> Сменить пароль</PButton></div>
      </div>
    </article>)}</div>}
  </section>;
}
function trapDialogTab(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export default function App() {
  const interfaceLanguage = useSystemLanguage();
  useEffect(() => { document.documentElement.lang = interfaceLanguage; }, [interfaceLanguage]);
  const [route, setRoute] = useState(readRoute);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [authError, setAuthError] = useState(() => new URLSearchParams(window.location.search).has("expired") ? "Сеанс завершён. Войдите снова." : "");
  const [authBusy, setAuthBusy] = useState(false);
  const [authForm, setAuthForm] = useState({ username: "", displayName: "", password: "" });
  const [fleetScope, setFleetScope] = useState<"customer" | "archive">("customer");
  const [requestedSession, setRequestedSession] = useState("");
  const [allData, setData] = useState<Data | null>(null),
    [selected, setSelected] = useState(""),
    [page, setPage] = useState("Обзор"),
    [tab, setTab] = useState("summary"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [fleetPage, setFleetPage] = useState(0),
    [historyPage, setHistoryPage] = useState(0),
    [theme, setTheme] = useState<"light" | "dark">(() => {
      const saved = localStorage.getItem("mehay-theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }),
    [selectedZone, setSelectedZone] = useState<IssueZoneId | "">(""),
    [zoneSaving, setZoneSaving] = useState(false),
    [zoneSaveError, setZoneSaveError] = useState(""),
    [busy, setBusy] = useState(false),
    [vehicleLoading, setVehicleLoading] = useState(false),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState(false),
    [activeRequest, setActiveRequest] = useState<Request | null>(null),
    [message, setMessage] = useState(""),
    [answer, setAnswer] = useState(""),
    [assistantBusy, setAssistantBusy] = useState(false),
    [assistantError, setAssistantError] = useState(""),
    [engineModel, setEngineModel] = useState(""),
    [manualOnly, setManualOnly] = useState(false),
    [webQuery, setWebQuery] = useState(""),
    [telemetryText, setTelemetryText] = useState(""),
    [telemetryError, setTelemetryError] = useState("");
  const [items, setItems] = useState<Vehicle["inspection"]["items"]>([]),
    [note, setNote] = useState(""),
    [webSearch, setWebSearch] = useState(false),
    [webDomain, setWebDomain] = useState(""),
    [assistantSources, setAssistantSources] = useState<Source[]>([]),
    [chatOpen, setChatOpen] = useState(false),
    [autoSendPrompt, setAutoSendPrompt] = useState(""),
    [chatHistory, setChatHistory] = useState<ChatMessage[]>([]),
    [chatLoadedScope, setChatLoadedScope] = useState(""),
    [requestDraft, setRequestDraft] = useState("");
  const [parts, setParts] = useState<Part[]>([]),
    [partsQuery, setPartsQuery] = useState(""),
    [partsError, setPartsError] = useState(""),
    [procurementCatalog, setProcurementCatalog] = useState<{ vehicleId: string; parts: Part[]; error: string }>({ vehicleId: "", parts: [], error: "" }),
    [requestWork, setRequestWork] = useState(""),
    [requestPartId, setRequestPartId] = useState(""),
    [requestPartQty, setRequestPartQty] = useState("1"),
    [requestPartOther, setRequestPartOther] = useState(""),
    [noteCategory, setNoteCategory] = useState("general"),
    [telemetryPreview, setTelemetryPreview] = useState<Record<
      string,
      unknown
    > | null>(null),
    [report, setReport] = useState<Record<string, unknown> | null>(null);
  const modalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [kitDraft, setKitDraft] = useState<NonNullable<Vehicle["partsKit"]>>(
    [],
  );
  const [maintenancePlan, setMaintenancePlan] = useState<MaintenancePlan | null>(null);
  const [planningLoading, setPlanningLoading] = useState(false);
  const data = useMemo(() => {
    if (!allData) return null;
    const vehicles = allData.vehicles.filter(v => Boolean(v.neuroVehicleId) === (fleetScope === "customer"));
    const ids = new Set(vehicles.map(v => v.id));
    return { ...allData, vehicles, requests: allData.requests.filter(r => ids.has(r.vehicleId)) };
  }, [allData, fleetScope]);
  const [planningError, setPlanningError] = useState("");
  const [procurementConfirmed, setProcurementConfirmed] = useState(false);
  const [offersPart, setOffersPart] = useState<{ id: string; vehicleId: string; name: string; quantity: number } | null>(null);
  const [planningObservation, setPlanningObservation] = useState("");
  const [defectConfirmed, setDefectConfirmed] = useState(false);
  const [planningTitle, setPlanningTitle] = useState("Проверить подвеску и заменить сайлентблок");
  const [workUrgency, setWorkUrgency] = useState<Urgency>("soon");
  const [plannedParts, setPlannedParts] = useState<Record<string, { quantity: string; urgency: Urgency }>>({});
  const [planningRequest, setPlanningRequest] = useState<Request | null>(null);
  const [planningKey, setPlanningKey] = useState("");
  const [planningReadyVehicle, setPlanningReadyVehicle] = useState("");
  const planningRequestId = useRef(0);
  const [form, setForm] = useState({
    type: "repair",
    title: "",
    description: "",
    priority: "normal",
    part: "",
    quantity: "1",
  });
  const vehicleRequest = useRef(0);
  const assistantRequest = useRef(0);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const chatPinnedToBottom = useRef(true);
  const reportRequest = useRef(0);
  const evidenceNavigation = useRef(0);
  const selectedRef = useRef(selected);
  const selectedZoneRef = useRef(selectedZone);
  const zoneSaveRequest = useRef(0);
  const zoneSavingRef = useRef(false);
  const goTo = (next: "/" | "/login" | "/app") => {
    window.history.pushState({}, "", appPath(next));
    setRoute(next);
  };
  useEffect(() => {
    const onPopState = () => {
      setRoute(readRoute());
      const target = readRecordTarget(window.location.search);
      if (target && authUser) void openEvidenceRecord(target);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [authUser]);
  useEffect(() => {
    if (route === "/") {
      setAuthLoading(false);
      return;
    }
    if (authUser) {
      setAuthLoading(false);
      return;
    }
    setAuthLoading(true);
    let active = true;
    api<{ user: AuthUser | null; setupRequired: boolean }>("/api/auth/session")
      .then((session) => {
        if (!active) return;
        if (session.user) authBoundary.bindIdentity(session.user.id);
        else authBoundary.resetIdentity();
        setAuthUser(session.user);
        setSetupRequired(session.setupRequired);
      })
      .catch((cause) => {
        if (active) setAuthError(cause instanceof Error ? cause.message : "Не удалось проверить сеанс");
      })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, [route, authUser]);
  useEffect(() => {
    const expired = () => {
      startAuthTransition(`${appPath("/login")}?expired=1`);
    };
    window.addEventListener("mehay-auth-expired", expired);
    return () => window.removeEventListener("mehay-auth-expired", expired);
  }, []);
  useEffect(() => {
    let active = true;
    let checking = false;
    const recheckPrincipal = async () => {
      if (!authUser || checking || !authBoundary.catchUp(window.location.href)) return;
      checking = true;
      const generation = authBoundary.generation;
      try {
        const session = await api<{ user: AuthUser | null }>("/api/auth/session");
        if (!active || !authBoundary.isCurrent(generation)) return;
        authBoundary.reconcileIdentity(session.user?.id ?? null, `${appPath("/login")}?expired=1`);
      } catch {
        if (active && authBoundary.isCurrent(generation)) authBoundary.reconcileIdentity(null, `${appPath("/login")}?expired=1`);
      } finally {
        checking = false;
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_EPOCH_KEY && event.storageArea === localStorage) {
        authBoundary.syncEpoch(event.newValue, window.location.href);
      }
    };
    const onBroadcast = (event: MessageEvent<string>) => authBoundary.syncEpoch(event.data, window.location.href);
    const onVisibility = () => { if (document.visibilityState === "visible") void recheckPrincipal(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", recheckPrincipal);
    window.addEventListener("pageshow", recheckPrincipal);
    document.addEventListener("visibilitychange", onVisibility);
    authChannel?.addEventListener("message", onBroadcast);
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", recheckPrincipal);
      window.removeEventListener("pageshow", recheckPrincipal);
      document.removeEventListener("visibilitychange", onVisibility);
      authChannel?.removeEventListener("message", onBroadcast);
    };
  }, [authUser]);
  useEffect(() => {
    if (authUser && route === "/login") goTo("/app");
  }, [authUser, route]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    selectedZoneRef.current = selectedZone;
    setZoneSaveError("");
  }, [selectedZone, selected]);
  useEffect(() => {
    localStorage.setItem("mehay-theme", theme);
    document.documentElement.classList.remove("scheme-only-light", "scheme-only-dark");
    document.documentElement.classList.add(theme === "dark" ? "scheme-only-dark" : "scheme-only-light");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => setSelectedZone(""), [selected]);
  const vehicle =
    data?.vehicles.find((v) => v.id === selected) || data?.vehicles[0];
  const [headerMode, setHeaderMode] = useState<AssistantMode | null>(null);
  const [assistantOpenId, setAssistantOpenId] = useState(0);
  const [assistantHost, setAssistantHost] = useState<HTMLDivElement | null>(null);
  const [dictating, setDictating] = useState(false);
  const assistantDialog = useRef<HTMLDialogElement>(null);
  const assistantTrigger = useRef<HTMLElement | null>(null);
  const diagnosticAssistant = Boolean(headerMode && page === "Карточка" && tab === "diagnostics" && vehicle?.neuroVehicleId);
  function openHeaderAssistant(mode: AssistantMode) {
    assistantTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAssistantOpenId(value => value + 1);
    setHeaderMode(mode);
    setDictating(mode === "voice" && Boolean(isSpeechRecognitionAvailable()));
    setChatOpen(true);
  }
  useEffect(() => {
    const dialog = assistantDialog.current;
    if (!chatOpen || !dialog) return;
    dialog.showModal();
    if (!diagnosticAssistant && headerMode !== "voice") dialog.querySelector("textarea")?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      assistantTrigger.current?.focus({ preventScroll: true });
      assistantTrigger.current = null;
    };
  }, [chatOpen, diagnosticAssistant, headerMode]);
  function closeAssistant() {
    setChatOpen(false);
    setHeaderMode(null);
    setDictating(false);
  }
  const assistantVehicle = page === "Карточка" ? vehicle || null : page === "Заявки" && activeRequest ? data?.vehicles.find((item) => item.id === activeRequest.vehicleId) || null : null;
  const assistantEngineModel = assistantVehicle ? engineModel : "";
  const chatScope = manualOnly
    ? `mehay-manual-chat-${encodeURIComponent(engineModel)}`
    : assistantVehicle?.id && assistantEngineModel !== matchingEngineManual(assistantVehicle.engine)
      ? `mehay-chat-${assistantVehicle.id}-engine-${encodeURIComponent(assistantEngineModel)}`
      : assistantVehicle?.id ? `mehay-chat-${assistantVehicle.id}` : "mehay-general-chat";
  useEffect(() => {
    setEngineModel(matchingEngineManual(vehicle?.engine));
  }, [vehicle?.id]);
  useLayoutEffect(() => {
    assistantRequest.current += 1;
    setAssistantBusy(false);
    setAnswer("");
    setAssistantError("");
    setAssistantSources([]);
    setProgressiveAnswer(null);
    setMessage("");
    try {
      const saved = JSON.parse(authBoundary.read(chatScope) || "[]") as ChatMessage[];
      setChatHistory(Array.isArray(saved) ? saved : []);
    } catch {
      setChatHistory([]);
    }
    setChatLoadedScope(chatScope);
  }, [chatScope]);
  useEffect(() => {
    if (chatLoadedScope !== chatScope) return;
    authBoundary.persist(chatScope, JSON.stringify(chatHistory));
  }, [chatScope, chatHistory, chatLoadedScope]);
  useEffect(() => {
    const prompt = autoSendPrompt;
    if (!chatOpen || !prompt || chatLoadedScope !== chatScope) return;
    setAutoSendPrompt("");
    void askAssistant({ preventDefault() {} } as React.FormEvent, prompt);
  }, [autoSendPrompt, chatOpen, chatLoadedScope, chatScope]);
  useEffect(() => {
    if (!vehicle?.id) return;
    const draftKey = `mehay-planning-draft-${vehicle.id}`;
    let draft: PlanningDraft | null = null;
    try { draft = JSON.parse(authBoundary.read(draftKey) || "null") as PlanningDraft | null; } catch { draft = null; }
    const idempotencyKey = draft?.idempotencyKey || crypto.randomUUID();
    setPlanningReadyVehicle("");
    setPlanningKey(idempotencyKey);
    setMaintenancePlan(null);
    setPlanningError("");
    setPlanningObservation(draft?.observation || "");
    setDefectConfirmed(draft?.defectConfirmed || false);
    setPlanningTitle(draft?.title || "Проверить подвеску и заменить сайлентблок");
    setWorkUrgency(draft?.workUrgency || "soon");
    setPlannedParts(draft?.parts || {});
    setPlanningRequest(null);
    setPlanningReadyVehicle(vehicle.id);
  }, [vehicle?.id]);
  useEffect(() => {
    if (!vehicle?.id || planningReadyVehicle !== vehicle.id || !planningKey) return;
    const draft: PlanningDraft = { idempotencyKey: planningKey, observation: planningObservation, defectConfirmed, title: planningTitle, workUrgency, parts: plannedParts };
    authBoundary.persist(`mehay-planning-draft-${vehicle.id}`, JSON.stringify(draft));
  }, [vehicle?.id, planningReadyVehicle, planningKey, planningObservation, defectConfirmed, planningTitle, workUrgency, plannedParts]);
  async function loadMaintenancePlan(id = vehicle?.id) {
    if (!id) return;
    const requestId = ++planningRequestId.current;
    setPlanningLoading(true);
    setPlanningError("");
    try {
      const plan = await api<MaintenancePlan>(`/api/vehicles/${id}/maintenance-plan`);
      if (requestId === planningRequestId.current && selectedRef.current === id)
        setMaintenancePlan(plan);
    } catch (e) {
      if (requestId === planningRequestId.current && selectedRef.current === id)
        setPlanningError(e instanceof Error ? e.message : "Не удалось рассчитать план");
    } finally {
      if (requestId === planningRequestId.current) setPlanningLoading(false);
    }
  }
  function revisePlanningDraft(id = vehicle?.id) {
    if (!id) return;
    const key = crypto.randomUUID();
    authBoundary.persist(`mehay-planning-key-${id}`, key);
    setPlanningKey(key);
    setPlanningRequest(null);
  }
  async function submitPlanningRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicle || !maintenancePlan || !defectConfirmed || !planningObservation.trim() || busy || planningRequest) return;
    const id = vehicle.id;
    const chosenParts = Object.entries(plannedParts).filter(([, value]) => Number(value.quantity) > 0);
    if (!planningTitle.trim()) {
      setPlanningError("Укажите название работ.");
      return;
    }
    setBusy(true);
    setPlanningError("");
    try {
      const keyName = `mehay-planning-key-${id}`;
      const key = planningKey || authBoundary.read(keyName) || crypto.randomUUID();
      authBoundary.persist(keyName, key);
      const created = await api<Request>(`/api/vehicles/${id}/planning-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          idempotencyKey: key,
          title: planningTitle.trim(),
          description: `Наблюдение механика: ${planningObservation.trim()}`,
          priority: workUrgency === "urgent" ? "critical" : workUrgency === "soon" ? "high" : "normal",
          workItems: [{ id: key, title: planningTitle.trim(), quantity: 1, unit: "работа", done: false, urgency: workUrgency }],
          parts: chosenParts.map(([partId, value]) => ({ partId, quantity: Number(value.quantity), usedQuantity: 0, urgency: value.urgency })),
        }),
      });
      if (selectedRef.current !== id) return;
      setPlanningRequest(created);
      setData((current) => current ? { ...current, requests: [created, ...current.requests.filter((r) => r.id !== created.id)] } : current);
      const nextKey = crypto.randomUUID();
      authBoundary.remove(`mehay-planning-draft-${id}`);
      setPlanningKey(nextKey);
      setPlanningObservation("");
      setDefectConfirmed(false);
      setPlanningTitle("Проверить подвеску и заменить сайлентблок");
      setWorkUrgency("soon");
      setPlannedParts({});
    } catch (e) {
      setPlanningError(e instanceof Error ? e.message : "Не удалось передать план на согласование");
    } finally {
      setBusy(false);
    }
  }
  async function reload(id = selected, restoreDraft = false) {
    const requestId = ++vehicleRequest.current;
    setBusy(true);
    setError("");
    try {
      const d = await api<Data>("/api/bootstrap");
      if (requestId !== vehicleRequest.current) return;
      setData(d);
      const scoped = d.vehicles.filter(v => Boolean(v.neuroVehicleId) === (fleetScope === "customer"));
      const chosen = scoped.some((v) => v.id === id)
        ? id
        : [...scoped].sort(
            (a, b) => vehicleRank(a.status) - vehicleRank(b.status),
          )[0]?.id || "";
      setSelected(chosen);
      selectedRef.current = chosen;
      const draft = restoreDraft && chosen ? readVehicleDraft(chosen) : null;
      if (draft) {
        setItems(draft.items || []);
        setNote(draft.note || "");
        setNoteCategory(draft.noteCategory || "general");
        setKitDraft(draft.kit || []);
        setForm(
          draft.form || {
            type: "repair",
            title: "",
            description: "",
            priority: "normal",
            part: "",
            quantity: "1",
          },
        );
        setRequestWork(draft.requestWork || "");
        setRequestPartId(draft.requestPartId || "");
        setRequestPartQty(draft.requestPartQty ?? "1");
        setRequestPartOther(draft.requestPartOther || "");
        setMessage(draft.message || "");
        setRequestDraft(draft.requestDraft || "");
        setTelemetryText(draft.telemetryText || "");
      }
      if (chosen) {
        setVehicleLoading(true);
        const fresh = await api<Vehicle>(`/api/vehicles/${chosen}`);
        if (requestId !== vehicleRequest.current) return;
        setData((x) =>
          x
            ? {
                ...x,
                vehicles: x.vehicles.map((v) => (v.id === chosen ? fresh : v)),
              }
            : x,
        );
        if (!draft?.items) setItems(fresh.inspection.items);
        if (!draft?.kit) setKitDraft(fresh.partsKit || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    } finally {
      if (requestId === vehicleRequest.current) {
        setBusy(false);
        setVehicleLoading(false);
      }
    }
  }
  useEffect(() => {
    if (authUser) {
      const target = readRecordTarget(window.location.search);
      void (async () => {
        await reload(target?.vehicleId || "", true);
        if (target) await openEvidenceRecord(target);
      })();
    } else if (!authLoading) setData(null);
  }, [authUser, authLoading]);
  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      await api<{ user: AuthUser }>(`/api/auth/${setupRequired ? "setup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setupRequired ? authForm : { username: authForm.username, password: authForm.password }),
      });
      startAuthTransition(recordReturnPath(window.location.search, appPath("/app")));
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Не удалось войти");
    } finally {
      setAuthBusy(false);
    }
  }
  async function logout() {
    try { await api<void>("/api/auth/logout", { method: "POST" }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось завершить сеанс"); return; }
    startAuthTransition(appPath("/login"));
  }
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const restoreFocus = modal;
        setModal(false);
        setActiveRequest(null);
        if (restoreFocus) window.requestAnimationFrame(() => modalTriggerRef.current?.focus());
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [modal]);
  useEffect(() => {
    if (!modal) setProcurementConfirmed(false);
  }, [modal]);
  async function selectVehicle(id: string, session = "") {
    setRequestedSession(session);
    if (selectedRef.current) {
      authBoundary.persist(
        vehicleDraftKey(selectedRef.current),
        JSON.stringify({
          items,
          note,
          noteCategory,
          kit: kitDraft,
          form,
          requestWork,
          requestPartId,
          requestPartQty,
          requestPartOther,
          message,
          requestDraft,
          telemetryText,
        } satisfies VehicleDraftState),
      );
    }
    const draft = readVehicleDraft(id);
    const requestId = ++vehicleRequest.current;
    assistantRequest.current += 1;
    setEngineModel(matchingEngineManual(data?.vehicles.find((item) => item.id === id)?.engine));
    selectedRef.current = id;
    setSelected(id);
    setActiveRequest(null);
    setModal(false);
    setPage("Карточка");
    setVehicleLoading(true);
    setItems(draft?.items || []);
    setNote(draft?.note || "");
    setNoteCategory(draft?.noteCategory || "general");
    setKitDraft(draft?.kit || []);
    setForm(
      draft?.form || {
        type: "repair",
        title: "",
        description: "",
        priority: "normal",
        part: "",
        quantity: "1",
      },
    );
    setProcurementConfirmed(false);
    setRequestWork(draft?.requestWork || "");
    setRequestPartId(draft?.requestPartId || "");
    setRequestPartQty(draft?.requestPartQty ?? "1");
    setRequestPartOther(draft?.requestPartOther || "");
    setMessage("");
    setManualOnly(false);
    setRequestDraft(draft?.requestDraft || "");
    setTelemetryText(draft?.telemetryText || "");
    setTelemetryPreview(null);
    setAnswer("");
    setReport(null);
    reportRequest.current += 1;
    setAssistantSources([]);
    setAssistantError("");
    setAssistantBusy(false);
    setTab("summary");
    setError("");
    try {
      const v = await api<Vehicle>(`/api/vehicles/${id}`);
      if (requestId !== vehicleRequest.current) return;
      setData((d) =>
        d
          ? { ...d, vehicles: d.vehicles.map((x) => (x.id === id ? v : x)) }
          : d,
      );
      if (!draft?.items) setItems(v.inspection.items);
      if (!draft?.kit) setKitDraft(v.partsKit || []);
    } catch (e) {
      if (requestId !== vehicleRequest.current) return;
      setError(
        e instanceof Error ? e.message : "Не удалось загрузить автомобиль",
      );
    } finally {
      if (requestId === vehicleRequest.current) setVehicleLoading(false);
    }
  }
  async function openEvidenceRecord(target: RecordTarget) {
    const navigation = ++evidenceNavigation.current;
    const generation = authBoundary.generation;
    const isCurrent = () => navigation === evidenceNavigation.current && authBoundary.isCurrent(generation);
    try {
      if (selectedRef.current !== target.vehicleId) await selectVehicle(target.vehicleId);
      if (!isCurrent() || selectedRef.current !== target.vehicleId) return;
      const [fresh, latest] = await Promise.all([
        api<Vehicle>(`/api/vehicles/${encodeURIComponent(target.vehicleId)}`),
        api<Data>("/api/bootstrap"),
      ]);
      if (!isCurrent() || selectedRef.current !== target.vehicleId) return;
      if (!latest.vehicles.some((item) => item.id === fresh.id)) throw new Error("Автомобиль удалён или больше недоступен.");
      setData({ ...latest, vehicles: latest.vehicles.map((item) => item.id === fresh.id ? fresh : item) });
      const resolved = resolveRecord(target, fresh, latest.requests);
      if (!resolved) throw new Error("Эта запись удалена или больше не относится к выбранному автомобилю.");
      setPage("Карточка");
      setTab(resolved.tab);
      if (target.kind === "history") setHistoryPage(Math.floor(resolved.index / 20));
      if (target.kind === "request") {
        const request = latest.requests.find((item) => item.id === target.recordId && item.vehicleId === target.vehicleId);
        if (!request) throw new Error("Заявка удалена или недоступна.");
        setActiveRequest(request);
      }
      setError("");
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : "Не удалось открыть актуальную запись.");
    }
  }
  useEffect(() => {
    if (!vehicle?.id) return;
    let active = true;
    api<{ parts: Part[] }>(
      `/api/parts?vehicleId=${encodeURIComponent(vehicle.id)}&q=${encodeURIComponent(partsQuery)}`,
    )
      .then((result) => {
        if (active) {
          setParts(result.parts);
          setPartsError("");
        }
      })
      .catch((e) => {
        if (active)
          setPartsError(
            e instanceof Error
              ? e.message
              : "Не удалось загрузить каталог деталей",
          );
      });
    return () => {
      active = false;
    };
  }, [vehicle?.id, partsQuery]);
  useEffect(() => {
    if (!modal || form.type !== "procurement" || !vehicle?.id) { setProcurementCatalog({ vehicleId: "", parts: [], error: "" }); return; }
    let active = true;
    const id = vehicle.id;
    setProcurementCatalog({ vehicleId: "", parts: [], error: "" });
    api<{ parts: Part[] }>(`/api/parts?vehicleId=${encodeURIComponent(id)}&q=`)
      .then(({ parts: catalog }) => {
        if (!active || selectedRef.current !== id) return;
        setProcurementCatalog({ vehicleId: id, parts: catalog, error: "" });
        if (!requestPartId) return;
        const selectedPart = catalog.find((part) => part.id === requestPartId);
        if (!selectedPart) {
          setRequestPartId("");
          setProcurementConfirmed(false);
          setProcurementCatalog({ vehicleId: id, parts: catalog, error: "Позиция черновика отсутствует в каталоге этой машины. Сверьте наименование и количество." });
          return;
        }
      })
      .catch((cause) => {
        if (active && selectedRef.current === id) {
          setProcurementCatalog({ vehicleId: id, parts: [], error: cause instanceof Error ? cause.message : "Не удалось загрузить каталог для этой машины." });
          setProcurementConfirmed(false);
        }
      });
    return () => { active = false; };
  }, [modal, form.type, vehicle?.id]);
  const visible = useMemo(
    () =>
      (
        data?.vehicles.filter(
          (v) =>
            (filter === "all" || v.status === filter || v.vehicleType?.toLowerCase() === filter) &&
            (plateMatches(v.plate, query) || `${v.plate} ${v.model} ${v.engine} ${v.vehicleType || ""} ${v.driver} ${v.route}`
              .toLowerCase()
              .includes(query.trim().toLowerCase())),
        ) || []
      ).sort((a, b) => vehicleRank(a.status) - vehicleRank(b.status)),
    [data, filter, query],
  );
  const fleetPageSize = 12;
  const fleetPageCount = Math.max(1, Math.ceil(visible.length / fleetPageSize));
  const visibleFleetPage = visible.slice(fleetPage * fleetPageSize, (fleetPage + 1) * fleetPageSize);
  const historyPageSize = 20;
  const historyPageCount = Math.max(1, Math.ceil((vehicle?.history.length || 0) / historyPageSize));
  const visibleHistoryPage = vehicle?.history.slice(historyPage * historyPageSize, (historyPage + 1) * historyPageSize) || [];
  useEffect(() => setHistoryPage(0), [vehicle?.id]);
  async function saveInspection(status: "draft" | "completed") {
    if (!vehicle || vehicleLoading) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/vehicles/${vehicle.id}/inspection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, status }),
      });
      updateVehicleDraft(vehicle.id, { items });
      await reload(selectedRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить осмотр");
    } finally {
      setBusy(false);
    }
  }
  async function addNote() {
    if (!vehicle || vehicleLoading || !note.trim()) return;
    setBusy(true);
    try {
      await api(`/api/vehicles/${vehicle.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: note.trim(), category: noteCategory }),
      });
      setNote("");
      updateVehicleDraft(vehicle.id, { note: "" });
      await reload(selectedRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить заметку");
    } finally {
      setBusy(false);
    }
  }
  async function setNoteStatus(noteId: string, status: "open" | "resolved") {
    if (!vehicle) return;
    setBusy(true);
    try {
      const result = await api<{ vehicle: Vehicle }>(
        `/api/vehicles/${vehicle.id}/notes/${noteId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      setData((d) =>
        d
          ? {
              ...d,
              vehicles: d.vehicles.map((v) =>
                v.id === result.vehicle.id ? result.vehicle : v,
              ),
            }
          : d,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить заметку");
    } finally {
      setBusy(false);
    }
  }
  async function saveKit() {
    if (!vehicle || vehicleLoading) return;
    setBusy(true);
    try {
      const fresh = await api<Vehicle>(`/api/vehicles/${vehicle.id}/parts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: kitDraft }),
      });
      setData((d) =>
        d
          ? {
              ...d,
              vehicles: d.vehicles.map((v) => (v.id === fresh.id ? fresh : v)),
            }
          : d,
      );
      setKitDraft(fresh.partsKit || []);
      updateVehicleDraft(vehicle.id, { kit: fresh.partsKit || [] });
    } catch (e) {
      setPartsError(
        e instanceof Error ? e.message : "Не удалось сохранить набор",
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadReport() {
    if (!vehicle || vehicleLoading) return;
    const id = vehicle.id;
    const requestId = ++reportRequest.current;
    setBusy(true);
    try {
      const snapshot = await api<Record<string, unknown>>(
        `/api/vehicles/${id}/report`,
      );
      if (requestId === reportRequest.current && selectedRef.current === id)
        setReport(snapshot);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сформировать отчёт",
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!vehicle || vehicleLoading || !file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api(`/api/vehicles/${vehicle.id}/attachments`, {
        method: "POST",
        body: fd,
      });
      await reload(selectedRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить файл");
    } finally {
      setBusy(false);
    }
  }
  const buyingPart = form.type === "procurement";
  const vehicleCatalog = procurementCatalog.vehicleId === vehicle?.id ? procurementCatalog.parts : [];
  function suggestedPurchaseQuantity(partId: string, quantity = 1) {
    if (!vehicle) return "";
    const plan = maintenancePlan?.vehicleId === vehicle.id ? maintenancePlan : null;
    const demand = Math.max(quantity, getPartFallbackDemand(vehicle, plan, partId));
    const { uncovered } = getProcurementBalance(data?.requests || [], vehicle.id, partId, demand);
    return uncovered > 0 ? String(uncovered) : "";
  }
  const selectedPurchasePart = vehicleCatalog.find((part) => part.id === requestPartId);
  const purchaseName = requestPartId ? selectedPurchasePart?.name || "" : requestPartOther.trim();
  const purchaseMatches = buyingPart && modal && !requestPartId ? vehicleCatalog.filter((part) =>
    `${part.name} ${part.sku}`.toLocaleLowerCase().includes(requestPartOther.trim().toLocaleLowerCase())
  ).slice(0, 4) : [];
  async function createRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicle) return;
    if (form.type === "procurement") {
      const confirmed = (e.currentTarget as HTMLFormElement).elements.namedItem("confirmProcurement") as HTMLInputElement | null;
      const catalogPart = procurementCatalog.parts.find((part) => part.id === requestPartId);
      if (requestPartId && procurementCatalog.vehicleId !== vehicle.id) { setError("Дождитесь каталога, привязанного к текущей машине."); return; }
      if (requestPartId && !catalogPart) { setError("Выбранная деталь отсутствует в актуальном каталоге этой машины."); return; }
      if (!catalogPart && !requestPartOther.trim()) { setError("Выберите деталь из каталога или укажите другую деталь."); return; }
      if (!Number.isSafeInteger(Number(requestPartQty)) || Number(requestPartQty) < 1 || Number(requestPartQty) > 10000) { setError("Укажите количество деталей от 1 до 10 000."); return; }
      if (!confirmed?.checked || !procurementConfirmed) { setError("Подтвердите состав внутренней заявки на закупку."); return; }
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId: vehicle.id,
          type: form.type,
          title: buyingPart && (!form.title.trim() || form.title === "Черновик закупки" || form.title === `Закупить: ${form.part}`) ? `Закупить: ${purchaseName}`.slice(0, 160) : form.title,
          description: buyingPart && !form.description.trim() ? `Закупка для ${vehicle.plate}: ${purchaseName}, ${requestPartQty} шт.` : form.description,
          priority: form.priority,
          part: form.type === "procurement"
            ? purchaseName
            : parts.find((p) => p.id === requestPartId)?.name || form.part,
          quantity: Number(form.type === "procurement" ? requestPartQty : form.quantity),
          workItems: !buyingPart && requestWork.trim()
            ? [
                {
                  title: requestWork.trim(),
                  quantity: 1,
                  unit: "работа",
                  done: false,
                },
              ]
            : [],
          parts: requestPartId
            ? [
                {
                  partId: requestPartId,
                  quantity: Number(requestPartQty),
                  usedQuantity: 0,
                },
              ]
            : [],
        }),
      });
      setModal(false);
      setRequestWork("");
      setRequestPartId("");
      setRequestPartQty("1");
      setRequestPartOther("");
      setForm({
        type: "repair",
        title: "",
        description: "",
        priority: "normal",
        part: "",
        quantity: "1",
      });
      updateVehicleDraft(vehicle.id, {
        form: {
          type: "repair",
          title: "",
          description: "",
          priority: "normal",
          part: "",
          quantity: "1",
        },
        requestWork: "",
        requestPartId: "",
        requestPartQty: "1",
        requestPartOther: "",
      });
      await reload(selectedRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать заявку");
    } finally {
      setBusy(false);
    }
  }
  async function updateRequest(r: Request, status: Request["status"]) {
    setBusy(true);
    try {
      await api(`/api/requests/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          workItems: r.workItems || [],
          parts: r.parts || [],
        }),
      });
      setActiveRequest(null);
      await reload(selectedRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить заявку");
    } finally {
      setBusy(false);
    }
  }
  function changeManualOnly(enabled: boolean) {
    assistantRequest.current += 1;
    setAssistantBusy(false);
    setManualOnly(enabled);
    setAnswer("");
    setAssistantSources([]);
    setAssistantError("");
    if (enabled) {
      setWebSearch(false);
      setWebQuery("");
      setWebDomain("");
    }
  }
  function changeEngineModel(engine: string) {
    assistantRequest.current += 1;
    setAssistantBusy(false);
    setEngineModel(engine);
    setAnswer("");
    setAssistantSources([]);
    setAssistantError("");
  }
  async function askAssistant(e: React.FormEvent, prompt?: string) {
    e.preventDefault();
    if (webSearch && !webQuery.trim()) {
      setAssistantError("Введите отдельный запрос для открытого веб-поиска.");
      return;
    }
    const userMessage = (prompt ?? message).trim();
    if (chatLoadedScope !== chatScope || !userMessage || (manualOnly && !engineModel)) return;
    const requestId = ++assistantRequest.current;
    const requestedVehicleId = manualOnly ? null : assistantVehicle?.id || null;
    const assistantRequestDraft = assistantVehicle && (page === "Заявки" && activeRequest || (page === "Карточка" && (modal || tab === "planning")))
      ? tab === "planning" && page === "Карточка" && !modal
        ? {
            type: "repair",
            title: planningTitle,
            description: `Наблюдение механика: ${planningObservation}`,
            workItems: [{ title: planningTitle, quantity: 1, unit: "работа", done: false, urgency: workUrgency }],
            parts: Object.entries(plannedParts).filter(([, value]) => Number(value.quantity) > 0).map(([partId, value]) => ({ partId, quantity: Number(value.quantity), usedQuantity: 0, urgency: value.urgency })),
          }
        : activeRequest ? {
            type: activeRequest.type,
            title: activeRequest.title,
            description: activeRequest.description,
            workItems: activeRequest.workItems || [],
            parts: activeRequest.parts || [],
          }
        : {
            type: form.type,
            title: form.title,
            description: [form.description, requestDraft.trim()].filter(Boolean).join("\n"),
            workItems: requestWork.trim() ? [{ title: requestWork.trim(), quantity: 1, unit: "работа", done: false }] : [],
            parts: requestPartId ? [{ partId: requestPartId, quantity: Number(requestPartQty), usedQuantity: 0 }] : [],
          }
      : undefined;
    const nextHistory = [
      ...chatHistory,
      { role: "user" as const, content: userMessage },
    ].slice(-12);
    chatPinnedToBottom.current = true;
    setChatHistory(nextHistory);
    setProgressiveAnswer(null);
    setAssistantBusy(true);
    setAssistantError("");
    setAnswer("");
    setAssistantSources([]);
    try {
      const result = manualOnly
        ? await api<{
            answer?: string;
            results: { manual: { id: string; title: string }; pdfPage: number; text: string; url: string }[];
          }>("/api/manuals/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ engineModel, query: userMessage }),
          }).then(({ results, answer: manualAnswer }) => {
            const sources: Source[] = results.map((item) => ({
              id: item.manual.id,
              title: item.manual.title,
              type: "manual",
              url: item.url,
              description: item.text,
              tags: [],
              manual: item.manual.title,
              pdfPage: item.pdfPage,
            }));
            const excerpts = results.map((item) => {
              const excerpt = item.text.trim().replace(/\s+/g, " ");
              return `PDF, стр. ${item.pdfPage}: ${excerpt.length > 420 ? `${excerpt.slice(0, 420).trimEnd()}…` : excerpt}`;
            });
            return {
              answer: manualAnswer ?? (results.length
                ? `Короткие фрагменты из руководства ${engineModel} (полные страницы — по ссылкам):\n\n${excerpts.join("\n\n")}`
                : `В выбранных руководствах для ${engineModel} подходящих фрагментов не найдено. Данных недостаточно для ответа.`),
              sources,
              evidence: undefined,
            };
          })
        : await api<{
            answer: string;
            sources: Source[];
            model: string;
            evidence?: AssistantEvidence;
          }>("/api/assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vehicleId: requestedVehicleId,
              language: interfaceLanguage,
              ...(assistantEngineModel ? { engineModel: assistantEngineModel } : {}),
              message: userMessage,
              webSearch,
              ...(webSearch ? { webQuery: webQuery.trim(), ...(webDomain ? { webDomain } : {}) } : {}),
              history: assistantHistoryForRequest(chatHistory),
              ...(assistantRequestDraft ? { requestDraft: assistantRequestDraft } : {}),
            }),
          });
      if (requestId === assistantRequest.current) {
        setAnswer(result.answer);
        setAssistantSources(result.sources || []);
        const completedHistory = [
            ...nextHistory,
            {
              role: "assistant" as const,
              content: result.answer,
              sources: result.sources || [],
              evidence: result.evidence,
              webSearch,
              ...(webDomain ? { webDomain } : {}),
            },
          ].slice(-12);
        setChatHistory(completedHistory);
        if (!prefersReducedMotion) setProgressiveAnswer({ scope: chatScope, index: completedHistory.length - 1, full: result.answer, text: "" });
        setMessage("");
      }
    } catch (e) {
      if (requestId !== assistantRequest.current) return;
      setAssistantError(
        e instanceof Error ? e.message : "Помощник временно недоступен",
      );
    } finally {
      if (requestId === assistantRequest.current) setAssistantBusy(false);
    }
  }
  async function importTelemetry(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicle || vehicleLoading) return;
    try {
      const raw = telemetryPreview || JSON.parse(telemetryText);
      await api(`/api/vehicles/${vehicle.id}/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(raw),
      });
      setTelemetryText("");
      setTelemetryPreview(null);
      setTelemetryError("");
      await reload(selectedRef.current);
    } catch (e) {
      setTelemetryError(
        e instanceof Error ? e.message : "Не удалось импортировать запись",
      );
    }
  }
  const counts = data
    ? {
        attention: data.vehicles.filter((v) => v.status !== "ready").length,
        requests: data.requests.filter((r) => r.status !== "done").length,
        inspection: data.vehicles.filter(
          (v) => v.inspection.status !== "completed",
        ).length,
      }
    : null;
  const visibleNav = authUser?.role === "admin"
    ? [...nav, ["Пользователи", UsersIcon] as const]
    : nav;
  const enabledNav = visibleNav.filter(([label]) => label !== "Акустика" || data?.acousticDemo);
  const activeRequestClosed = Boolean(
    activeRequest &&
    data?.requests.some(
      (request) => request.id === activeRequest.id && request.status === "done",
    ),
  );
  async function saveIssueZone(
    zoneId: IssueZoneId,
    status: NonNullable<Vehicle["issueZones"]>[number]["status"],
    zoneNote: string,
  ) {
    const vehicleId = selectedRef.current;
    if (!vehicleId || zoneSavingRef.current || selectedZoneRef.current !== zoneId) return;
    const vehicleEpoch = vehicleRequest.current;
    zoneSavingRef.current = true;
    const requestId = ++zoneSaveRequest.current;
    setZoneSaving(true);
    setZoneSaveError("");
    try {
      const updated = await api<Vehicle>(`/api/vehicles/${encodeURIComponent(vehicleId)}/issue-zones/${encodeURIComponent(zoneId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: zoneNote }),
      });
      if (
        requestId !== zoneSaveRequest.current ||
        selectedRef.current !== vehicleId ||
        vehicleRequest.current !== vehicleEpoch
      ) {
        if (selectedRef.current === vehicleId && vehicleRequest.current !== vehicleEpoch) {
          const refreshEpoch = vehicleRequest.current;
          try {
            const fresh = await api<Vehicle>(`/api/vehicles/${encodeURIComponent(vehicleId)}`);
            if (selectedRef.current === vehicleId && vehicleRequest.current === refreshEpoch) {
              const savedZone = fresh.issueZones?.find((item) => item.id === zoneId);
              if (savedZone) {
                setData((current) => current ? {
                  ...current,
                  vehicles: current.vehicles.map((item) => item.id === vehicleId
                    ? {
                        ...item,
                        issueZones: [
                          ...(item.issueZones || []).filter((zone) => zone.id !== zoneId),
                          savedZone,
                        ],
                      }
                    : item),
                } : current);
              }
            }
          } catch {
            if (selectedRef.current === vehicleId && selectedZoneRef.current === zoneId && vehicleRequest.current === refreshEpoch)
              setZoneSaveError("Наблюдение сохранено, но не удалось обновить карточку. Повторно выберите эту зону.");
          }
        }
        return;
      }
      const savedZone = updated.issueZones?.find((item) => item.id === zoneId);
      if (!savedZone) return;
      setData((current) => current ? {
        ...current,
        vehicles: current.vehicles.map((item) => item.id === vehicleId
          ? {
              ...item,
              issueZones: [
                ...(item.issueZones || []).filter((zone) => zone.id !== zoneId),
                savedZone,
              ],
            }
          : item),
      } : current);
    } catch {
      if (requestId === zoneSaveRequest.current && selectedRef.current === vehicleId && selectedZoneRef.current === zoneId && vehicleRequest.current === vehicleEpoch)
        setZoneSaveError("Не удалось сохранить наблюдение. Проверьте соединение и повторите попытку.");
    } finally {
      if (requestId === zoneSaveRequest.current) {
        zoneSavingRef.current = false;
        setZoneSaving(false);
      }
    }
  }
  const [chatWidth, setChatWidth] = useState(() => Math.max(28, Number(localStorage.getItem("mehay-chat-width")) || 42));
  const [maxChatWidth, setMaxChatWidth] = useState(48);
  useEffect(() => {
    if (!chatOpen) return;
    const measure = () => setMaxChatWidth(Math.max(28, Math.ceil(document.documentElement.clientWidth / parseFloat(getComputedStyle(document.documentElement).fontSize))));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [chatOpen]);
  const chatWidthControl = <label className="chat-width-setting">{t("Ширина чата", interfaceLanguage)}
    <input type="range" min={28} max={maxChatWidth} value={Math.min(maxChatWidth, chatWidth)} onChange={event => setChatWidth(Number(event.target.value))} />
  </label>;
  const [busyLabel, setBusyLabel] = useState("Сверяю контекст");
  const [progressiveAnswer, setProgressiveAnswer] = useState<{ scope: string; index: number; full: string; text: string } | null>(null);
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  useEffect(() => { localStorage.setItem("mehay-chat-width", String(chatWidth)); }, [chatWidth]);
  useEffect(() => {
    if (!assistantBusy) return;
    const labels = ["Сверяю контекст", "Проверяю источники", "Формулирую ответ"];
    let index = 0;
    setBusyLabel(labels[0]);
    const timer = window.setInterval(() => { index = (index + 1) % labels.length; setBusyLabel(labels[index]); }, 1600);
    return () => window.clearInterval(timer);
  }, [assistantBusy]);
  useEffect(() => {
    if (!progressiveAnswer || prefersReducedMotion) { setProgressiveAnswer(null); return; }
    const chars = Array.from(progressiveAnswer.full);
    let shown = 0;
    const timer = window.setInterval(() => {
      shown = Math.min(chars.length, shown + Math.max(4, Math.ceil(chars.length / 90)));
      if (shown >= chars.length) { window.clearInterval(timer); setProgressiveAnswer(null); }
      else setProgressiveAnswer((current) => current ? { ...current, text: chars.slice(0, shown).join("") } : null);
    }, 22);
    return () => window.clearInterval(timer);
  }, [progressiveAnswer?.scope, progressiveAnswer?.index, progressiveAnswer?.full, prefersReducedMotion]);
  useEffect(() => {
    if (!chatPinnedToBottom.current) return;
    const thread = chatThreadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [chatHistory, assistantBusy, progressiveAnswer]);
  if (authLoading) return <div className={`auth-screen ${theme}`} role="status"><span className="auth-loader" aria-hidden="true" /><p>Проверяем сеанс…</p></div>;
  const requestDescriptionFields = modal && <>
    <label>
      Краткое название
      <input
        required={!buyingPart}
        maxLength={160}
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        placeholder="Например, заменить передние колодки"
      />
    </label>
    <label>
      Описание
      <textarea
        required={!buyingPart}
        maxLength={3000}
        value={form.description}
        onChange={(e) =>
          setForm({ ...form, description: e.target.value })
        }
        placeholder="Опишите задачу и важные детали"
      />
    </label>
  </>;
  const renderChatEntry = (entry: ChatMessage, i: number) => (
                <article
                  className={`chat-message ${entry.role}`}
                  key={`${i}-${entry.role}`}
                >
                  <b>{entry.role === "user" ? "Вы" : "Мехай"}</b>
                  {entry.role === "assistant" ? <AssistantAnswer
                    answer={progressiveAnswer?.scope === chatScope && progressiveAnswer.index === i ? progressiveAnswer.text : entry.content}
                    evidence={entry.evidence}
                    sources={entry.sources}
                    webSearch={entry.webSearch}
                    webDomain={entry.webDomain}
                    appPath={appPath}
                    onOpen={(target) => {
                      window.history.pushState({}, "", `${appPath("/app")}${recordSearch(target)}`);
                      setRoute("/app");
                      void openEvidenceRecord(target);
                    }}
                  /> : <p>{entry.content}</p>}
                  {entry.role === "user" && entry.sources?.map(
                    (s) =>
                      sourceUrl(s) && (
                        <a
                          key={s.url}
                          href={sourceUrl(s)!}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="chat-source-type">{s.manual ? `${s.manual}${s.pdfPage ? ` · PDF, стр. ${s.pdfPage}` : ""}` : s.type === "community" ? "Сообщество" : s.type === "manual" ? "Руководство" : "Открытый источник"}</span>
                          {s.title || s.url}
                        </a>
                      ),
                  )}
                </article>
  );
  if (!authUser) return (
    <main className={`auth-screen ${theme}`}>
      <section className="auth-card">
        <div className="auth-brand"><Wrench size={24} /><span>Мехай</span><small>Механик с AI</small></div>
        <h1>{setupRequired ? "Первичная настройка" : "Вход в рабочее пространство"}</h1>
        <p>{setupRequired ? "Создайте учётную запись администратора для этого парка." : "Введите данные учётной записи, выданные администратором."}</p>
        <form onSubmit={submitAuth}>
          {setupRequired && <label>Имя сотрудника<input autoComplete="name" required value={authForm.displayName} onChange={(e) => setAuthForm({ ...authForm, displayName: e.target.value })} /></label>}
          <label>Имя пользователя<input autoComplete="username" required value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} /></label>
          <label>Пароль<input type="password" autoComplete={setupRequired ? "new-password" : "current-password"} required minLength={setupRequired ? 8 : undefined} maxLength={128} value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} /><small>{setupRequired ? "От 8 до 128 символов" : "До 128 символов"}</small></label>
          {authError && <p className="auth-error" role="alert">{authError}</p>}
          <button className="auth-submit" type="submit" disabled={authBusy || authForm.password.length > 128 || (setupRequired && authForm.password.length < 8) || !authForm.password || !authForm.username.trim() || (setupRequired && !authForm.displayName.trim())}>
            {authBusy && <span className="auth-loader small" aria-hidden="true" />}
            {authBusy ? "Выполняется вход…" : setupRequired ? "Создать администратора" : "Войти"}
          </button>
        </form>
      </section>
    </main>
  );
  return (
    <>
      <div className="shell" data-theme={theme}>
        <aside className={`sidebar ${mobile ? "open" : ""}`}>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage("Обзор");
            }}
          >
            <span className="brandmark">
              <Wrench size={19} />
            </span>
            <span>
              Мехай<small>Механик с AI</small>
            </span>
          </a>
          <div className="side-label">РАБОЧИЙ СТОЛ</div>
          <nav>
            {enabledNav.map(([label, Icon]) => (
              <button
                key={label}
                className={`nav-item ${page === label ? "active" : ""}`}
                onClick={() => {
                  setPage(label);
                  setMobile(false);
                }}
              >
                <Icon size={17} />
                <span>{translateSystemText(label, interfaceLanguage)}</span>
                {label === "Заявки" && counts?.requests ? (
                  <i>{counts.requests}</i>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="side-bottom">
            <div className="system-status">
              <span className="pulse" />
              Локальная система<small>Сервер подключён</small>
            </div>
            <div className="profile">
              <div className="avatar">{authUser.displayName.slice(0, 2).toLocaleUpperCase("ru-RU")}</div>
              <span>
                {authUser.displayName}<small>{authUser.role === "admin" ? "Администратор" : "Механик"}</small>
              </span>
              <button type="button" className="logout-button" onClick={() => void logout()} aria-label="Выйти из учётной записи" title="Выйти"><LogOut size={16} /></button>
            </div>
          </div>
        </aside>
        <main>
          <header className="topbar">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Открыть меню"
            >
              <Menu size={19} />
            </button>
            <div className="crumb">
              Рабочий стол <span>/</span> {translateSystemText(page, interfaceLanguage)}
            </div>
            <div className="top-actions">
              {data && <nav className="header-assistant-actions" aria-label={t("Быстрая навигация", interfaceLanguage)}>
                {(["question", "voice"] as const).map((mode) => {
                  const label = t(mode === "voice" ? "Голосовое управление механика" : "Задать вопрос", interfaceLanguage);
                  return <button key={mode} type="button" title={label} aria-label={label} aria-haspopup="dialog" onClick={() => openHeaderAssistant(mode)}>
                    {mode === "voice" ? <Mic size={18} /> : <MessageSquareText size={18} />}<span>{mode === "voice" ? t("Голосовой ввод", interfaceLanguage) : label}</span>
                  </button>;
                })}
              </nav>}
              <SystemLanguagePicker />
              <span className="date-chip">
                <Clock3 size={14} />
                {new Date().toLocaleDateString(interfaceLanguage, {
                  weekday: "short",
                  day: "numeric",
                  month: "long",
                })}
              </span>
              <span className="demo-chip">Демо-парк</span>
              <button
                className="theme-toggle"
                type="button"
                aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
                title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
                onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                <span>{theme === "dark" ? "Светлая" : "Тёмная"}</span>
              </button>
              <div className="top-avatar" title={authUser.displayName}>{authUser.displayName.slice(0, 2).toLocaleUpperCase("ru-RU")}</div>
            </div>
          </header>
          {error && (
            <div className="error-banner">
              <AlertTriangle size={17} />
              {interfaceText(error)}
              <button onClick={() => setError("")} aria-label="Закрыть">
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <div className="loading" role="status" aria-live="polite">
              <PSpinner size="md" aria={{ "aria-label": interfaceText(error ? "Ошибка загрузки" : "Загружаем парк") }} />
              <strong>{error ? "Проверьте соединение с сервером" : "Загружаем парк…"}</strong>
              {error && (
                <button
                  className="button secondary"
                  onClick={() => void reload()}
                >
                  Повторить
                </button>
              )}
              {!error && <div className="loading-skeleton" aria-hidden="true"><span /><span /><span /><span /></div>}
            </div>
          ) : (
            <>
              {page === "Пользователи" && authUser.role === "admin" && <><AdminUsersPanel /><AdminVehicleAssignments /><AdminQaReview api={api} /></>}
              {(page === "Обзор" || page === "Карточка") && (
                <>
                  <section className="page-heading">
                    <div>
                      {page === "Карточка" && vehicle && (
                        <button
                          className="text-link back-fleet"
                          onClick={() => setPage("Автопарк")}
                        >
                          ← Все машины
                        </button>
                      )}
                      {page === "Карточка" && vehicle ? (
                        <div className="heading-plate">
                          <Plate value={vehicle.plate} size="large" />
                          <h1>{vehicle.model}</h1>
                          <VehicleStatus vehicle={vehicle} />
                        </div>
                      ) : (
                        <h1>Автопарк</h1>

                      )}
                      <p>
                        {page === "Карточка" && vehicle
                          ? `${vehicle.year} · ${vehicle.color || "Цвет не указан"} · ${vehicle.driver} · ${vehicle.route}`
                          : translateSystemText("Сначала машины с проблемами и открытыми работами.", interfaceLanguage)}
                      </p>
                    </div>
                    <PButton type="button"
                      variant="primary"
                      onClick={(event) => { modalTriggerRef.current = event.currentTarget; setModal(true); }}
                      disabled={!vehicle}
                    >
                      <Plus size={16} /> Новая заявка
                    </PButton>
                  </section>
                  {page === "Обзор" && (
                    <section className="overview-strip">
                      <div>
                        <strong>{data.vehicles.length}</strong>
                        <span>автомобилей в парке</span>
                      </div>
                      <div className="strip-divider" />
                      <div>
                        <strong
                          className={counts!.attention ? "text-amber" : ""}
                        >
                          {counts!.attention}
                        </strong>
                        <span>требуют внимания</span>
                      </div>
                      <div className="strip-divider" />
                      <div>
                        <strong>{counts!.requests}</strong>
                        <span>открытых заявок</span>
                      </div>
                      <div className="strip-divider" />
                      <div>
                        <strong>{counts!.inspection}</strong>
                        <span>осмотров не завершено</span>
                      </div>
                    </section>
                  )}
                  <div
                    className={`dashboard-grid ${page === "Карточка" ? "vehicle-workspace" : "overview-workspace"}`}
                  >
                    {page === "Обзор" && <DiagnosticQueue vehicles={data.vehicles} requests={data.requests} acoustic={fleetScope === "customer"} onOpen={(id, tab, session) => { void selectVehicle(id, session); setTab(tab); }} onRequest={setActiveRequest} />}
                    {page === "Карточка" && (
                      <section className="panel vehicle-panel">
                        {vehicle ? (
                          <>
                            <PTabs
                              className="vehicle-tabs"
                              activeTabIndex={Math.max(0, vehicleTabs.findIndex(([key]) => key === tab))}
                              size="medium"
                              onUpdate={(event) => {
                                const nextTab = vehicleTabs[event.detail.activeTabIndex]?.[0];
                                if (nextTab) {
                                  setTab(nextTab);
                                  if (nextTab === "inspection") setItems(vehicle.inspection.items);
                                  if (nextTab === "planning") void loadMaintenancePlan(vehicle.id);
                                }
                              }}
                            >
                              {vehicleTabs.map(([key, label]) => <PTabsItem key={key} label={translateSystemText(label, interfaceLanguage)} />)}
                            </PTabs>
                            {tab === "summary" && (
                              <div className="vehicle-content">
                            <details className="vehicle-passport"><summary>Паспорт, фото и сотрудники</summary><div className="vehicle-cover">
                              <div className="vehicle-title">
                                <div>
                                  <p>
                                    {[vehicle.year, vehicle.vin && `VIN ${vehicle.vin}`].filter(Boolean).join(" · ")}
                                  </p>
                                  {vehicle.color && (
                                    <span className="vehicle-color">
                                      <i
                                        style={{
                                          backgroundColor: vehicleColor(
                                            vehicle.color,
                                          ),
                                        }}
                                      />
                                        {vehicle.color}
                                    </span>
                                  )}
                                </div>
                                {vehicle.photo?.url ? (
                                  <figure className="vehicle-photo">
                                    <div className="vehicle-photo-frame">
                                      <img
                                        src={appPath(vehicle.photo.url)}
                                        alt={vehicle.photo.label || `Фото модели ${vehicle.model}`}
                                        decoding="async"
                                        fetchPriority="high"
                                      />
                                      <Plate
                                        value={vehicle.plate}
                                        size="compact"
                                      />
                                    </div>
                                    <figcaption>
                                      {vehicle.photo.label || "Фото модели"} · демо
                                      {vehicle.photo.credit && (
                                        <span> · {vehicle.photo.credit}</span>
                                      )}
                                      {safeUrl(
                                        vehicle.photo.sourceUrl || "",
                                      ) && (
                                        <a
                                          href={safeUrl(
                                            vehicle.photo.sourceUrl || "",
                                          )!}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          Источник
                                        </a>
                                      )}
                                    </figcaption>
                                  </figure>
                                ) : null}
                              </div>
                              <div className="route-line">
                                <span>{vehicle.route}</span>
                                <span>·</span>
                                <span>{vehicle.driver}</span>
                                <span className="live-mark">
                                  Запись {date(vehicle.lastSeen)}
                                </span>
                              </div>
                              {vehicle.crew && <details className="vehicle-crew">
                                <summary>Сотрудники гаража</summary>
                                <dl>{([
                                  ["Механик", vehicle.crew.mechanic], ["Эксперт-механик", vehicle.crew.expert],
                                  ["Технолог", vehicle.crew.technologist], ["Специалист по закупкам", vehicle.crew.buyer],
                                  ["Шеф гаража", vehicle.crew.chief],
                                ]).map(([role, name]) => <div key={role}><dt>{role}</dt><dd>{name}</dd></div>)}</dl>
                              </details>}
                            </div></details>
                                {vehicle.neuroVehicleId && <VehicleMeasurementSummary key={vehicle.neuroVehicleId} vehicleId={vehicle.neuroVehicleId} />}
                                <div className="vehicle-facts-grid">
                                  <article className="fact-card mileage-fact">
                                    <div className="metric-label"><Gauge size={17} /><span>Пробег · ручная запись</span></div>
                                    <strong>{rub(vehicle.odometerKm)} <small>км</small></strong>
                                    <small>Записан {date(vehicle.lastSeen)} · ТО через {rub(Math.max(0, vehicle.nextServiceKm - vehicle.odometerKm))} км</small>
                                  </article>
                                  <article className="fact-card">
                                    <div className="metric-label"><Radio size={17} /><span>Пробег · OBD</span></div>
                                    <strong>{vehicle.obdOdometerKm ? `${rub(vehicle.obdOdometerKm)} км` : "Нет данных"}</strong>
                                    <small>{vehicle.telemetry.length ? `Последняя запись ${date(vehicle.telemetry[0].recordedAt)}` : "Телеметрия не передана"}</small>
                                  </article>
                                  <article className="fact-card engine-fact">
                                    <div className="metric-label"><Thermometer size={17} /><span>Двигатель и OBD</span></div>
                                    <strong>{vehicle.dtcs.length ? `Коды ЭБУ: ${vehicle.dtcs.length}` : vehicle.telemetry.length ? "Ошибок ЭБУ нет" : "Нет данных ЭБУ"}</strong>
                                    <small>{vehicle.telemetry.length ? `${vehicle.engine} · ${vehicle.coolantTemp}°C · ${vehicle.batteryVoltage} В · топливо ${vehicle.fuelLevel}%` : "Параметры двигателя не переданы"}</small>
                                  </article>
                                  <article className="fact-card">
                                    <div className="metric-label"><CircleHelp size={17} /><span>Шины</span></div>
                                    <strong>{vehicle.tires?.positions?.length ? `${vehicle.tires.positions.filter((t) => t.treadDepthMm !== null).length} измерений` : "Нет измерений"}</strong>
                                    <small>{vehicle.tires?.positions?.length ? vehicle.tires.positions.map((t) => `${t.position}: ${t.treadDepthMm === null ? "—" : `${t.treadDepthMm} мм`}`).join(" · ") : "Глубина протектора не передана"}</small>
                                    {vehicle.tires?.demo && <small>Демо-замер {date(vehicle.tires.measuredAt)}</small>}
                                  </article>
                                  <article className="fact-card parts-fact">
                                    <div className="metric-label"><Boxes size={17} /><span>Комплект деталей</span></div>
                                    <strong>{vehicle.partsKit?.length ? `${vehicle.partsKit.filter((p) => p.status === "present").length} есть · ${vehicle.partsKit.filter((p) => p.status === "missing").length} нет` : "Не заполнен"}</strong>
                                    <small>{vehicle.partsKit?.length ? `${vehicle.partsKit.filter((p) => p.status === "unknown").length} позиций без проверки` : "Состав комплекта не указан"}</small>
                                  </article>
                                </div>
                                {(() => {
                                  const vehicleRequests = data.requests.filter((request) => request.vehicleId === vehicle.id);
                                  const procurementRequests = vehicleRequests.filter((request) => request.type === "procurement");
                                  const procurementHistory = vehicle.history.filter((entry) => entry.part || entry.parts?.length || /закуп|поставк|сверк/i.test(`${entry.type} ${entry.title} ${entry.description} ${entry.result || ""}`));
                                  const savedPlans = vehicleRequests.filter((request) => request.plan?.lines?.length).map((request) => ({ label: `${request.title} · ${date(request.createdAt)}`, lines: request.plan!.lines! }));
                                  const currentPlan = maintenancePlan?.vehicleId === vehicle.id ? maintenancePlan : null;
                                  const repairParts = vehicleRequests.filter((request) => request.type === "repair" && request.status !== "done" && request.approvalStatus !== "rejected").flatMap((request) => request.parts || []);
                                  const fallbackNeeds = [
                                    ...(vehicle.partsKit?.filter((item) => item.status === "missing" && item.quantity > 0).map((item) => ({ id: item.partId, quantity: item.quantity, label: `${parts.find((part) => part.id === item.partId)?.name || item.partId} · отсутствует в комплекте` })) || []),
                                    ...(currentPlan?.parts.filter((part) => part.purchasePreview.status !== "in_stock" && !vehicle.partsKit?.some((item) => item.partId === part.id && item.status === "present")).map((part) => ({ id: part.id, quantity: 1, label: `${part.name} · ${purchaseStatusLabel(part.purchasePreview.status)}` })) || []),
                                  ];
                                  const needOptions = new Map<string, { quantity: number; label: string }>();
                                  for (const part of repairParts) {
                                    if (!needOptions.has(part.partId)) needOptions.set(part.partId, { quantity: 0, label: part.name || part.sku || catalogPartName(part.partId, parts) });
                                  }
                                  for (const need of fallbackNeeds) {
                                    const existing = needOptions.get(need.id);
                                    needOptions.set(need.id, existing ? { ...existing, quantity: Math.max(existing.quantity, need.quantity) } : { quantity: need.quantity, label: need.label });
                                  }
                                  const draftOptions = [...needOptions].flatMap(([id, fallback]) => {
                                    const balance = getProcurementBalance(vehicleRequests, vehicle.id, id, Math.max(fallback.quantity, getPartFallbackDemand(vehicle, currentPlan, id)));
                                    return balance.uncovered > 0 ? [{ id, quantity: balance.uncovered, label: `${fallback.label} · потребность ${balance.demand}, уже заказано ${balance.activeProcurement}, осталось ${balance.uncovered}` }] : [];
                                  });
                                  const historyParts = procurementHistory;
                                  const openProcurementDraft = (id?: string, quantity = 1) => {
                                    const sourceQuantity = String(quantity);
                                    setError(""); setRequestPartOther(""); setRequestPartId(id || ""); setRequestPartQty(String(sourceQuantity)); setRequestWork(""); setProcurementConfirmed(false);
                                    setForm({ type: "procurement", title: "Черновик закупки", description: "Внутренняя заявка по данным карточки. Проверьте наименование и количество перед созданием; заказ поставщику не отправляется.", priority: "normal", part: "", quantity: String(sourceQuantity) });
                                    setModal(true);
                                  };
                                  return <section className="planning-saved purchase-history" aria-label="Закупки и источники сверки">
                                    <h3>Закупки и сверка</h3>
                                    <div className="request-facts"><strong>Заявки на закупку · {procurementRequests.length}</strong><PButton type="button" variant="primary" onClick={() => openProcurementDraft(draftOptions[0]?.id, draftOptions[0]?.quantity)}><Plus size={16} /> Начать заявку</PButton></div>
                                    <details><summary>История заявок, действия и источники сверки</summary>
                                      <h4>Зарегистрированные закупки</h4>{procurementRequests.length ? procurementRequests.slice(0, 5).map((request) => <p key={request.id}><strong>{request.title}</strong><small>{date(request.createdAt)} · {request.status === "done" ? "выполнена" : request.status === "in_progress" ? "в работе" : "новая"}{request.approvalStatus ? ` · ${request.approvalStatus === "pending" ? "на согласовании" : request.approvalStatus === "approved" ? "согласована" : "отклонена"}` : ""}{request.parts?.length ? ` · ${request.parts.map((part) => `${requestPartName(request, part.partId, parts)}: ${Math.max(0, part.quantity - part.usedQuantity)} из ${part.quantity} шт.`).join("; ")}` : ""}{requestManualPart(request, parts) ? ` · ${requestManualPart(request, parts)}, ${request.quantity} шт.` : ""}</small></p>) : <p className="context-empty">Заявок на закупку пока нет.</p>}
                                      <h4>Записанные работы и действия</h4>{historyParts.length ? historyParts.slice(0, 5).map((entry) => <p key={entry.id}><strong>{entry.title}</strong><small>{date(entry.date)} · {entry.result || entry.description}{entry.part ? ` · ${entry.part}` : ""}</small></p>) : <p className="context-empty">Записей работ с деталями или действий сверки нет. Новые записи появятся после сохранения подтверждённого действия в истории машины.</p>}
                                      <h4>Сохранённые данные для сверки</h4>
                                      {currentPlan && <div><b>Рассчитанный план · {date(currentPlan.calculatedAt)}</b>{currentPlan.parts.map((part) => <p key={part.id}>{part.name} · {purchaseStatusLabel(part.purchasePreview.status)}{part.stock.quantity !== null ? ` · остаток ${part.stock.quantity} ${part.unit}` : " · остаток неизвестен"}{part.purchasePreview.orderDate ? ` · заказать ${date(part.purchasePreview.orderDate)}` : ""}</p>)}</div>}
                                      {savedPlans.length ? savedPlans.map((plan) => <div key={plan.label}><b>Снимок плана · {plan.label}</b>{plan.lines.map((line, index) => <p key={`${line.partId}-${index}`}>{line.catalog?.name || line.catalog?.sku || line.partId} · {Math.max(0, line.quantity - line.usedQuantity)} из {line.quantity} шт. в плане{line.catalog?.purchasePreview ? ` · ${purchaseStatusLabel(line.catalog.purchasePreview.status)}` : ""}</p>)}</div>) : !currentPlan && <p className="context-empty">Сохранённых планов с деталями нет.</p>}
                                      {vehicle.partsKit?.length ? <div><b>Сохранённый состав комплекта</b>{vehicle.partsKit.map((item) => <p key={item.partId}>{parts.find((part) => part.id === item.partId)?.name || item.partId} · {item.quantity} шт. · {item.status === "present" ? "отмечено как есть" : item.status === "missing" ? "отмечено как отсутствующее" : "не проверено"}</p>)}</div> : <p className="context-empty">Сохранённый состав комплекта отсутствует. Эти данные являются источниками для сверки и сами по себе не подтверждают её проведение.</p>}
                                      <small>План и комплект показаны как сохранённые данные для сравнения. Они не подтверждают, что сверка была проведена.</small>
                                    </details>
                                  </section>;
                                })()}
                                <IssueZoneMap
                                  zones={vehicle.issueZones || []}
                                  vehicleType={vehicle.vehicleType}
                                  selected={selectedZone}
                                  onSelect={(id) => {
                                    selectedZoneRef.current = id;
                                    setSelectedZone(id);
                                  }}
                                  onOpenInspection={() => setTab("inspection")}
                                  onSave={(zoneId, status, zoneNote) => void saveIssueZone(zoneId, status, zoneNote)}
                                  saving={zoneSaving}
                                  saveError={zoneSaveError}
                                />
                                {Math.abs(
                                  vehicle.odometerKm - vehicle.obdOdometerKm,
                                ) > 150 && (
                                  <div className="discrepancy">
                                    <AlertTriangle size={16} />
                                    <div>
                                      <b>Расхождение показаний</b>
                                      <span>
                                        Ручной {rub(vehicle.odometerKm)} км ·
                                        OBD {rub(vehicle.obdOdometerKm)} км
                                      </span>
                                    </div>
                                    <strong>
                                      {vehicle.odometerKm >
                                      vehicle.obdOdometerKm
                                        ? "+"
                                        : ""}
                                      {rub(
                                        vehicle.odometerKm -
                                          vehicle.obdOdometerKm,
                                      )}{" "}
                                      км
                                    </strong>
                                  </div>
                                )}
                                <div className="section-heading">
                                  <h3>Последние события</h3>
                                  <button
                                    className="text-link"
                                    onClick={() => setTab("service")}
                                  >
                                    Вся история
                                  </button>
                                </div>
                                <div className="timeline">
                                  {vehicle.history.slice(0, 2).map((h) => (
                                    <div className="timeline-item" key={h.id}>
                                      <span className="timeline-mark">
                                        <Wrench size={13} />
                                      </span>
                                      <div>
                                        <b>{h.title}</b>
                                        <p>{h.description}</p>
                                        <small>
                                          {date(h.date)} · {rub(h.odometerKm)}{" "}
                                          км
                                        </small>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {tab === "diagnostics" && (
                              <div className="vehicle-content">
                                {vehicle.neuroVehicleId && <NeuroDvsPage assistantHost={diagnosticAssistant && chatOpen ? assistantHost : null} assistantMode={headerMode} assistantOpenId={assistantOpenId} openAssistant={openHeaderAssistant} key={vehicle.id + requestedSession} cardId={vehicle.neuroVehicleId} requestedSession={requestedSession} routerConfigured={Boolean(data.ai.configured)} currentMechanic={authUser} onProcureHistorical={(part) => {
                                  const parkName = (() => { try { return window.localStorage.getItem("mehay-parts-offers-park") || "moscow"; } catch { return "moscow"; } })();
                                  setRequestPartOther(part); setRequestPartId(""); setRequestPartQty("1"); setProcurementConfirmed(false);
                                  setForm({ type: "procurement", title: `Проверить закупку: ${part}`, description: `Кандидат детали из истории ремонта; применимость не подтверждена. Парк сравнения: ${parkName}. Количество: 1. Сверьте наименование, номер и применимость перед подтверждением; заказ поставщику не отправляется.`, priority: "normal", part: part, quantity: "1" });
                                  setModal(true);
                                }} />}
                                <div className="diagnostic-callout">
                                  <div className="callout-icon">
                                    <Activity size={19} />
                                  </div>
                                  <div>
                                    <b>Данные диагностики</b>
                                    <p>
                                      Записи OBD и ошибки ЭБУ показаны отдельно
                                      от оценки модели.
                                    </p>
                                  </div>
                                </div>
                                {vehicle.dtcs.length > 0 && <section className="dtc-list" aria-labelledby="dtc-heading">
                                  <div className="section-heading"><h3 id="dtc-heading">Коды ошибок ЭБУ</h3><span className="count-tag">{vehicle.dtcs.length}</span></div>
                                  {vehicle.dtcs.map((code) => {
                                    const detail = vehicle.dtcDetails?.find((entry) => entry.code === code);
                                    const askWith = (question: string, search = false, autoSend = false, domain = "") => {
                                      assistantRequest.current += 1;
                                      setAssistantBusy(false);
                                      setAnswer(""); setAssistantSources([]); setAssistantError("");
                                      const externalSearch = search && !manualOnly;
                                      const publicContext = `Код ${code}. Автомобиль ${vehicle.model || ""}, двигатель ${vehicle.engine || "не указан"}.`;
                                      const prompt = search ? `${question} ${publicContext}` : `${question} Код ${code}${detail ? ` — ${detail.title}. ${detail.description}` : " — требуется расшифровка."} Автомобиль ${vehicle.model}, ${vehicle.year}.`;
                                      setMessage(prompt);
                                      setWebSearch(externalSearch);
                                      setWebDomain(externalSearch ? domain : "");
                                      if (externalSearch) setWebQuery(`${vehicle.model || ""} ${vehicle.engine || ""} ${code}`.trim());
                                      if (autoSend) setAutoSendPrompt(prompt);
                                      setChatOpen(true);
                                    };
                                    return <article className="dtc-card" key={code}>
                                      <div className="dtc-card-title"><code>{code}</code><div><b>{detail?.title || "Код требует расшифровки"}</b><small>{detail?.scope === "generic_code" ? "Общее описание кода · не руководство по ремонту этой модели" : "Описание кода недоступно"}</small></div></div>
                                      {detail?.description && <p>{detail.description}</p>}
                                      {detail?.source && safeUrl(detail.source.url) && <a href={safeUrl(detail.source.url)!} target="_blank" rel="noreferrer">{detail.source.title}{detail.source.page > 0 ? ` · стр. ${detail.source.page}` : ""}</a>}
                                      <div className="dtc-actions">
                                        <PButton type="button" variant="secondary" onClick={() => askWith(`Что безопасно проверить по коду ${code}?`, false, true)}>Что проверить</PButton>
                                        <PButton type="button" variant="secondary" onClick={() => askWith(`Найди сведения об ошибке ${code} в руководстве для ${vehicle.model} ${vehicle.year}`)}>Найти в руководстве</PButton>
                                        <PButton type="button" variant="secondary" onClick={() => askWith("Найди обсуждения ошибки", true, true, "drive2.ru")}>Обсуждения на Drive2 · поиск</PButton>
                                        <PButton type="button" variant="secondary" onClick={() => askWith("Найди технические документы производителя по коду", true, true, "oem")}>Документы производителя · поиск</PButton>
                                      <PButton type="button" variant="secondary" onClick={() => { setPlanningObservation((current) => appendTranscript(current, `Код ЭБУ ${code}${detail ? `: ${detail.title}` : ""}; требуется проверка`)); setPlanningTitle(`Проверить код ${code}`); revisePlanningDraft(vehicle.id); setTab("planning"); void loadMaintenancePlan(vehicle.id); }}>Добавить проверку в план</PButton>
                                      </div>
                                    </article>;
                                  })}
                                </section>}
                                <div className="section-heading">
                                  <h3>Сырые записи OBD</h3>
                                  <span className="count-tag">
                                    {vehicle.telemetry.length} записей
                                  </span>
                                </div>
                                {vehicle.telemetry.map((t) => (
                                  <details className="telemetry-row" key={t.id}>
                                    <summary>
                                      <span>
                                        <b>{t.source}</b>
                                        <small>
                                          {date(t.recordedAt)} ·{" "}
                                          {new Date(
                                            t.recordedAt,
                                          ).toLocaleTimeString("ru-RU", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </small>
                                      </span>
                                      <span className="telemetry-values">
                                        {t.odometerKm == null
                                          ? "пробег н/д"
                                          : `${rub(t.odometerKm)} км`}{" "}
                                        · {t.rpm} об/мин
                                      </span>
                                      <ChevronDown size={15} />
                                    </summary>
                                    <pre>{JSON.stringify(t.raw, null, 2)}</pre>
                                  </details>
                                ))}
                                <div className="model-box">
                                  <div className="model-label">
                                    Предварительный вывод модели ·{" "}
                                    {vehicle.ml.confidence == null ? "уверенность не определена" : `${confidencePct(vehicle.ml.confidence)}%`}
                                  </div>
                                  <b>{vehicle.ml.label}</b>
                                  <p>{vehicle.ml.detail}</p>
                                  <small>
                                    Сопоставьте эту оценку с DTC, показаниями
                                    OBD и симптомом перед решением.
                                  </small>
                                  <small>{date(vehicle.ml.recordedAt)}</small>
                                </div>
                                <form
                                  className="import-box"
                                  onSubmit={importTelemetry}
                                >
                                  <label htmlFor="raw-json">
                                    Файл или JSON телеметрии OBD{" "}
                                    <a href={appPath("/examples/telemetry.json")} download>
                                      Скачать пример JSON
                                    </a>
                                  </label>
                                  <input
                                    type="file"
                                    accept=".json,application/json,text/json"
                                    aria-label="Выбрать JSON-файл телеметрии"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      try {
                                        const text = await file.text();
                                        const parsed = JSON.parse(text);
                                        setTelemetryText(text);
                                        setTelemetryPreview(parsed);
                                        setTelemetryError("");
                                      } catch {
                                        setTelemetryPreview(null);
                                        setTelemetryError(
                                          "Файл должен содержать корректный JSON-объект.",
                                        );
                                      }
                                    }}
                                  />
                                  <textarea
                                    id="raw-json"
                                    value={telemetryText}
                                    onChange={(e) =>
                                      (() => {
                                        setTelemetryText(e.target.value);
                                        setTelemetryPreview(null);
                                      })()
                                    }
                                    placeholder={
                                      '{"recordedAt":"2026-11-15T10:00:00Z","source":"OBD адаптер","odometerKm":125000,"rpm":820,"speed":0,"coolantTemp":88,"batteryVoltage":14.1,"raw":{}}'
                                    }
                                  />
                                  {telemetryText.trim() && (
                                    <button
                                      className="button secondary small"
                                      type="button"
                                      onClick={() => {
                                        try {
                                          const parsed =
                                            JSON.parse(telemetryText);
                                          if (
                                            !parsed ||
                                            typeof parsed !== "object" ||
                                            Array.isArray(parsed)
                                          )
                                            throw new Error();
                                          setTelemetryPreview(parsed);
                                          setTelemetryError("");
                                        } catch {
                                          setTelemetryError(
                                            "Проверьте формат: нужен JSON-объект телеметрии.",
                                          );
                                          setTelemetryPreview(null);
                                        }
                                      }}
                                    >
                                      Проверить JSON
                                    </button>
                                  )}
                                  {telemetryPreview && (
                                    <div className="json-preview">
                                      <b>Предпросмотр импорта</b>
                                      <pre>
                                        {JSON.stringify(
                                          telemetryPreview,
                                          null,
                                          2,
                                        )}
                                      </pre>
                                      <small>
                                        Проверьте значения перед записью в
                                        историю.
                                      </small>
                                    </div>
                                  )}
                                  {telemetryError && (
                                    <p className="field-error">
                                      {telemetryError}
                                    </p>
                                  )}
                                  <button
                                    className="button secondary"
                                    disabled={busy || !telemetryPreview}
                                  >
                                    <CloudUpload size={15} /> Импортировать
                                  </button>
                                </form>
                              </div>
                            )}
                            {tab === "service" && (
                              <div className="vehicle-content">
                                <div className="section-heading">
                                  <h3>Работы и замены</h3>
                                  <button
                                    className="button secondary small"
                                    onClick={(event) => { modalTriggerRef.current = event.currentTarget; setModal(true); }}
                                  >
                                    <Plus size={14} /> Создать заявку
                                  </button>
                                </div>
                                {visibleHistoryPage.map((h) => (
                                  <article className="history-row" key={h.id}>
                                    <span className="history-date">
                                      {date(h.date)}
                                    </span>
                                    <span className="history-icon">
                                      <Wrench size={15} />
                                    </span>
                                    <div>
                                      <b>{h.title}</b>
                                      <p>{h.description}</p>
                                      {h.part && !h.parts?.length && (
                                        <span className="part-tag">
                                          Деталь: {h.part}
                                        </span>
                                      )}
                                      {h.parts?.length ? <small>Детали: {h.parts.map((part) => `${part.name || part.sku || catalogPartName(part.partId, parts)} × ${part.quantity}`).join(", ")}</small> : null}
                                      {h.result && <p className="history-result">Результат: {h.result}</p>}
                                    </div>
                                    <span className="history-odo">
                                      {rub(h.odometerKm)} км
                                    </span>
                                  </article>
                                ))}
                                {vehicle.history.length > historyPageSize && <Pagination current={historyPage} pages={historyPageCount} total={vehicle.history.length} pageSize={historyPageSize} noun="записей истории" onChange={setHistoryPage} />}
                              </div>
                            )}
                            {tab === "inspection" && (
                              <div className="vehicle-content inspection-content">
                                <div className="inspection-meta">
                                  <div>
                                    <b>Предрейсовый осмотр</b>
                                    <small>
                                      {vehicle.inspection.status === "completed"
                                        ? translateSystemText("Завершён", interfaceLanguage)
                                        : translateSystemText("Черновик", interfaceLanguage)}{" "}
                                      · {date(vehicle.inspection.updatedAt)}
                                    </small>
                                  </div>
                                  <PTag
                                    variant={
                                      vehicle.inspection.status === "completed"
                                        ? "success"
                                        : "warning"
                                    }
                                  >
                                    {vehicle.inspection.status === "completed"
                                      ? translateSystemText("Завершён", interfaceLanguage)
                                      : translateSystemText("Не завершён", interfaceLanguage)}
                                  </PTag>
                                </div>
                                <p>
                                  Фиксируйте то, что проверили. При замечании
                                  опишите симптом.
                                </p>
                                {data.checklistTemplate.map((t) => {
                                  const item = items.find(
                                    (x) => x.id === t.id,
                                  ) || {
                                    id: t.id,
                                    status: "pending" as const,
                                    comment: "",
                                  };
                                  return (
                                    <div className="check-item" key={t.id}>
                                      <div className="check-title">
                                        <span className="check-section">
                                          {translateSystemText(t.section, interfaceLanguage)}
                                        </span>
                                        <b>{translateSystemText(t.label, interfaceLanguage)}</b>
                                        {item.finding && <p className="check-finding">{item.finding}</p>}
                                      </div>
                                      <div className="check-controls">
                                        <select
                                          aria-label={`${translateSystemText("Состояние", interfaceLanguage)}: ${translateSystemText(t.label, interfaceLanguage)}`}
                                          value={item.status}
                                          onChange={(e) =>
                                            setItems((old) => [
                                              ...old.filter(
                                                (x) => x.id !== t.id,
                                              ),
                                              {
                                                ...item,
                                                status: e.target
                                                  .value as typeof item.status,
                                              },
                                            ])
                                          }
                                        >
                                          <option value="pending">
                                            Не проверено
                                          </option>
                                          <option value="ok">Исправно</option>
                                          <option value="issue">
                                            Есть проблема
                                          </option>
                                          <option value="na">
                                            Не применимо
                                          </option>
                                        </select>
                                        {item.status === "issue" && (
                                          <>
                                          <input
                                            aria-label={`Комментарий: ${t.label}`}
                                            placeholder="Опишите неисправность"
                                            value={item.comment}
                                            onChange={(e) =>
                                              setItems((old) => [
                                                ...old.filter(
                                                  (x) => x.id !== t.id,
                                                ),
                                                {
                                                  ...item,
                                                  comment: e.target.value,
                                                },
                                              ])
                                            }
                                          />
                                          <VoiceInput key={`${vehicle.id}-${t.id}`} onTranscript={(text) => setItems((old) => {
                                            const latest = old.find((x) => x.id === t.id) || item;
                                            return [...old.filter((x) => x.id !== t.id), { ...latest, comment: appendTranscript(latest.comment, text) }];
                                          })} disabled={busy || vehicleLoading} />
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className="form-actions">
                                  <button
                                    className="button secondary"
                                    disabled={busy || vehicleLoading}
                                    onClick={() => saveInspection("draft")}
                                  >
                                    Сохранить черновик
                                  </button>
                                  <PButton type="button"
                                    variant="primary"
                                    disabled={
                                      busy ||
                                      vehicleLoading ||
                                      items.length <
                                        data.checklistTemplate.length ||
                                      data.checklistTemplate.some((t) => {
                                        const i = items.find(
                                          (x) => x.id === t.id,
                                        );
                                        return (
                                          !i ||
                                          i.status === "pending" ||
                                          (i.status === "issue" &&
                                            !i.comment.trim())
                                        );
                                      })
                                    }
                                    onClick={() => saveInspection("completed")}
                                  >
                                    <Check size={15} /> Завершить осмотр
                                  </PButton>
                                </div>
                                <label className="upload-zone">
                                  <CloudUpload size={18} />
                                  <span>
                                    <b>Добавить фотографию</b>
                                    <small>JPG, PNG или WebP · до 8 МБ</small>
                                  </span>
                                  <input
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                    onChange={(e) =>
                                      upload(e.target.files?.[0])
                                    }
                                  />
                                </label>
                              </div>
                            )}
                            {tab === "planning" && (
                              <div className="vehicle-content planning-content">
                                <header className="planning-heading">
                                  <div>
                                    <span className="eyebrow">ПЛАН ПО МАШИНЕ</span>
                                    <h2>Наблюдение → проверка → согласование</h2>
                                    <p>OBD показывает параметры ЭБУ. Механическую неисправность подтверждает осмотр.</p>
                                  </div>
                                  <PButton type="button" variant="secondary" disabled={planningLoading || vehicleLoading} onClick={() => void loadMaintenancePlan(vehicle.id)}>
                                    {planningLoading ? <PSpinner size="xs" aria={{ "aria-label": interfaceText("Рассчитываем план") }} /> : <Activity size={16} />}
                                    {maintenancePlan ? "Обновить расчёт" : "Рассчитать сроки"}
                                  </PButton>
                                </header>
                                {data.requests.some((request) => request.vehicleId === vehicle.id && request.approvalStatus === "pending") && <section className="planning-saved" aria-label="Сохранённые планы на согласование">
                                  <h3>Планы на согласовании</h3>
                                  {data.requests.filter((request) => request.vehicleId === vehicle.id && request.approvalStatus === "pending").slice(0, 3).map((request) => <article className="planning-saved-item" key={request.id}>
                                    <b>{request.title || requestHeading(request)}</b>
                                    <span>{date(request.createdAt)} · ожидание решения · резерв не создан</span>
                                    {request.plan?.workItems?.map((work) => <small key={work.id}>Работа: {work.title} · {interfaceText(urgencyLabel(work.urgency))}</small>)}
                                    {request.plan?.forecast.expectedDate && <small>Расчётное ТО: {date(request.plan.forecast.expectedDate)} · снимок {date(request.plan.calculatedAt)}</small>}
                                    {request.plan?.lines?.map((line, index) => <small key={`${line.partId}-${index}`}>
                                      {line.catalog?.name || line.catalog?.sku || line.partId} · {line.quantity} {line.catalog?.unit || "шт."} · {interfaceText(urgencyLabel(line.urgency))} · {interfaceText(purchaseStatusLabel(line.catalog?.purchasePreview?.status))}
                                      {line.catalog?.purchasePreview?.orderDate ? ` · заказать ${date(line.catalog.purchasePreview.orderDate)}` : ""}
                                      {line.catalog?.purchasePreview?.neededBy ? ` · крайний срок заказа ${date(line.catalog.purchasePreview.neededBy)}` : ""}
                                      {line.catalog?.purchasePreview?.arrivalDate ? ` · поступление ${date(line.catalog.purchasePreview.arrivalDate)}` : ""}
                                      {line.catalog?.purchasePreview?.arrivalRisk === true ? " · возможна задержка" : ""}
                                    </small>)}
                                  </article>)}
                                </section>}
                                <section className="planning-step scanner-step">
                                  <div className="planning-step-head"><span>1</span><div><h3>Сканер, демо-данные</h3><p>Подставьте пример в существующий OBD-импорт. Значения будут помечены как демонстрационные.</p></div></div>
                                  <PButton type="button" variant="secondary" onClick={() => {
                                    setTelemetryText(JSON.stringify({ recordedAt: new Date().toISOString(), source: "OBD адаптер · демо", odometerKm: vehicle.obdOdometerKm ?? null, rpm: vehicle.telemetry[0]?.rpm ?? 820, speed: 0, coolantTemp: vehicle.coolantTemp, batteryVoltage: vehicle.batteryVoltage, raw: { demo: true, note: "Демо-пакет для проверки импорта; не показание подключённого адаптера" } }, null, 2));
                                    setTelemetryPreview(null);
                                    setTelemetryError("");
                                    setTab("diagnostics");
                                  }}><CloudUpload size={16} /> Открыть OBD-импорт</PButton>
                                </section>
                                <section className="planning-step">
                                  <div className="planning-step-head"><span>2</span><div><h3>Наблюдение и осмотр</h3><p>Опишите симптом. Текст останется черновиком, пока вы не сохраните осмотр или план.</p></div></div>
                                  <div className="observation-compose">
                                  <label className="planning-field">Наблюдение механика
                                    <textarea rows={3} value={planningObservation} onChange={(e) => { setDefectConfirmed(false); setPlanningObservation(e.target.value); revisePlanningDraft(); }} placeholder="Например: стук слева на неровностях, люфт в передней подвеске" />
                                  </label>
                                  <div className="observation-actions">
                                    <VoiceInput key={vehicle.id} onTranscript={(text) => { revisePlanningDraft(); setDefectConfirmed(false); setPlanningObservation((current) => appendTranscript(current, text)); }} disabled={planningLoading || busy} />
                                  {defectConfirmed ? (
                                    <div className="confirmed-observation"><Check size={17} /><span>Механик подтвердил указанное наблюдение после осмотра.</span><button type="button" className="text-link" onClick={() => { revisePlanningDraft(); setDefectConfirmed(false); }}>Изменить</button></div>
                                  ) : (
                                    <PButton type="button" variant="secondary" disabled={!planningObservation.trim()} onClick={() => { revisePlanningDraft(); setDefectConfirmed(true); }}><Check size={16} /> Подтвердить наблюдение</PButton>
                                  )}
                                  </div></div>
                                  <p className="planning-caution">Предложение детали появится только после вашего подтверждения. Мехай не определяет дефект по тексту или OBD.</p>
                                  <details className="planning-extra-note"><summary>Заметка на следующий приезд</summary>
                                  <form className="planning-quick-note" onSubmit={(e) => { e.preventDefault(); void addNote(); }}>
                                    <label htmlFor="planning-quick-note">Быстрая заметка для истории машины</label>
                                    <textarea id="planning-quick-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что стоит учесть при следующем приезде?" />
                                    <div className="observation-actions"><VoiceInput key={vehicle.id} onTranscript={(text) => setNote((current) => appendTranscript(current, text))} disabled={busy || vehicleLoading} />
                                    <PButton type="submit" variant="secondary" disabled={busy || vehicleLoading || !note.trim()}><Plus size={15} /> Сохранить заметку</PButton></div>
                                  </form>
                                  </details>
                                  <details className="planning-history"><summary>Прошлые работы и записи по машине</summary>
                                  <div className="planning-context-grid">
                                    <article><header><b>Из прошлых работ</b><button type="button" className="text-link" onClick={() => setTab("service")}>История</button></header>{vehicle.history.length ? vehicle.history.slice(0, 2).map((entry) => <p key={entry.id}><strong>{entry.title}</strong><small>{entry.result || entry.description}</small></p>) : <p className="context-empty">Записей пока нет.</p>}</article>
                                    <article><header><b>Заметки по машине</b><button type="button" className="text-link" onClick={() => setTab("files")}>Все заметки</button></header>{vehicle.notes.filter((entry) => entry.status !== "resolved").slice(0, 2).map((entry) => <p key={entry.id}><strong>{entry.text}</strong><small>{date(entry.createdAt)} · {entry.category === "damage" ? "Повреждение" : "Общее"}</small></p>)}{!vehicle.notes.some((entry) => entry.status !== "resolved") && <p className="context-empty">Открытых заметок нет.</p>}</article>
                                    <article><header><b>На следующий приезд</b><button type="button" className="text-link" onClick={() => setPage("Заявки")}>Планы</button></header>{data.requests.filter((request) => request.vehicleId === vehicle.id && request.status !== "done").flatMap((request) => request.workItems?.filter((work) => work.urgency === "next_service").map((work) => ({ request, work })) || []).slice(0, 2).map(({ request, work }) => <p key={`${request.id}-${work.id}`}><strong>{work.title}</strong><small>{requestHeading(request)} · {request.approvalStatus === "pending" ? "на согласовании" : "запланировано"}</small></p>)}{!data.requests.some((request) => request.vehicleId === vehicle.id && request.status !== "done" && request.workItems?.some((work) => work.urgency === "next_service")) && <p className="context-empty">Отложенных работ нет.</p>}</article>
                                  </div>
                                  </details>
                                </section>
                                {defectConfirmed && (
                                  <>
                                    <section className="planning-step">
                                      <div className="planning-step-head"><span>3</span><div><h3>Совместимость и наличие</h3><p>Демо-каталог сопоставляет модель автомобиля. VIN не проверен; наличие не резервирует товар.</p></div></div>
                                      {planningLoading && <div className="planning-loading" role="status"><PSpinner size="sm" aria={{ "aria-label": interfaceText("Рассчитываем прогноз и сроки поставки") }} /> Рассчитываем прогноз и сроки поставки…</div>}
                                      {planningError && <div className="field-error" role="alert">{planningError}</div>}
                                      {!maintenancePlan && !planningLoading && <p className="planning-empty">Нажмите «Рассчитать сроки», чтобы загрузить совместимые позиции и прогноз. Вы можете продолжить оформление после загрузки расчёта.</p>}
                                      {maintenancePlan && <>
                                        <div className={`forecast-card ${maintenancePlan.forecast.confidence === "reduced" ? "reduced" : ""}`}>
                                          <div><span>Прогноз следующего ТО</span><strong>{maintenancePlan.forecast.status === "ready" ? (maintenancePlan.forecast.expectedDate ? date(maintenancePlan.forecast.expectedDate) : "Дата не рассчитана") : maintenancePlan.forecast.status === "service_due" ? "Срок наступил" : "Недостаточно истории"}</strong><small>{maintenancePlan.forecast.averageKmPerDay != null ? `Среднее ${rub(Math.round(maintenancePlan.forecast.averageKmPerDay))} км/день` : maintenancePlan.forecast.reason || "Нет подтверждённой динамики пробега"}</small></div>
                                          <div><span>Осталось до ТО</span><strong>{maintenancePlan.forecast.remainingKm != null ? `${rub(maintenancePlan.forecast.remainingKm)} км` : "Неизвестно"}</strong><small>{maintenancePlan.forecast.confidence === "reduced" ? "Достоверность снижена" : maintenancePlan.forecast.source ? `Основание: ${maintenancePlan.forecast.source}` : interfaceText(forecastReason(maintenancePlan.forecast.reason))}</small></div>
                                          {maintenancePlan.forecast.dateRange && <div><span>Расчётный диапазон</span><strong>{date(maintenancePlan.forecast.dateRange.from)} — {date(maintenancePlan.forecast.dateRange.to)}</strong><small>Расчёт на {date(maintenancePlan.calculatedAt)}</small></div>}
                                        </div>
                                        {maintenancePlan.forecast.odometerConflict && <div className="field-error">Расхождение пробега: ручной {rub(maintenancePlan.forecast.odometerConflict.manualKm)} км, OBD {rub(maintenancePlan.forecast.odometerConflict.obdKm)} км. Прогноз имеет сниженную достоверность.</div>}
                                        {maintenancePlan.forecast.evidence.length > 0 && <details className="forecast-evidence"><summary>Основания прогноза · {maintenancePlan.forecast.evidence.length} записей</summary>{maintenancePlan.forecast.evidence.map((point) => <span key={`${point.recordedAt}-${point.odometerKm}`}>{date(point.recordedAt)} · {rub(point.odometerKm)} км · {point.source}</span>)}</details>}
                                        <p className="planning-caution">Сроки в карточках рассчитаны для 1 шт. и категории «К следующему ТО». После выбора количества и срочности сервер пересчитает снимок плана.</p>
                                        <div className="planning-part-list">
                                          {maintenancePlan.parts.map((part) => {
                                            const chosen = plannedParts[part.id];
                                            const preview = part.purchasePreview;
                                            return <article className={`planning-part ${part.fit.model ? "compatible" : "not-compatible"}`} key={part.id}>
                                              <div className="planning-part-title"><div><b>{part.name}</b><small>{part.sku} · {part.unit} · применимость: {part.fit.model ? "модель совпадает" : "модель не подтверждена"}</small></div><span className="demo-label">Демо</span></div>
                                              <div className="planning-part-facts"><span>Остаток: <b>{part.stock.quantity === null ? "неизвестен" : rub(part.stock.quantity)}</b></span><span>Склад: <b>{part.stock.location || "не указан"}</b></span><span>Поставка: <b>{part.leadTimeDays === null ? "срок неизвестен" : `${part.leadTimeDays} дн.`}</b></span></div>
                                              {preview.status === "in_stock" ? <p className="procurement-preview">Есть на складе · резерв не оформлен. {interfaceText(procurementReason(preview.reason))}</p> : preview.orderDate ? <div className={`procurement-preview ${preview.status === "order_now" ? "urgent" : ""}`}><p>{preview.status === "order_now" ? "Заказать сейчас" : `Заказать ${date(preview.orderDate)}`}{preview.neededBy ? ` · крайний срок ${date(preview.neededBy)}` : ""}{preview.arrivalDate ? ` · ожидаемое поступление ${date(preview.arrivalDate)}` : ""}</p><small>{preview.arrivalRisk === true ? "Риск опоздания к ТО" : preview.arrivalRisk === false ? (maintenancePlan.forecast.expectedDate ? `Расчётное ТО ${date(maintenancePlan.forecast.expectedDate)}` : "Поступление до планового срока") : "Дата ТО / поступления неизвестна"}. {interfaceText(procurementReason(preview.reason))}</small></div> : <p className="procurement-preview">{interfaceText(procurementReason(preview.reason))}</p>}
                                              {part.fit.model && <div className="planning-part-controls"><label><input type="checkbox" checked={Boolean(chosen)} onChange={(e) => { revisePlanningDraft(); setPlannedParts((old) => { const next = { ...old }; if (e.target.checked) next[part.id] = { quantity: "1", urgency: "next_service" }; else delete next[part.id]; return next; }); }} /> Добавить в план</label>{chosen && <><input aria-label={`Количество: ${part.name}`} type="number" min="1" max="10000" value={chosen.quantity} onChange={(e) => { revisePlanningDraft(); setPlannedParts((old) => ({ ...old, [part.id]: { ...old[part.id], quantity: e.target.value } })); }} /><select aria-label={`Срок детали: ${part.name}`} value={chosen.urgency} onChange={(e) => { revisePlanningDraft(); setPlannedParts((old) => ({ ...old, [part.id]: { ...old[part.id], urgency: e.target.value as Urgency } })); }}><UrgencyOptions /></select></>}</div>}
                                              {part.fit.model && <PButton type="button" variant="secondary" onClick={() => setOffersPart({ id: part.id, vehicleId: vehicle.id, name: part.name, quantity: Math.max(1, Number(chosen?.quantity) || 1) })}>Сравнить предложения</PButton>}
                                            </article>;
                                          })}
                                        </div>
                                        {offersPart?.vehicleId === vehicle.id && <PartOffers key={`${vehicle.id}-${offersPart.id}`} vehicleId={vehicle.id} vehicleName={`${vehicle.model} · ${vehicle.year}`} partName={offersPart.name} quantity={offersPart.quantity} onProcure={() => {
                                          const parkName = (() => { try { const saved = window.localStorage.getItem("mehay-parts-offers-park"); return saved || "main"; } catch { return "main"; } })();
                                          const sourceQuantity = suggestedPurchaseQuantity(offersPart.id, offersPart.quantity);
                                          setRequestPartOther(""); setRequestPartId(offersPart.id); setRequestPartQty(sourceQuantity); setProcurementConfirmed(false);
                                          setForm({ type: "procurement", title: `Закупить: ${offersPart.name}`, description: `Внутренняя заявка по выбранной совместимой детали. Парк сравнения: ${parkName}. Проверьте наименование и количество; заказ поставщику не отправляется.`, priority: "normal", part: offersPart.name, quantity: sourceQuantity });
                                          setOffersPart(null); setModal(true);
                                        }} />}
                                      </>}
                                    </section>
                                    <form className="planning-step planning-submit" onSubmit={submitPlanningRequest}>
                                      <div className="planning-step-head"><span>4</span><div><h3>План работ и деталей</h3><p>Проверьте формулировку и срочность каждой позиции перед передачей.</p></div></div>
                                      <label className="planning-field">Название работ<input value={planningTitle} onChange={(e) => { setPlanningTitle(e.target.value); revisePlanningDraft(); }} /></label>
                                      <label className="planning-field">Срочность работ<select value={workUrgency} onChange={(e) => { setWorkUrgency(e.target.value as Urgency); revisePlanningDraft(); }}><UrgencyOptions /></select></label>
                                      {planningError && <div className="field-error" role="alert">{planningError}</div>}
                                      {planningRequest && <div className="planning-success" role="status"><Check size={18} /><div><b>План сохранён для согласования</b><small>{planningRequest.title} · {date(planningRequest.createdAt)} · резерв не создан</small></div></div>}
                                      <PButton type="submit" variant="primary" disabled={busy || planningLoading || planningRequest !== null || !maintenancePlan || !defectConfirmed || !planningObservation.trim() || !planningTitle.trim()}><Check size={16} /> Передать на согласование замену или ремонт</PButton>
                                      <small className="planning-disclaimer">Создаётся внутренняя заявка со снимком расчёта. Это не заказ поставщику и не резерв со склада.</small>
                                    </form>
                                  </>
                                )}
                              </div>
                            )}
                            {tab === "files" && (
                              <div className="vehicle-content">
                                <div className="section-heading">
                                  <h3>Фотографии и заметки</h3>
                                  <label className="button secondary small upload-button">
                                    <Plus size={14} /> Добавить фото
                                    <input
                                      type="file"
                                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                      onChange={(e) =>
                                        upload(e.target.files?.[0])
                                      }
                                    />
                                  </label>
                                </div>
                                {vehicle.photo?.url && (
                                  <figure className="gallery-model-photo">
                                    <img
                                      src={appPath(vehicle.photo.url)}
                                      alt={vehicle.photo.label || `Фото модели ${vehicle.model}`}
                                    loading="lazy"
                                    decoding="async"
                                    />
                                    <figcaption>
                                      {vehicle.photo.label || "Фото модели"} · иллюстрация.
                                      {vehicle.photo.credit &&
                                        ` Автор: ${vehicle.photo.credit}.`}
                                      {vehicle.photo.license &&
                                        ` Лицензия: ${vehicle.photo.license}.`}
                                    </figcaption>
                                  </figure>
                                )}
                                <h3 className="gallery-heading">
                                  Фото осмотра
                                </h3>
                                <div className="attachment-grid">
                                  {vehicle.attachments.map((a) => (
                                    <a
                                      className="attachment"
                                      href={authenticatedResourceUrl(a.originalUrl || a.url)}
                                      target="_blank"
                                      rel="noreferrer"
                                      key={a.id}
                                    >
                                      <img src={authenticatedResourceUrl(a.previewUrl || a.url)} alt={a.name} loading="lazy" decoding="async" />
                                      <span>
                                        <FileText size={14} />
                                        {a.name}
                                      </span>
                                    </a>
                                  ))}
                                  {!vehicle.attachments.length && (
                                    <div className="empty inset">
                                      Фотографий пока нет.
                                    </div>
                                  )}
                                </div>
                                <form
                                  className="note-form"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    void addNote();
                                  }}
                                >
                                  <label htmlFor="note">
                                    Заметка по автомобилю
                                  </label>
                                  <select
                                    aria-label="Категория заметки"
                                    value={noteCategory}
                                    onChange={(e) =>
                                      setNoteCategory(e.target.value)
                                    }
                                  >
                                    <option value="general">Общее</option>
                                    <option value="damage">Повреждение</option>
                                    <option value="wash">Мойка</option>
                                  </select>
                                  <textarea
                                    id="note"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Коротко запишите наблюдение или договорённость…"
                                  />
                                  <VoiceInput key={vehicle.id} onTranscript={(text) => setNote((current) => appendTranscript(current, text))} disabled={busy || vehicleLoading} />
                                  <PButton
                                    type="submit"
                                    variant="primary"
                                    disabled={
                                      busy || vehicleLoading || !note.trim()
                                    }
                                  >
                                    <Plus size={15} /> Сохранить заметку
                                  </PButton>
                                </form>
                                {vehicle.notes.map((n) => (
                                  <div className="note-row" key={n.id}>
                                    <MessageSquareText size={15} />
                                    <div>
                                      <p>{n.text}</p>
                                      <small>
                                        {date(n.createdAt)} ·{" "}
                                        {n.category === "damage"
                                          ? "Повреждение"
                                          : n.category === "wash"
                                            ? "Мойка"
                                            : "Общее"}{" "}
                                        ·{" "}
                                        {n.status === "resolved"
                                          ? "Решено"
                                          : "Открыто"}
                                      </small>
                                    </div>
                                    <button
                                      className="text-link"
                                      disabled={busy}
                                      onClick={() =>
                                        void setNoteStatus(
                                          n.id,
                                          n.status === "resolved"
                                            ? "open"
                                            : "resolved",
                                        )
                                      }
                                    >
                                      {n.status === "resolved"
                                        ? "Вернуть в работу"
                                        : "Отметить решённым"}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {tab === "parts" && (
                              <div className="vehicle-content parts-content">
                                <div className="section-heading">
                                  <div>
                                    <h3>Набор этой машины</h3>
                                    <p>
                                      Остаток каталога справочный; наличие
                                      подтверждает механик.
                                    </p>
                                  </div>
                                  <PButton type="button"
                                    variant="primary"
                                    disabled={busy || vehicleLoading}
                                    onClick={() => void saveKit()}
                                  >
                                    Сохранить набор
                                  </PButton>
                                </div>
                                <label className="searchbox">
                                  <Search size={16} />
                                  <input
                                    value={partsQuery}
                                    onChange={(e) =>
                                      setPartsQuery(e.target.value)
                                    }
                                    placeholder="Артикул или название детали"
                                    aria-label="Поиск детали"
                                  />
                                </label>
                                {partsError && (
                                  <p className="field-error">{partsError}</p>
                                )}
                                <div className="parts-list">
                                  {parts.map((part) => {
                                    const entry = kitDraft.find(
                                      (item) => item.partId === part.id,
                                    );
                                    return (
                                      <div className="part-row" key={part.id}>
                                        <div>
                                          <b>{part.name}</b>
                                          <small>
                                            {part.sku} · {part.unit}
                                            {part.demo ? " · демо-каталог" : ""}
                                          </small>
                                        </div>
                                        <span>
                                          {part.stock == null
                                            ? "Остаток неизвестен"
                                            : `Каталог: ${part.stock} ${part.unit}`}
                                        </span>
                                        <input
                                          aria-label={`Количество ${part.name} в наборе`}
                                          type="number"
                                          min="0"
                                          max="10000"
                                          value={entry?.quantity ?? ""}
                                          placeholder="Кол-во"
                                          onChange={(e) => {
                                            const quantity = Number(
                                              e.target.value,
                                            );
                                            setKitDraft((old) => [
                                              ...old.filter(
                                                (x) => x.partId !== part.id,
                                              ),
                                              ...(quantity > 0
                                                ? [
                                                    {
                                                      partId: part.id,
                                                      quantity,
                                                      status:
                                                        entry?.status ||
                                                        ("unknown" as const),
                                                    },
                                                  ]
                                                : []),
                                            ]);
                                          }}
                                        />
                                        <select
                                          aria-label={`Наличие ${part.name}`}
                                          value={entry?.status || "unknown"}
                                          onChange={(e) =>
                                            setKitDraft((old) => [
                                              ...old.filter(
                                                (x) => x.partId !== part.id,
                                              ),
                                              {
                                                partId: part.id,
                                                quantity: entry?.quantity || 1,
                                                status: e.target.value as
                                                  | "present"
                                                  | "missing"
                                                  | "unknown",
                                              },
                                            ])
                                          }
                                        >
                                          <option value="present">Есть</option>
                                          <option value="missing">Нет</option>
                                          <option value="unknown">
                                            Не проверено
                                          </option>
                                        </select>
                                        <button
                                          className="button secondary small"
                                          onClick={(event) => {
                                            modalTriggerRef.current = event.currentTarget;
                                            setRequestPartOther("");
                                            setProcurementConfirmed(false);
                                            setRequestPartId(part.id);
                                            setRequestPartQty(
                                              suggestedPurchaseQuantity(part.id, entry?.quantity || 1),
                                            );
                                            setForm((f) => ({
                                              ...f,
                                              type: "procurement",
                                              part: part.name,
                                              title:
                                                f.title ||
                                                `Закупить: ${part.name}`,
                                            }));
                                            setModal(true);
                                          }}
                                        >
                                          В заявку
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="report-actions">
                                  <div>
                                    <h3>Отчёт по машине</h3>
                                    <p>
                                      Один снимок данных для печати и выгрузки.
                                    </p>
                                  </div>
                                  <PButton type="button"
                                    variant="secondary"
                                    disabled={busy || vehicleLoading}
                                    onClick={() => void loadReport()}
                                  >
                                    Обновить отчёт
                                  </PButton>
                                  {report && (
                                    <>
                                      <PButton type="button"
                                        variant="secondary"
                                        onClick={() => {
                                          document.body.classList.add(
                                            "report-printing",
                                          );
                                          window.addEventListener(
                                            "afterprint",
                                            () =>
                                              document.body.classList.remove(
                                                "report-printing",
                                              ),
                                            { once: true },
                                          );
                                          window.print();
                                        }}
                                      >
                                        Печать
                                      </PButton>
                                      <PButton type="button"
                                        variant="secondary"
                                        onClick={() => {
                                          const blob = new Blob(
                                            [JSON.stringify(report, null, 2)],
                                            { type: "application/json" },
                                          );
                                          const url = URL.createObjectURL(blob);
                                          const link =
                                            document.createElement("a");
                                          link.href = url;
                                          link.download = `${vehicle.plate}-report.json`;
                                          link.click();
                                          URL.revokeObjectURL(url);
                                        }}
                                      >
                                        Выгрузить JSON
                                      </PButton>
                                    </>
                                  )}
                                </div>
                                {report && (
                                  <ReportSummary
                                    report={report}
                                    checklistTemplate={data.checklistTemplate}
                                  />
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="empty inset">
                            Выберите автомобиль в списке.
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                  <div
                    className={`lower-grid ${page === "Карточка" ? "workspace-lower" : ""}`}
                  >
                    <section className="panel lower-panel">
                      <div className="panel-head">
                        <div>
                          <div className="eyebrow">ТРЕБУЮТ РЕШЕНИЯ</div>
                          <h2>Активные заявки</h2>
                        </div>
                        <button
                          className="text-link"
                          onClick={() => setPage("Заявки")}
                        >
                          Все заявки
                        </button>
                      </div>
                      {data.requests
                        .filter((r) => r.status !== "done")
                        .slice(0, 4)
                        .map((r) => (
                          <button
                            className="request-line"
                            key={r.id}
                            onClick={() => setActiveRequest(r)}
                          >
                            <span className={`priority ${r.priority}`}>
                              <i />
                            </span>
                            <span className="request-text">
                              <b>{r.title}</b>
                              <small>
                                {
                                  data.vehicles.find(
                                    (v) => v.id === r.vehicleId,
                                  )?.plate
                                }{" "}
                                ·{" "}
                                {r.type === "repair"
                                  ? "Ремонт"
                                  : r.type === "procurement"
                                    ? "Закупка"
                                    : "Подбор"}
                              </small>
                            </span>
                            <span className="request-status">
                              {r.status === "new" ? "Новая" : "В работе"}
                            </span>
                          </button>
                        ))}
                      {!data.requests.some((r) => r.status !== "done") && (
                        <div className="empty inset">Нет открытых заявок.</div>
                      )}
                    </section>
                    <section className="panel lower-panel assistant-card">
                      <div className="panel-head">
                        <div>
                          <div className="eyebrow">ПОМОЩНИК МЕХАНИКА</div>
                          <h2>Вопрос по автомобилю</h2>
                        </div>
                        <span
                          className={`ai-status ${data.ai.configured ? "available" : ""}`}
                        >
                          <i />
                          {data.ai.configured ? "Подключён" : "Не настроен"}
                        </span>
                      </div>
                      <p className="assistant-caption">
                        Опишите наблюдение, измерение или вопрос по{" "}
                        {vehicle?.plate}. Помощник сопоставит его с данными этой
                        карточки.
                      </p>
                      {vehicle && data.ai.configured && !manualOnly && <PButton className="assistant-model-search" type="button" variant="secondary" onClick={() => {
                        assistantRequest.current += 1; setAssistantBusy(false); setAnswer(""); setAssistantSources([]); setAssistantError("");
                        const prompt = `Найди публичные технические сведения по автомобилю ${vehicle.model || ""}, двигатель ${vehicle.engine || "не указан"}.`;
                        setMessage(prompt); setWebSearch(true); setWebDomain(""); setWebQuery(`${vehicle.model || ""} ${vehicle.engine || ""}`.trim()); setChatOpen(true); setAutoSendPrompt(prompt);
                      }}>Поиск по модели и двигателю</PButton>}
                      <label className="engine-manual-select">
                        Руководство для поиска
                        <select value={engineModel} onChange={(e) => changeEngineModel(e.target.value)}>
                          <option value="">Выберите двигатель для поиска по руководствам</option>
                          {engineManuals.map((item) => <option key={item.value} value={item.value}>{interfaceText(item.label)}</option>)}
                        </select>
                        <small>В карточке: {vehicle?.engine || "двигатель не указан"}. Выбор уточняет двигатель; руководство для серии ЗМЗ-409 общее для 40904.10 и 40905.10.</small>
                      </label>
                      <label className="manual-only-toggle">
                        <input type="checkbox" checked={manualOnly} onChange={(e) => changeManualOnly(e.target.checked)} />
                        Искать только по выбранному руководству, без привязки к машине и ИИ
                      </label>
                      <form className="assistant-form" onSubmit={askAssistant}>
                        <input
                          aria-label="Вопрос помощнику"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="Например: на что обратить внимание по DTC?"
                        />
                        <VoiceInput key={`assistant-${selected}`} onTranscript={(text) => setMessage((current) => appendTranscript(current, text))} disabled={assistantBusy} />
                        <PButton
                          className="assistant-send"
                          type="submit"
                          variant="primary"
                          disabled={
                            assistantBusy || chatLoadedScope !== chatScope ||
                            (manualOnly ? !engineModel : !data.ai.configured) ||
                            (webSearch && !webQuery.trim()) ||
                            !message.trim()
                          }
                          aria-label="Отправить вопрос"
                        >
                          {assistantBusy ? (
                            <PSpinner size="sm" aria={{ "aria-label": interfaceText("Отправляется вопрос") }} />
                          ) : (
                            <Send size={16} />
                          )}
                        </PButton>
                      </form>
                      {answer && (
                        <div className="answer-box">
                          {answer}
                          {assistantSources.length > 0 && (
                            <div className="answer-sources">
                              <b>Источники ответа</b>
                              {assistantSources.map((s, i) => {
                                const href = sourceUrl(s);
                                return href ? (
                                  <a
                                    key={`${href}-${i}`}
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {s.manual || s.title || href}{s.pdfPage ? ` · PDF, стр. ${s.pdfPage}` : ""}
                                  </a>
                                ) : null;
                              })}
                              <small>
                                Сверьте руководство с фактической модификацией двигателя и автомобиля.
                              </small>
                            </div>
                          )}
                        </div>
                      )}
                      {assistantError && (
                        <div className="field-error">{assistantError}</div>
                      )}

                      <label className="web-search">
                        <input
                          type="checkbox"
                          checked={webSearch}
                          onChange={(e) => {
                            setWebSearch(e.target.checked);
                            if (!e.target.checked) setWebQuery("");
                          }}
                          disabled={manualOnly}
                        />
                        Искать в открытых источниках{" "}
                        <span>
                          Поиск отключён по умолчанию. Сверяйте найденные
                          материалы с двигателем и модификацией.
                        </span>
                      </label>
                      {webSearch && (
                        <label className="web-query-field">
                          Запрос для открытого веб-поиска
                          <select value={webDomain} onChange={(e) => setWebDomain(e.target.value)} aria-label="Область веб-поиска">
                            <option value="">Все открытые источники</option><option value="drive.ru">Только Drive.ru</option><option value="drive2.ru">Только Drive2.ru · форум</option><option value="oem">Документы OEM · ГАЗ</option>
                          </select>
                          <textarea
                            value={webQuery}
                            onChange={(e) => setWebQuery(e.target.value)}
                            maxLength={1000}
                            required
                            aria-required="true"
                            placeholder="Введите отдельную формулировку для публичного поиска"
                          />
                          <small>Этот текст будет отправлен во внешний веб-поиск. Вопрос и заметки из чата сюда не копируются. {webQuery.length}/1000</small>
                        </label>
                      )}
                      {!data.ai.configured && (
                        <small className="muted">
                          Настройте помощника на сервере, чтобы задавать
                          вопросы.
                        </small>
                      )}
                    </section>
                  </div>
                </>
              )}

              {page === "Акустика" && data.acousticDemo && <AcousticDiagnostics api={api} />}
              {page === "Автопарк" && (
                <>
                  <section className="page-heading">
                    <div>
                      <div className="eyebrow">
                        РЕЕСТР · {data.vehicles.length} АВТОМОБИЛЕЙ
                      </div>
                      <h1>Автопарк</h1>
                      {allData?.vehicles.some(v => !v.neuroVehicleId) && <label>Набор машин <select value={fleetScope} onChange={e => {
                        const scope = e.target.value === "archive" ? "archive" : "customer";
                        const first = allData.vehicles.find(v => Boolean(v.neuroVehicleId) === (scope === "customer"));
                        setFleetScope(scope); setFilter("all"); setQuery(""); setFleetPage(0); setChatOpen(false);
                        if (first) { void selectVehicle(first.id); setPage("Автопарк"); }
                      }}><option value="customer">Автопарк заказчика</option><option value="archive">Архив демопарка</option></select></label>}
                      <p>
                        Выберите автомобиль, чтобы открыть его рабочую карточку.
                      </p>
                    </div>
                    <PButton type="button"
                      variant="primary"
                      onClick={() => setPage("Обзор")}
                    >
                      К обзору
                    </PButton>
                  </section>
                  <section className="panel full-panel">
                    <div className="fleet-tools">
                      <label className="searchbox">
                        <Search size={15} />
                        <input
                          value={query}
                          onChange={(e) => { setFleetPage(0); setQuery(e.target.value); }}
                          placeholder="Номер, модель, водитель"
                        />
                      </label>
                      <select
                        value={filter}
                        onChange={(e) => { setFleetPage(0); setFilter(e.target.value); }}
                        aria-label="Фильтр"
                      >
                        <option value="all">Все состояния</option>
                        <option value="автобус">Автобусы</option><option value="attention">Требуют внимания</option>
                        <option value="repair">В ремонте</option>
                        <option value="ready">Без замечаний</option>
                      </select>
                    </div>
                    <VehicleTable
                      vehicles={visibleFleetPage}
                      selected={vehicle?.id || ""}
                      onSelect={(id) => {
                        void selectVehicle(id);
                      }}
                    />
                    {visible.length > fleetPageSize && <Pagination current={fleetPage} pages={fleetPageCount} total={visible.length} pageSize={fleetPageSize} noun="машин" onChange={setFleetPage} />}
                  </section>
                </>
              )}
              {page === "Осмотры" && (
                <>
                  <section className="page-heading">
                    <div>
                      <div className="eyebrow">КОНТРОЛЬ ПЕРЕД ВЫЕЗДОМ</div>
                      <h1>Осмотры</h1>
                      <p>Статус чек-листов по всему парку.</p>
                    </div>
                  </section>
                  <div className="simple-list">
                    {data.vehicles.map((v) => (
                      <button
                        className="simple-row"
                        key={v.id}
                        onClick={() => {
                          void selectVehicle(v.id);
                          setTab("inspection");
                        }}
                      >
                        <span className="car-icon">
                          {v.vehicleType?.toLowerCase() === "автобус" ? <Bus size={23}/> : <Truck size={23}/>}
                        </span>
                        <span>
                          <b>
                            <Plate value={v.plate} size="compact"/> {v.model}
                          </b>
                          <small>
                            {v.engine} · {v.route}
                          </small>
                        </span>
                        <PTag
                          variant={
                            v.inspection.status === "completed"
                              ? "success"
                              : "warning"
                          }
                        >
                          {v.inspection.status === "completed"
                            ? translateSystemText("Завершён", interfaceLanguage)
                            : translateSystemText("Не завершён", interfaceLanguage)}
                        </PTag>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {page === "Заявки" && (
                <>
                  <section className="page-heading">
                    <div>
                      <div className="eyebrow">
                        Ремонт · подбор запчастей · закупка
                      </div>
                      <h1>Заявки</h1>
                      <p>Управление работами и потребностями парка.</p>
                    </div>
                    <PButton type="button" variant="primary" onClick={(event) => { modalTriggerRef.current = event.currentTarget; setModal(true); }}>
                      <Plus size={16} /> Новая заявка
                    </PButton>
                  </section>
                  <section className="panel full-panel">
                    {fleetScope === "customer" && <SubmittedTickets api={api}/>}
                    {!data.requests.length && <p>Внутренних заявок в выбранном парке пока нет.</p>}
                    <div className="request-list">
                      {data.requests.map((r) => (
                        <button
                          className="request-card"
                          key={r.id}
                          onClick={() => setActiveRequest(r)}
                        >
                          <span className={`priority ${r.priority}`}>
                            <i />
                          </span>
                          <div>
                            <span className="eyebrow">
                              {r.type === "repair"
                                ? "РЕМОНТ"
                                : r.type === "procurement"
                                  ? "ЗАКУПКА"
                                  : "Подбор запчасти"}{" "}
                              ·{" "}
                              {
                                data.vehicles.find((v) => v.id === r.vehicleId)
                                  ?.plate
                              }
                            </span>
                            <h3>{requestHeading(r)}</h3>
                            <p className="request-vehicle">{data.vehicles.find((v) => v.id === r.vehicleId)?.model || "Автомобиль не найден"}</p>
                            <div className="request-facts">
                              {r.workItems?.length ? <span>{r.workItems.map((work) => `${work.done ? "✓" : "○"} ${work.title}`).join(" · ")}</span> : null}
                              {r.parts?.length ? <span>{r.parts.map((part) => `${requestPartName(r, part.partId, parts)}: ${part.usedQuantity}/${part.quantity} ${part.usedQuantity === part.quantity ? "использовано" : "использовано из плана"}`).join(" · ")}</span> : null}
                              {requestManualPart(r, parts) && <span>{requestManualPart(r, parts)} · {r.quantity} шт. в плане</span>}
                              {r.result && <span className="request-result">Результат: {r.result}</span>}
                            </div>
                            <p>{r.description}</p>
                            <small>
                              Создана {date(r.createdAt)}
                            </small>
                          </div>
                          <PTag
                            variant={
                              r.status === "done"
                                ? "success"
                                : r.status === "in_progress"
                                  ? "warning"
                                  : "secondary"
                            }
                          >
                            {r.status === "done"
                              ? "Выполнена"
                              : r.status === "in_progress"
                                ? "В работе"
                                : "Новая"}
                          </PTag>
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}
              {page === "База знаний" && <KnowledgeLibrary api={api} appPath={appPath} engines={engineManuals}/>}
              {page === "Интеграции" && (
                <>
                  <section className="page-heading">
                    <div>
                      <div className="eyebrow">СОСТОЯНИЕ ПОДКЛЮЧЕНИЙ</div>
                      <h1>Интеграции</h1>
                      <p>Подключения и демонстрационные данные системы.</p>
                    </div>
                  </section>
                  <div className="integration-grid">
                    {data.integrations.map((i) => (
                      <article className="panel integration-card" key={i.id}>
                        <div className="integration-icon">
                          <Settings2 size={19} />
                        </div>
                        <PTag
                          variant={
                            i.status === "connected" ? "success" : "info"
                          }
                        >
                          {i.status === "connected"
                            ? "Подключено"
                            : "Демонстрация"}
                        </PTag>
                        <h3>{i.name}</h3>
                        <p>{i.description}</p>
                        <div className="integration-foot">
                          <span>{i.kind}</span>
                          <span>
                            {i.lastSync
                              ? `Синхронизация ${date(i.lastSync)}`
                              : "Внешний обмен не настроен"}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}

            </>
          )}
        </main>
        {chatOpen && (
          <dialog ref={assistantDialog} className="header-assistant-dialog" style={{ width: `min(${chatWidth}rem, 100%)` }} data-theme={theme} aria-label={t(headerMode === "voice" ? "Голосовое управление механика" : "Задать вопрос", interfaceLanguage)} onCancel={event => { event.preventDefault(); closeAssistant(); }}>
          {diagnosticAssistant ? <div className="diagnostic-assistant">
            <div className="drawer-head"><div><strong>{t(headerMode === "voice" ? "Голосовое управление механика" : "Задать вопрос", interfaceLanguage)}</strong><p>{vehicle?.plate} · {vehicle?.model}</p></div>
              {chatWidthControl}
              <button type="button" className="icon-btn" aria-label={translateSystemText("Закрыть", interfaceLanguage)} onClick={closeAssistant}><X size={20}/></button>
            </div><div className="diagnostic-assistant-host" ref={setAssistantHost} />
          </div> : (
          <aside className="chat-drawer" data-theme={theme} aria-label="Чат помощника">
            <div className="drawer-head">
              <div><h2>Мехай</h2><p>{manualOnly ? `Поиск по руководству: ${engineModel || "выберите двигатель"}` : assistantVehicle ? `Контекст: ${assistantVehicle.plate} · ${assistantVehicle.model}` : "Общий вопрос"}</p></div>
              {chatWidthControl}
              <button className="icon-btn" aria-label="Закрыть чат" onClick={closeAssistant}><X size={19} /></button>
            </div>
            <details className="chat-settings">
              <summary>Настройки поиска</summary>
              <div className="chat-settings-content">
                <label className="manual-only-toggle"><input type="checkbox" checked={manualOnly} onChange={(e) => changeManualOnly(e.target.checked)} /> Искать только по руководству</label>
                {manualOnly && <label className="engine-manual-select drawer-engine-select">Двигатель для поиска по руководствам<select value={engineModel} onChange={(e) => changeEngineModel(e.target.value)}><option value="">Выберите двигатель</option>{engineManuals.map((item) => <option key={item.value} value={item.value}>{interfaceText(item.label)}</option>)}</select><small>Доступны руководства по пяти точным вариантам двигателя.</small></label>}
                <label className="web-search"><input type="checkbox" checked={webSearch} onChange={(e) => { setWebSearch(e.target.checked); if (!e.target.checked) setWebQuery(""); }} disabled={manualOnly} /> Искать в открытых источниках</label>
              </div>
            </details>
            <div ref={chatThreadRef} className="chat-thread" aria-live="polite" aria-relevant="additions text" onScroll={(event) => {
              const el = event.currentTarget;
              chatPinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
            }}>
              {chatLoadedScope === chatScope && chatHistory.length === 0 && !assistantBusy && <div className="chat-empty"><MessageSquareText size={22} /><b>{assistantVehicle ? "Обсудим данные этой машины" : "Задайте общий вопрос"}</b><p>{assistantVehicle ? "Опишите, что заметили при осмотре. Мехай поможет сверить факты и предложит, что проверить." : "Можно задать вопрос по работе сервиса, диагностике или ремонту."}</p><div className="chat-prompts">{["Что проверить по кодам ЭБУ?", "С чем сверить пробег?", "Какие вопросы задать перед заменой детали?"].map((prompt) => <button key={prompt} type="button" disabled={assistantBusy || (!manualOnly && !data?.ai.configured)} onClick={(event) => void askAssistant(event, prompt)}>{prompt}</button>)}</div></div>}
              {chatLoadedScope === chatScope && chatHistory.map((entry, index) => renderChatEntry(entry, index))}
              {assistantBusy && <div className="chat-message assistant chat-busy" role="status"><span className="busy-dots" aria-hidden="true"><i /><i /><i /></span><span>{busyLabel}</span></div>}
              {assistantError && <p className="field-error" role="alert">{assistantError}</p>}
            </div>
            <form className="chat-composer" onSubmit={(event) => void askAssistant(event)}>
              {headerMode === "voice" && isSpeechRecognitionAvailable() ? <div><button type="button" className="theme-toggle" aria-pressed={dictating} disabled={assistantBusy} onClick={() => setDictating(!dictating)}><Mic size={18}/>{t(dictating ? "Завершить разговор" : "Начать голосовое управление", interfaceLanguage)}</button><VoiceInput mode="managed" active={dictating} onListeningChange={setDictating} disabled={assistantBusy} onTranscript={text => { setDictating(false); setMessage(appendTranscript(message, text)); if (!message.trim() && !webSearch && (manualOnly ? engineModel : data?.ai.configured)) setAutoSendPrompt(text); }} /></div> : assistantVehicle && <VoiceInput key={`chat-${assistantVehicle.id}`} onTranscript={(text) => setMessage((current) => appendTranscript(current, text))} disabled={assistantBusy} />}
              {webSearch && <label className="web-query-field drawer-web-query">Запрос для открытого веб-поиска<select value={webDomain} onChange={(e) => setWebDomain(e.target.value)} aria-label="Область веб-поиска"><option value="">Все открытые источники</option><option value="drive.ru">Только Drive.ru</option><option value="drive2.ru">Только Drive2.ru · форум</option><option value="oem">Документы OEM · ГАЗ</option></select><textarea value={webQuery} onChange={(e) => setWebQuery(e.target.value)} maxLength={1000} required aria-required="true" placeholder="Введите отдельную формулировку для публичного поиска"/><small>Этот текст будет отправлен во внешний веб-поиск. Вопрос и заметки из чата сюда не копируются. {webQuery.length}/1000</small></label>}
              <label className="drawer-compose">Ваш вопрос<textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                event.preventDefault(); event.currentTarget.form?.requestSubmit();
              }} placeholder="Опишите наблюдение или задайте вопрос" /></label>
              <p className="drawer-note">{manualOnly ? "Будут показаны найденные фрагменты и страницы выбранного руководства без обработки ИИ." : assistantVehicle ? "Черновик заявки и данные машины добавляются автоматически. Решение остаётся за механиком." : "Общий вопрос; данные машины и черновик не добавляются."}</p>
              <PButton type="submit" variant="primary" disabled={(manualOnly ? !engineModel : !data?.ai.configured) || assistantBusy || chatLoadedScope !== chatScope || !message.trim() || (webSearch && !webQuery.trim())}><Send size={16} /> Отправить</PButton>
            </form>
          </aside>)}
          </dialog>
        )}
        {modal && vehicle && (
          <div
            className="mehay-modal-backdrop"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setModal(false);
            }}
          >
            <form
              className={form.type === "procurement" ? "mehay-modal procurement-draft" : "mehay-modal"}
              data-bs-theme={theme}
              onSubmit={createRequest}
              onKeyDown={trapDialogTab}
              role="dialog"
              aria-modal="true"
              aria-labelledby="request-heading"
            >
              <div className="modal-head">
                <div>
                  <strong className="request-vehicle">
                    <Plate value={vehicle.plate} size="compact" />
                    {vehicle.model}
                  </strong>
                  <h2 id="request-heading">{translateSystemText(form.type === "procurement" ? "Черновик закупки" : "Новая заявка", interfaceLanguage)}</h2>
                  {form.type !== "procurement" && <button
                    type="button"
                    className="text-link request-assistant-link"
                    onClick={() => setChatOpen(true)}
                  >
                    <MessageSquareText size={16} /> Спросить Мехая о черновике
                  </button>}
                  {form.type !== "procurement" && <p>
                    Черновик можно проверить и изменить. Заявка появится в
                    списке только после создания.
                  </p>}
                </div>
                <button
                  type="button"
                  autoFocus
                  className="icon-btn"
                  aria-label="Закрыть"
                  onClick={() => setModal(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <label>
                Тип заявки
                <select className="form-select"
                  value={form.type}
                    onChange={(e) => { setForm({ ...form, type: e.target.value }); setRequestPartOther(form.part); setProcurementConfirmed(false); }}
                >
                  <option value="repair">Ремонт</option>
                  <option value="procurement">Закупка</option>
                  <option value="selection">Подбор запчасти</option>
                </select>
              </label>
              {!buyingPart && requestDescriptionFields}
              {form.type !== "procurement" && <label>
                Работа в плане
                <input
                  value={requestWork}
                  onChange={(e) => setRequestWork(e.target.value)}
                  placeholder="Например, проверить переднюю подвеску"
                />
              </label>}
              <div className="form-two">
                {buyingPart ? <label>
                  Наименование или артикул
                  <input type="text" maxLength={200} autoComplete="off" value={requestPartId ? purchaseName : requestPartOther}
                    placeholder="Найдите в каталоге или введите свою деталь"
                    onChange={(event) => {
                      setRequestPartOther(event.target.value);
                      setRequestPartId("");
                      setProcurementConfirmed(false);
                    }} />
                </label> : <label>
                  Деталь из каталога
                  <select className="form-select" value={requestPartId} onChange={(event) => setRequestPartId(event.target.value)}>
                    <option value="">Не выбрана</option>
                    {parts.map((part) => <option key={part.id} value={part.id}>{part.name} · {part.sku}</option>)}
                  </select>
                </label>}
                <label>
                  Количество деталей
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={requestPartQty}
                    onChange={(e) => { setRequestPartQty(e.target.value); setProcurementConfirmed(false); }}
                  />
                </label>
              </div>
              {buyingPart && <>
                {purchaseMatches.length > 0 && <fieldset className="purchase-matches">
                  <legend>Подходящие детали каталога</legend>
                  {purchaseMatches.map((part) => <button className="button secondary" key={part.id} type="button" onClick={() => {
                    setRequestPartId(part.id);
                    setRequestPartOther("");
                    setRequestPartQty(suggestedPurchaseQuantity(part.id));
                    setProcurementConfirmed(false);
                  }}>{part.name} · {part.sku}</button>)}
                </fieldset>}
                {procurementCatalog.error && <p role="status">{procurementCatalog.error} Можно ввести деталь вручную.</p>}
                {selectedPurchasePart && (() => {
                  const balance = getProcurementBalance(data?.requests || [], vehicle.id, selectedPurchasePart.id, getPartFallbackDemand(vehicle, maintenancePlan?.vehicleId === vehicle.id ? maintenancePlan : null, selectedPurchasePart.id));
                  return balance.activeProcurement > 0 && <p role="status">Уже запрошено {balance.activeProcurement} шт. Осталось запросить {balance.uncovered} шт.</p>;
                })()}
                <details className="purchase-options"><summary>Описание и приоритет</summary>
                  {requestDescriptionFields}
                  <label>Приоритет<select className="form-select" value={form.priority} onChange={(event) => setForm({...form, priority: event.target.value})}>
                    <option value="normal">Обычный</option><option value="high">Высокий</option><option value="critical">Критический</option>
                  </select></label>
                </details>
                <label className="procurement-confirmation"><input type="checkbox" name="confirmProcurement" checked={procurementConfirmed}
                  disabled={!purchaseName || !Number.isSafeInteger(Number(requestPartQty)) || Number(requestPartQty) < 1 || Number(requestPartQty) > 10000}
                  onChange={(event) => setProcurementConfirmed(event.target.checked)} required />
                  <span>Подтверждаю внутреннюю заявку{purchaseName && <> · <strong>{purchaseName}</strong> · {requestPartQty} шт. · {translateSystemText(requestPartId ? "из каталога" : "введено вручную", interfaceLanguage)}</>}</span>
                </label>
              </>}
              {form.type !== "procurement" && <div className="form-two">
                <label>
                  Приоритет
                  <select className="form-select"
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: e.target.value })
                    }
                  >
                    <option value="normal">Обычный</option>
                    <option value="high">Высокий</option>
                    <option value="critical">Критический</option>
                  </select>
                </label>
                {form.type !== "procurement" && <label>
                  Количество
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({ ...form, quantity: e.target.value })
                    }
                  />
                </label>}
              </div>}
              {form.type !== "procurement" && <label>
                Деталь или позиция
                <input
                  maxLength={200}
                  value={form.part}
                  required={form.type === "procurement" && !requestPartId}
                  onChange={(e) => { setForm({ ...form, part: e.target.value }); if (form.type === "procurement") setProcurementConfirmed(false); }}
                  placeholder="Если известно"
                />
              </label>}
              <div className="form-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setModal(false)}
                >
                  Отмена
                </button>
                <PButton
                  type="submit"
                  variant="primary"
                  disabled={busy || (buyingPart ? !procurementConfirmed || !purchaseName : !form.title.trim() || !form.description.trim())}
                >
                  <Plus size={15} /> Создать заявку
                </PButton>
              </div>
            </form>
          </div>
        )}
        {activeRequest && (
          <div
            className="mehay-modal-backdrop"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setActiveRequest(null);
            }}
          >
            <div className="mehay-modal request-modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-heading" tabIndex={-1} onKeyDown={trapDialogTab}>
              <div className="modal-head">
                <div>
                  <div className="eyebrow">
                    {activeRequest.type === "repair"
                      ? "РЕМОНТ"
                      : activeRequest.type === "procurement"
                        ? "ЗАКУПКА"
                        : "Подбор запчасти"}{" "}
                    ·{" "}
                    {
                      data?.vehicles.find(
                        (v) => v.id === activeRequest.vehicleId,
                      )?.plate
                    }
                  </div>
                  <h2 id="request-modal-heading">{activeRequest.title || "Заявка"}</h2>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Закрыть"
                  onClick={() => setActiveRequest(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <p>{activeRequest.description}</p>
              {requestManualPart(activeRequest, parts) && (
                <p>
                  <b>Другая деталь:</b> {requestManualPart(activeRequest, parts)} ·{" "}
                  {activeRequest.quantity} шт.
                </p>
              )}
              <div className="request-actual">
                <h3>Работы</h3>
                {(activeRequest.workItems || []).map((item) => (
                  <label key={item.id} className="work-item">
                    <input
                      type="checkbox"
                      disabled={activeRequestClosed}
                      checked={item.done}
                      onChange={(e) =>
                        setActiveRequest({
                          ...activeRequest,
                          workItems: activeRequest.workItems?.map((w) =>
                            w.id === item.id
                              ? { ...w, done: e.target.checked }
                              : w,
                          ),
                        })
                      }
                    />
                    <span>{item.title}</span>
                    <small>{item.done ? "Выполнено" : "Запланировано"}</small>
                  </label>
                ))}
                {!(activeRequest.workItems || []).length && (
                  <p className="muted">Работы не указаны.</p>
                )}
                <h3>Детали</h3>
                {(activeRequest.parts || []).map((item) => {
                  return (
                    <label className="actual-part" key={item.partId}>
                      {requestPartName(activeRequest, item.partId, parts)} · план {item.quantity}
                      <span>
                        Использовано
                        <input
                          type="number"
                          disabled={activeRequestClosed}
                          min="0"
                          max={item.quantity}
                          value={item.usedQuantity}
                          onChange={(e) =>
                            setActiveRequest({
                              ...activeRequest,
                              parts: activeRequest.parts?.map((x) =>
                                x.partId === item.partId
                                  ? {
                                      ...x,
                                      usedQuantity: Number(e.target.value),
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
              <label>
                Статус
                <select
                  disabled={activeRequestClosed}
                  value={activeRequest.status}
                  onChange={(e) =>
                    setActiveRequest({
                      ...activeRequest,
                      status: e.target.value as Request["status"],
                    })
                  }
                >
                  <option value="new">Новая</option>
                  <option value="in_progress">В работе</option>
                  <option value="done">Выполнена</option>
                </select>
              </label>
              {activeRequestClosed ? (
                <p className="form-hint">
                  Заявка закрыта. Фактические данные доступны для просмотра.
                </p>
              ) : (
                activeRequest.type === "repair" && (
                  <small className="muted">
                    При завершении ремонта запись о работе добавится в историю
                    автомобиля.
                  </small>
                )
              )}
              <div className="form-actions">
                <button
                  className="button secondary"
                  onClick={() => setActiveRequest(null)}
                >
                  Закрыть
                </button>
                {!activeRequestClosed && (
                  <PButton type="button"
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      void updateRequest(activeRequest, activeRequest.status)
                    }
                  >
                    <Check size={15} /> Сохранить статус
                  </PButton>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {report &&
        createPortal(
          <div className="report-print-root">
            <ReportSummary
              report={report}
              checklistTemplate={data?.checklistTemplate || []}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
function VehicleTable({
  vehicles,
  selected,
  onSelect,
}: {
  vehicles: Vehicle[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="table-wrap fleet-register">
      <table>
        <thead>
          <tr>
            <th>АВТОМОБИЛЬ</th>
            <th>ВОДИТЕЛЬ · МАРШРУТ</th>
            <th>ПРОБЕГ</th>
            <th>СОСТОЯНИЕ</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr
              key={v.id}
              tabIndex={0}
              className={selected === v.id ? "selected-row" : ""}
              onClick={() => onSelect(v.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(v.id);
                }
              }}
            >
              <td>
                <div className="car-cell">
                  {v.photo?.url ? (
                    <img
                      className="fleet-thumb"
                      src={appPath(v.photo.url)}
                      alt={v.photo.label || `Фото модели ${v.model}`} title={v.photo.label}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="car-icon">
                      {v.vehicleType?.toLowerCase() === "автобус" ? <Bus size={21}/> : <Truck size={21}/>}
                    </span>
                  )}
                  <span>
                    <Plate value={v.plate} size="compact" />
                    <small>
                      {v.model} · {v.year} · {v.color || "цвет не указан"}
                    </small>
                  </span>
                </div>
              </td>
              <td>
                <b className="regular">{v.driver}</b>
                <small>{v.route}</small>
              </td>
              <td>
                <b>{rub(v.odometerKm)} км</b>
                <small>
                  ТО через {rub(Math.max(0, v.nextServiceKm - v.odometerKm))} км
                </small>
              </td>
              <td>
                                <VehicleStatus vehicle={v} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!vehicles.length && <div className="empty">Машины не найдены.</div>}
    </div>
  );
}
function Pagination({
  current,
  pages,
  total,
  pageSize,
  noun,
  onChange,
}: {
  current: number;
  pages: number;
  total: number;
  pageSize: number;
  noun: string;
  onChange: (page: number) => void;
}) {
  const first = total ? current * pageSize + 1 : 0;
  const last = Math.min(total, (current + 1) * pageSize);
  return (
    <nav className="pagination-controls" aria-label={`Страницы: ${noun}`}>
      <span>{first}–{last} из {total} {noun}</span>
      <div>
        <button type="button" className="button secondary small" disabled={current <= 0} onClick={() => onChange(current - 1)} aria-label="Предыдущая страница">Назад</button>
        <span aria-live="polite">{current + 1} / {pages}</span>
        <button type="button" className="button secondary small" disabled={current + 1 >= pages} onClick={() => onChange(current + 1)} aria-label="Следующая страница">Дальше</button>
      </div>
    </nav>
  );
}
function ReportSummary({
  report,
  checklistTemplate = [],
}: {
  report: Record<string, unknown>;
  checklistTemplate?: Template[];
}) {
  const summary = report.summary as
    | {
        completedWorkItems?: number;
        pendingWorkItems?: number;
        plannedPartsQuantityByUnit?: Record<string, number>;
        usedPartsQuantityByUnit?: Record<string, number>;
      }
    | undefined;
  const vehicle = report.vehicle as
    | { plate?: string; model?: string; color?: string; odometerKm?: number }
    | undefined;
  const diagnostics = report.diagnostics as
    | {
        dtcs?: string[];
        ml?: { label?: string; detail?: string; recordedAt?: string };
        telemetry?: {
          recordedAt: string;
          source: string;
          odometerKm: number | null;
          raw: Record<string, unknown>;
        }[];
      }
    | undefined;
  const inspection = report.inspection as
    | {
        items?: {
          id?: string;
          label?: string;
          status: string;
          comment: string;
        }[];
      }
    | undefined;
  const notes = report.notes as
    | { text: string; category?: string; status?: string; createdAt: string }[]
    | undefined;
  const requests = report.requests as
    | {
        title: string;
        status: string;
        workItems?: { title: string; done: boolean; urgency?: Urgency }[];
        type?: Request["type"];
        part?: string;
        parts?: { partId: string; quantity: number; urgency?: Urgency }[];
        approvalStatus?: string;
        plan?: MaintenancePlanSnapshot;
      }[]
    | undefined;
  const allParts = report.parts as
    | {
        id?: string;
        sku?: string;
        name?: string;
        unit?: string;
        plannedQuantity?: number;
        usedQuantity?: number;
      }[]
    | undefined;
  const parts = (allParts || []).filter(
    (part) =>
      Boolean((part as { kit?: unknown }).kit) ||
      (part.plannedQuantity || 0) > 0 ||
      (part.usedQuantity || 0) > 0,
  );
  const quantities = (values?: Record<string, number>) =>
    Object.entries(values || {})
      .map(([unit, quantity]) => `${quantity} ${unit}`)
      .join(", ") || "нет";
  return (
    <article className="report-sheet">
      <header>
        <div>
          <small>Мехай · диагностический лист и итог работ</small>
          <h2>
            {vehicle?.plate} · {vehicle?.model}
          </h2>
          <p>
            {vehicle?.color || "Цвет не указан"} · пробег{" "}
            {vehicle?.odometerKm == null
              ? "не указан"
              : `${rub(vehicle.odometerKm)} км`}
          </p>
        </div>
        <small>
          Снимок{" "}
          {report.generatedAt
            ? new Date(String(report.generatedAt)).toLocaleString("ru-RU")
            : "—"}
        </small>
      </header>
      <section>
        <h3>Диагностические данные</h3>
        <p>DTC: {diagnostics?.dtcs?.join(", ") || "не зарегистрированы"}</p>
        {diagnostics?.ml && (
          <p>
            Предварительная оценка ML: {diagnostics.ml.label} ·{" "}
            {diagnostics.ml.detail}
          </p>
        )}
        {diagnostics?.telemetry?.slice(0, 3).map((t, i) => (
          <details key={i}>
            <summary>
              {t.source} · {date(t.recordedAt)} ·{" "}
              {t.odometerKm == null ? "пробег н/д" : `${rub(t.odometerKm)} км`}
            </summary>
            <pre>{JSON.stringify(t.raw, null, 2)}</pre>
          </details>
        ))}
      </section>
      <section>
        <h3>Осмотр</h3>
        {inspection?.items?.map((i, n) => (
          <p key={n}>
            {i.status === "ok"
              ? "✓"
              : i.status === "issue"
                ? "!"
                : i.status === "na"
                  ? "—"
                  : "○"}{" "}
            {i.label ||
              checklistTemplate.find((item) => item.id === i.id)?.label ||
              `Пункт ${n + 1}`}{" "}
            {i.comment ? `· ${i.comment}` : ""}
          </p>
        )) || <p>Нет записей осмотра</p>}
      </section>
      <section>
        <h3>Заметки</h3>
        {notes?.map((n, i) => (
          <p key={i}>
            {n.text} · {n.category || "общее"} ·{" "}
            {n.status === "resolved" ? "решено" : "открыто"}
          </p>
        )) || <p>Нет заметок</p>}
      </section>
      <section>
        <h3>Заявки и работы</h3>
        {requests?.map((r, i) => (
          <div key={i}>
            <b>{r.title}</b> · {r.approvalStatus === "pending" ? "передана на согласование" : r.status === "done" ? "закрыта" : "в работе"}
            {r.workItems?.map((w, n) => (
              <p key={n}>
                {w.done ? "Выполнено" : "Запланировано"}: {w.title} · {interfaceText(urgencyLabel(w.urgency))}
              </p>
            ))}
            {r.plan && <>
              <p>Снимок плана от {date(r.plan.calculatedAt)} · ТО: {r.plan.forecast.expectedDate ? date(r.plan.forecast.expectedDate) : "дата не рассчитана"} · {r.plan.forecast.confidence === "reduced" ? "сниженная достоверность" : "обычная достоверность"}.</p>
              {r.plan.lines?.map((line, n) => <p key={`snapshot-${n}`}>Деталь {requestPartName(r, line.partId, allParts || [])}: {line.quantity} {line.catalog?.unit || "шт."} · {interfaceText(urgencyLabel(line.urgency))} · {interfaceText(purchaseStatusLabel(line.catalog?.purchasePreview?.status))}{line.catalog?.purchasePreview?.orderDate ? ` · заказать ${date(line.catalog.purchasePreview.orderDate)}` : ""}{line.catalog?.purchasePreview?.neededBy ? ` · крайний срок заказа ${date(line.catalog.purchasePreview.neededBy)}` : ""}{line.catalog?.purchasePreview?.arrivalDate ? ` · поступление ${date(line.catalog.purchasePreview.arrivalDate)}` : ""}{line.catalog?.purchasePreview?.arrivalRisk === true ? " · возможна задержка" : ""}</p>)}
            </>}
            {r.parts?.map((part, n) => <p key={`${part.partId}-${n}`}>Деталь {requestPartName(r, part.partId, allParts || [])}: {part.quantity} · {interfaceText(urgencyLabel(part.urgency))}</p>)}
          </div>
        )) || <p>Нет заявок</p>}
        <div className="report-summary">
          <b>Строк работ выполнено: {summary?.completedWorkItems ?? 0}</b>
          <b>Строк работ ожидают: {summary?.pendingWorkItems ?? 0}</b>
          <b>
            Детали запланированы:{" "}
            {quantities(summary?.plannedPartsQuantityByUnit)}
          </b>
          <b>
            Детали использованы: {quantities(summary?.usedPartsQuantityByUnit)}
          </b>
        </div>
      </section>
      <section>
        <h3>Детали</h3>
        {parts?.map((p, i) => (
          <p key={i}>
            {p.name} · {p.sku}: запланировано {p.plannedQuantity ?? 0} {p.unit},
            использовано {p.usedQuantity ?? 0} {p.unit}
          </p>
        )) || <p>Нет деталей</p>}
      </section>
      <footer>
        Подпись механика: _______________________　 Дата:
        _______________________
      </footer>
    </article>
  );
}
