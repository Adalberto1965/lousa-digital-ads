import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Cloud,
  CloudOff,
  GripVertical,
  Megaphone,
  Plus,
  Save,
  Truck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./supabaseClient";

const weekDays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const seedVehicles = [
  { id: crypto.randomUUID(), plate: "ADS-4821", type: "Truck", rotation_day: "Segunda", status: "Disponível" },
  { id: crypto.randomUUID(), plate: "ADS-7734", type: "Bitruck", rotation_day: "Quarta", status: "Em rota" },
  { id: crypto.randomUUID(), plate: "ADS-9921", type: "VUC", rotation_day: "Sexta", status: "Manutenção" },
];

const seedCrew = [
  { id: crypto.randomUUID(), name: "Juan", role: "Motorista", status: "Disponível" },
  { id: crypto.randomUUID(), name: "Antonio", role: "Motorista", status: "Disponível" },
  { id: crypto.randomUUID(), name: "Lucas", role: "Ajudante", status: "Disponível" },
  { id: crypto.randomUUID(), name: "Eudimauro", role: "Ajudante", status: "Em rota" },
];

const seedEvents = [
  { id: crypto.randomUUID(), operation_date: "2026-05-06", content: "Fischer • Juan / Eudimauro" },
  { id: crypto.randomUUID(), operation_date: "2026-05-06", content: "Trampo • Antonio / Lucas" },
  { id: crypto.randomUUID(), operation_date: "2026-05-13", content: "Limpeza / manutenção do galpão" },
  { id: crypto.randomUUID(), operation_date: "2026-05-21", content: "Baixada Santista 06:00" },
  { id: crypto.randomUUID(), operation_date: "2026-05-22", content: "Ecoville • Antonio / Lucas" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function isoDate(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function todayIso() {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

function getCalendarCells(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const startOffset = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function loadLocal(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function emptyAssignmentDay() {
  return { vehicles: [], crew: [] };
}

const plateRotationMap = {
  1: "Segunda",
  2: "Segunda",
  3: "Terça",
  4: "Terça",
  5: "Quarta",
  6: "Quarta",
  7: "Quinta",
  8: "Quinta",
  9: "Sexta",
  0: "Sexta",
};

function getPlateLastDigit(plate = "") {
  const digits = String(plate).replace(/\D/g, "");
  if (!digits) return null;
  return Number(digits.at(-1));
}

function getRotationDayFromPlate(plate = "") {
  const lastDigit = getPlateLastDigit(plate);
  return lastDigit === null ? "" : plateRotationMap[lastDigit] || "";
}

function getWeekdayNameFromIso(operationDate) {
  const date = new Date(`${operationDate}T00:00:00`);
  const dayIndex = date.getDay();
  return ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][dayIndex];
}

function hasRotationAlert(vehicle, operationDate) {
  if (!vehicle?.plate || !operationDate) return false;
  const rotationDay = getRotationDayFromPlate(vehicle.plate);
  const weekday = getWeekdayNameFromIso(operationDate);
  return rotationDay && rotationDay === weekday;
}

function getDayAssignment(assignments, operationDate) {
  return assignments[operationDate] || emptyAssignmentDay();
}

function buildAssignmentRow(operationDate, resourceType, resourceId) {
  return {
    id: `${operationDate}_${resourceType}_${resourceId}`,
    operation_date: operationDate,
    resource_type: resourceType,
    resource_id: resourceId,
    updated_at: new Date().toISOString(),
  };
}

function parseDragId(value) {
  const parts = String(value).split(":");
  if (parts[0] === "source") return { origin: "source", type: parts[1], id: parts[2] };
  if (parts[0] === "assigned") return { origin: "assigned", type: parts[1], date: parts[2], id: parts[3] };
  return null;
}

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState(today.getMonth());
  const [events, setEvents] = useState(() => loadLocal("ads_events", seedEvents));
  const [vehicles, setVehicles] = useState(() => loadLocal("ads_vehicles", seedVehicles));
  const [crew, setCrew] = useState(() => loadLocal("ads_crew", seedCrew));
  const [dayAssignments, setDayAssignments] = useState(() => loadLocal("ads_day_assignments", {}));
  const [dayStatuses, setDayStatuses] = useState(() => loadLocal("ads_day_statuses", {}));
  const [generalAlerts, setGeneralAlerts] = useState(() =>
    loadLocal("ads_general_alerts", "Atenção: confirmar checklists antes da saída dos veículos.")
  );
  const [corporateNotices, setCorporateNotices] = useState(() =>
    loadLocal("ads_corporate_notices", "Reunião operacional semanal: sexta-feira às 16h.")
  );
  const [syncStatus, setSyncStatus] = useState(hasSupabaseConfig ? "Conectando..." : "Modo local");
  const [viewMode, setViewMode] = useState("operacao");
  const [clockDate, setClockDate] = useState(todayIso());

  const cells = useMemo(() => getCalendarCells(year, monthIndex), [year, monthIndex]);
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const vehiclesById = useMemo(() => Object.fromEntries(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);
  const crewById = useMemo(() => Object.fromEntries(crew.map((member) => [member.id, member])), [crew]);

  useEffect(() => {
    const interval = setInterval(() => setClockDate(todayIso()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    saveLocal("ads_events", events);
    saveLocal("ads_vehicles", vehicles);
    saveLocal("ads_crew", crew);
    saveLocal("ads_day_assignments", dayAssignments);
    saveLocal("ads_day_statuses", dayStatuses);
    saveLocal("ads_general_alerts", generalAlerts);
    saveLocal("ads_corporate_notices", corporateNotices);
  }, [events, vehicles, crew, dayAssignments, dayStatuses, generalAlerts, corporateNotices]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;

    async function loadOnlineData() {
      setSyncStatus("Sincronizando...");
      const [eventsRes, vehiclesRes, crewRes, boardRes, assignmentsRes, statusesRes] = await Promise.all([
        supabase.from("calendar_entries").select("*").order("created_at"),
        supabase.from("vehicles").select("*").order("plate"),
        supabase.from("crew_members").select("*").order("name"),
        supabase.from("board_messages").select("*").eq("board_id", "principal").maybeSingle(),
        supabase.from("day_assignments").select("*"),
        supabase.from("day_statuses").select("*"),
      ]);

      if (!eventsRes.error && eventsRes.data?.length) setEvents(eventsRes.data);
      if (!vehiclesRes.error && vehiclesRes.data?.length) setVehicles(vehiclesRes.data);
      if (!crewRes.error && crewRes.data?.length) setCrew(crewRes.data);
      if (!boardRes.error && boardRes.data) {
        setGeneralAlerts(boardRes.data.general_alerts || "");
        setCorporateNotices(boardRes.data.corporate_notices || "");
      }
      if (!assignmentsRes.error && assignmentsRes.data?.length) {
        const nextAssignments = assignmentsRes.data.reduce((acc, row) => {
          const date = row.operation_date;
          acc[date] = acc[date] || emptyAssignmentDay();
          if (row.resource_type === "vehicle" && !acc[date].vehicles.includes(row.resource_id)) {
            acc[date].vehicles.push(row.resource_id);
          }
          if (row.resource_type === "crew" && !acc[date].crew.includes(row.resource_id)) {
            acc[date].crew.push(row.resource_id);
          }
          return acc;
        }, {});
        setDayAssignments(nextAssignments);
      }
      if (!statusesRes.error && statusesRes.data?.length) {
        const nextStatuses = Object.fromEntries(statusesRes.data.map((row) => [row.operation_date, row.status]));
        setDayStatuses(nextStatuses);
      }
      setSyncStatus("Online");
    }

    loadOnlineData();
  }, []);

  async function persist(table, rows) {
    if (!hasSupabaseConfig) return;
    setSyncStatus("Salvando...");
    const { error } = await supabase.from(table).upsert(rows);
    setSyncStatus(error ? "Erro ao salvar" : "Online");
  }

  async function persistMessages(nextAlerts, nextNotices) {
    if (!hasSupabaseConfig) return;
    setSyncStatus("Salvando...");
    const { error } = await supabase.from("board_messages").upsert({
      board_id: "principal",
      general_alerts: nextAlerts,
      corporate_notices: nextNotices,
      updated_at: new Date().toISOString(),
    });
    setSyncStatus(error ? "Erro ao salvar" : "Online");
  }

  async function persistAssignmentsForDate(operationDate, assignmentsForDate) {
    if (!hasSupabaseConfig) return;
    setSyncStatus("Salvando...");
    const rows = [
      ...assignmentsForDate.vehicles.map((id) => buildAssignmentRow(operationDate, "vehicle", id)),
      ...assignmentsForDate.crew.map((id) => buildAssignmentRow(operationDate, "crew", id)),
    ];
    const deleteRes = await supabase.from("day_assignments").delete().eq("operation_date", operationDate);
    const insertRes = rows.length ? await supabase.from("day_assignments").insert(rows) : { error: null };
    setSyncStatus(deleteRes.error || insertRes.error ? "Erro ao salvar" : "Online");
  }

  async function persistDayStatus(operationDate, status) {
    if (!hasSupabaseConfig) return;
    setSyncStatus("Salvando...");
    const { error } = await supabase.from("day_statuses").upsert({
      operation_date: operationDate,
      status,
      updated_at: new Date().toISOString(),
    });
    setSyncStatus(error ? "Erro ao salvar" : "Online");
  }

  const eventsByDate = useMemo(() => {
    return events.reduce((acc, item) => {
      acc[item.operation_date] = acc[item.operation_date] || [];
      acc[item.operation_date].push(item);
      return acc;
    }, {});
  }, [events]);

  const changeMonth = (delta) => {
    const d = new Date(year, monthIndex + delta, 1);
    setYear(d.getFullYear());
    setMonthIndex(d.getMonth());
  };

  const addEvent = async (operation_date) => {
    const next = { id: crypto.randomUUID(), operation_date, content: "" };
    const updated = [...events, next];
    setEvents(updated);
    await persist("calendar_entries", updated);
  };

  const updateEvent = async (id, content) => {
    const updated = events.map((item) => (item.id === id ? { ...item, content } : item));
    setEvents(updated);
    await persist("calendar_entries", updated);
  };

  const removeEvent = async (id) => {
    const updated = events.filter((item) => item.id !== id);
    setEvents(updated);
    if (hasSupabaseConfig) await supabase.from("calendar_entries").delete().eq("id", id);
  };

  const addVehicle = async () => {
    const updated = [...vehicles, { id: crypto.randomUUID(), plate: "", type: "", rotation_day: "", status: "Disponível" }];
    setVehicles(updated);
    await persist("vehicles", updated);
  };

  const updateVehicle = async (id, field, value) => {
    const updated = vehicles.map((v) => (v.id === id ? { ...v, [field]: value } : v));
    setVehicles(updated);
    await persist("vehicles", updated);
  };

  const addCrew = async () => {
    const updated = [...crew, { id: crypto.randomUUID(), name: "", role: "", status: "Disponível" }];
    setCrew(updated);
    await persist("crew_members", updated);
  };

  const updateCrew = async (id, field, value) => {
    const updated = crew.map((c) => (c.id === id ? { ...c, [field]: value } : c));
    setCrew(updated);
    await persist("crew_members", updated);
  };

  async function assignResourceToDate({ resourceType, resourceId, targetDate, fromDate }) {
    const field = resourceType === "vehicle" ? "vehicles" : "crew";
    const label = resourceType === "vehicle" ? vehiclesById[resourceId]?.plate || "Veículo" : crewById[resourceId]?.name || "Tripulante";

    let datesToPersist = [];
    let blocked = false;
    let duplicateMessage = "";

    const nextAssignments = { ...dayAssignments };
    const target = { ...getDayAssignment(nextAssignments, targetDate) };
    target.vehicles = [...target.vehicles];
    target.crew = [...target.crew];

    if (target[field].includes(resourceId) && fromDate !== targetDate) {
      blocked = true;
      duplicateMessage = `${label} já está escalado neste dia.`;
    }

    if (blocked) {
      alert(duplicateMessage);
      return;
    }

    if (fromDate && fromDate !== targetDate) {
      const source = { ...getDayAssignment(nextAssignments, fromDate) };
      source.vehicles = source.vehicles.filter((id) => !(resourceType === "vehicle" && id === resourceId));
      source.crew = source.crew.filter((id) => !(resourceType === "crew" && id === resourceId));
      nextAssignments[fromDate] = source;
      datesToPersist.push(fromDate);
    }

    if (!target[field].includes(resourceId)) {
      target[field].push(resourceId);
    } else if (!fromDate) {
      alert(`${label} já está escalado neste dia.`);
      return;
    }

    nextAssignments[targetDate] = target;
    datesToPersist.push(targetDate);
    setDayAssignments(nextAssignments);

    for (const date of [...new Set(datesToPersist)]) {
      await persistAssignmentsForDate(date, nextAssignments[date]);
    }
  }

  async function handleDragEnd(event) {
    const activeData = parseDragId(event.active?.id);
    const overId = String(event.over?.id || "");
    if (!activeData || !overId.startsWith("day:")) return;

    const targetDate = overId.replace("day:", "");
    await assignResourceToDate({
      resourceType: activeData.type,
      resourceId: activeData.id,
      fromDate: activeData.origin === "assigned" ? activeData.date : null,
      targetDate,
    });
  }

  async function removeAssignment(operationDate, resourceType, resourceId) {
    const field = resourceType === "vehicle" ? "vehicles" : "crew";
    const current = getDayAssignment(dayAssignments, operationDate);
    const nextForDate = {
      vehicles: [...current.vehicles],
      crew: [...current.crew],
      [field]: current[field].filter((id) => id !== resourceId),
    };
    const nextAssignments = { ...dayAssignments, [operationDate]: nextForDate };
    setDayAssignments(nextAssignments);
    await persistAssignmentsForDate(operationDate, nextForDate);
  }

  async function setStatusForDate(operationDate, status) {
    if (operationDate > clockDate) return;
    const nextStatuses = { ...dayStatuses, [operationDate]: status };
    setDayStatuses(nextStatuses);
    await persistDayStatus(operationDate, status);
  }

  const isVideoWall = viewMode === "videowall";

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-white p-3 text-slate-950 md:p-4">
        <div className="mx-auto max-w-[1900px] space-y-4">
          <header className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-xl ring-1 ring-slate-200 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-600 p-3 shadow-sm">
                <CalendarDays className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-4xl">Programação</h1>
                <p className="text-slate-600">Agenda mensal operacional, frota, tripulação, alertas e avisos.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge syncStatus={syncStatus} />
              <button onClick={() => setViewMode(isVideoWall ? "operacao" : "videowall")} className="rounded-2xl bg-slate-100 px-4 py-3 font-semibold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-200">
                {isVideoWall ? "Modo operação" : "Modo videowall"}
              </button>
              <button onClick={() => changeMonth(-1)} className="rounded-2xl bg-slate-100 p-3 text-slate-900 ring-1 ring-slate-200 hover:bg-slate-200">
                <ChevronLeft />
              </button>
              <div className="min-w-56 text-center text-xl font-bold capitalize">{monthLabel}</div>
              <button onClick={() => changeMonth(1)} className="rounded-2xl bg-slate-100 p-3 text-slate-900 ring-1 ring-slate-200 hover:bg-slate-200">
                <ChevronRight />
              </button>
              <button onClick={() => persistMessages(generalAlerts, corporateNotices)} className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-500">
                <Save className="h-4 w-4" /> Salvar
              </button>
            </div>
          </header>

          <main className={`grid gap-4 ${isVideoWall ? "lg:grid-cols-[300px_1fr]" : "lg:grid-cols-[380px_1fr]"}`}>
            <aside className="space-y-4">
              <Panel title="Veículos" icon={Truck} action={addVehicle} compact={isVideoWall}>
                <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 text-xs font-semibold text-slate-600">
                  <span>Placa</span><span>Tipo</span><span>Rodízio</span><span>Status</span>
                </div>
                {vehicles.map((vehicle) => (
                  <ResourceRow key={vehicle.id} type="vehicle" id={vehicle.id} label={`${vehicle.plate || "Veículo sem placa"}${getRotationDayFromPlate(vehicle.plate) ? ` • Rodízio ${getRotationDayFromPlate(vehicle.plate)}` : ""}`}>
                    <Input value={vehicle.plate} onChange={(v) => updateVehicle(vehicle.id, "plate", v)} placeholder="Placa" />
                    <Input value={vehicle.type} onChange={(v) => updateVehicle(vehicle.id, "type", v)} placeholder="Tipo" />
                    <Input value={vehicle.rotation_day} onChange={(v) => updateVehicle(vehicle.id, "rotation_day", v)} placeholder="Dia" />
                    <Input value={vehicle.status} onChange={(v) => updateVehicle(vehicle.id, "status", v)} placeholder="Status" />
                  </ResourceRow>
                ))}
              </Panel>

              <Panel title="Tripulantes disponíveis" icon={Users} action={addCrew} compact={isVideoWall}>
                <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 text-xs font-semibold text-slate-600">
                  <span>Nome</span><span>Função</span><span>Status</span>
                </div>
                {crew.map((member) => (
                  <ResourceRow key={member.id} type="crew" id={member.id} label={member.name || "Tripulante sem nome"} grid="grid-cols-[1.2fr_1fr_1fr]">
                    <Input value={member.name} onChange={(v) => updateCrew(member.id, "name", v)} placeholder="Nome" />
                    <Input value={member.role} onChange={(v) => updateCrew(member.id, "role", v)} placeholder="Função" />
                    <Input value={member.status} onChange={(v) => updateCrew(member.id, "status", v)} placeholder="Status" />
                  </ResourceRow>
                ))}
              </Panel>
            </aside>

            <section className="rounded-3xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
              <div className="grid grid-cols-7 gap-2 pb-2">
                {weekDays.map((day) => (
                  <div key={day} className="rounded-2xl bg-slate-100 p-3 text-center text-sm font-bold uppercase tracking-wide text-slate-950 ring-1 ring-slate-200">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {cells.map((day, index) => {
                  if (!day) return <div key={`empty-${index}`} className={`${isVideoWall ? "min-h-28" : "min-h-40"} rounded-2xl bg-slate-50 ring-1 ring-slate-100`} />;
                  const key = isoDate(year, monthIndex, day);
                  return (
                    <CalendarCell
                      key={key}
                      operationDate={key}
                      day={day}
                      todayDate={clockDate}
                      status={dayStatuses[key]}
                      assigned={getDayAssignment(dayAssignments, key)}
                      vehiclesById={vehiclesById}
                      crewById={crewById}
                      items={eventsByDate[key] || []}
                      onAdd={() => addEvent(key)}
                      onUpdate={updateEvent}
                      onRemove={removeEvent}
                      onRemoveAssignment={removeAssignment}
                      onSetStatus={setStatusForDate}
                      compact={isVideoWall}
                    />
                  );
                })}
              </div>
            </section>
          </main>

          <footer className="grid gap-4 lg:grid-cols-2">
            <FooterBox
              title="Mensagens de alerta geral"
              icon={AlertTriangle}
              tone="alert"
              value={generalAlerts}
              onChange={setGeneralAlerts}
              onBlur={() => persistMessages(generalAlerts, corporateNotices)}
            />
            <FooterBox
              title="Avisos corporativos"
              icon={Megaphone}
              tone="corporate"
              value={corporateNotices}
              onChange={setCorporateNotices}
              onBlur={() => persistMessages(generalAlerts, corporateNotices)}
            />
          </footer>
        </div>
      </div>
    </DndContext>
  );
}

function StatusBadge({ syncStatus }) {
  const online = syncStatus === "Online";
  const Icon = online ? Cloud : CloudOff;
  return (
    <span className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold ${online ? "bg-emerald-500/20 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
      <Icon className="h-4 w-4" />
      {syncStatus}
    </span>
  );
}

function Panel({ title, icon: Icon, action, children, compact }) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">          <Icon className="h-5 w-5 text-emerald-700" />
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
        {!compact && (
          <button onClick={action} className="rounded-xl bg-emerald-500 p-2 text-slate-950 hover:bg-emerald-400">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ResourceRow({ type, id, label, grid = "grid-cols-[1fr_1fr_1fr_1fr]", children }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `source:${type}:${id}` });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div ref={setNodeRef} style={style} className={`rounded-2xl border border-slate-200 bg-white p-2 ${isDragging ? "z-50 opacity-70 ring-2 ring-emerald-400" : ""}`}>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
        <span className="truncate font-semibold">{label}</span>
        <button type="button" {...listeners} {...attributes} className="cursor-grab rounded-lg bg-slate-100 p-1 text-emerald-700 ring-1 ring-slate-200 active:cursor-grabbing" title="Arrastar para um dia">
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className={`grid ${grid} gap-2`}>{children}</div>
    </div>
  );
}

function CalendarCell({
  operationDate,
  day,
  todayDate,
  status,
  assigned,
  vehiclesById,
  crewById,
  items,
  onAdd,
  onUpdate,
  onRemove,
  onRemoveAssignment,
  onSetStatus,
  compact,
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `day:${operationDate}` });
  const isToday = operationDate === todayDate;
  const canFinalize = operationDate <= todayDate;

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${compact ? "min-h-28" : "min-h-48"} rounded-2xl bg-white p-2 ring-1 shadow-sm ${isOver ? "ring-2 ring-emerald-400" : isToday ? "ring-2 ring-amber-400" : "ring-slate-200"}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-emerald-700 ring-1 ring-slate-200">{day}</span>
          {status === "done" && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          {status === "not_done" && <XCircle className="h-5 w-5 text-red-400" />}
          {isToday && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Hoje</span>}
        </div>
        {!compact && (
          <button onClick={onAdd} className="rounded-lg bg-slate-100 p-1.5 text-slate-900 ring-1 ring-slate-200 hover:bg-slate-200">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mb-2 space-y-1">
        {!!assigned.vehicles.length && <SectionLabel>Veículos</SectionLabel>}
        {assigned.vehicles.map((id) => {
          const vehicle = vehiclesById[id];
          const rotationAlert = hasRotationAlert(vehicle, operationDate);
          return (
            <AssignedCard
              key={`vehicle-${id}`}
              type="vehicle"
              operationDate={operationDate}
              id={id}
              label={vehicle?.plate || "Veículo"}
              description={rotationAlert ? `${vehicle?.type || ""} • Rodízio SP` : vehicle?.type}
              statusColor={rotationAlert ? "yellow" : "green"}
              title={rotationAlert ? `Alerta: rodízio SP na ${getRotationDayFromPlate(vehicle?.plate)} para placa final ${getPlateLastDigit(vehicle?.plate)}` : "Disponibilidade plena"}
              onRemove={onRemoveAssignment}
            />
          );
        })}
        {!!assigned.crew.length && <SectionLabel>Tripulação</SectionLabel>}
        {assigned.crew.map((id) => (
          <AssignedCard key={`crew-${id}`} type="crew" operationDate={operationDate} id={id} label={crewById[id]?.name || "Tripulante"} description={crewById[id]?.role} statusColor="green" onRemove={onRemoveAssignment} />
        ))}
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="group relative">
            <textarea
              value={item.content}
              onChange={(e) => onUpdate(item.id, e.target.value)}
              className={`${compact ? "min-h-10 text-[11px]" : "min-h-14 text-xs"} w-full resize-none rounded-xl border border-slate-200 bg-white p-2 leading-snug text-slate-950 outline-none focus:border-emerald-500`}
              placeholder="Inserir escala, roteiro, observação..."
            />
            {!compact && (
              <button onClick={() => onRemove(item.id)} className="absolute right-1 top-1 hidden rounded-md bg-red-500 px-1.5 text-xs text-white group-hover:block">
                x
              </button>
            )}
          </div>
        ))}
      </div>

      {!compact && (
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
          <span className="text-[10px] font-semibold uppercase text-slate-500">Finalização</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSetStatus(operationDate, "done")}
              disabled={!canFinalize}
              className={`rounded-full p-1 ${status === "done" ? "bg-emerald-500 text-slate-950" : "bg-slate-100 text-emerald-700 ring-1 ring-slate-200"} disabled:cursor-not-allowed disabled:opacity-30`}
              title="Realizado"
            >
              <Circle className="h-4 w-4 fill-current" />
            </button>
            <button
              onClick={() => onSetStatus(operationDate, "not_done")}
              disabled={!canFinalize}
              className={`rounded-full p-1 ${status === "not_done" ? "bg-red-500 text-white" : "bg-slate-100 text-red-700 ring-1 ring-slate-200"} disabled:cursor-not-allowed disabled:opacity-30`}
              title="Não realizado"
            >
              <Circle className="h-4 w-4 fill-current" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function SectionLabel({ children }) {
  return <div className="pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{children}</div>;
}

function AssignedCard({ type, operationDate, id, label, description, statusColor = "green", title, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `assigned:${type}:${operationDate}:${id}` });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  const statusClasses = statusColor === "yellow" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50";
  const dotClasses = statusColor === "yellow" ? "bg-amber-400" : "bg-emerald-500";

  return (
    <div ref={setNodeRef} style={style} title={title} className={`group flex items-center justify-between rounded-xl border px-2 py-1 text-xs ${statusClasses} ${isDragging ? "z-50 opacity-70 ring-2 ring-emerald-400" : ""}`}>
      <button type="button" {...listeners} {...attributes} className="flex min-w-0 cursor-grab items-center gap-1 active:cursor-grabbing">
        <GripVertical className="h-3 w-3 shrink-0 text-emerald-700" />
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClasses}`} />
        <span className="truncate font-bold text-slate-950">{label}</span>
        {description && <span className="hidden truncate text-slate-600 xl:inline">• {description}</span>}
      </button>
      <button onClick={() => onRemove(operationDate, type, id)} className="ml-1 rounded-md p-0.5 text-slate-500 hover:bg-red-500 hover:text-white" title="Remover da escala">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function FooterBox({ title, icon: Icon, tone = "default", value, onChange, onBlur }) {
  const isAlert = tone === "alert";
  const isCorporate = tone === "corporate";
  return (
    <section className="rounded-3xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${isAlert ? "text-red-600" : "text-emerald-700"}`} />
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`h-28 w-full resize-none rounded-2xl border p-3 font-semibold outline-none ${isAlert ? "border-red-200 bg-red-50 text-red-700 focus:border-red-500" : isCorporate ? "border-emerald-200 bg-emerald-50 text-emerald-800 focus:border-emerald-600" : "border-slate-200 bg-white text-slate-950 focus:border-emerald-500"}`}
      />
    </section>
  );
}

function Input({ value, onChange, placeholder }) {
  return (
    <input
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs outline-none focus:border-emerald-500"
    />
  );
}
