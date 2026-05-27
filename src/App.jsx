import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Megaphone,
  Plus,
  Save,
  Truck,
  Users,
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

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState(today.getMonth());
  const [events, setEvents] = useState(() => loadLocal("ads_events", seedEvents));
  const [vehicles, setVehicles] = useState(() => loadLocal("ads_vehicles", seedVehicles));
  const [crew, setCrew] = useState(() => loadLocal("ads_crew", seedCrew));
  const [generalAlerts, setGeneralAlerts] = useState(() =>
    loadLocal("ads_general_alerts", "Atenção: confirmar checklists antes da saída dos veículos.")
  );
  const [corporateNotices, setCorporateNotices] = useState(() =>
    loadLocal("ads_corporate_notices", "Reunião operacional semanal: sexta-feira às 16h.")
  );
  const [syncStatus, setSyncStatus] = useState(hasSupabaseConfig ? "Conectando..." : "Modo local");
  const [viewMode, setViewMode] = useState("operacao");

  const cells = useMemo(() => getCalendarCells(year, monthIndex), [year, monthIndex]);
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  useEffect(() => {
    saveLocal("ads_events", events);
    saveLocal("ads_vehicles", vehicles);
    saveLocal("ads_crew", crew);
    saveLocal("ads_general_alerts", generalAlerts);
    saveLocal("ads_corporate_notices", corporateNotices);
  }, [events, vehicles, crew, generalAlerts, corporateNotices]);

  useEffect(() => {
    if (!hasSupabaseConfig) return;

    async function loadOnlineData() {
      setSyncStatus("Sincronizando...");
      const [eventsRes, vehiclesRes, crewRes, boardRes] = await Promise.all([
        supabase.from("calendar_entries").select("*").order("created_at"),
        supabase.from("vehicles").select("*").order("plate"),
        supabase.from("crew_members").select("*").order("name"),
        supabase.from("board_messages").select("*").eq("board_id", "principal").maybeSingle(),
      ]);

      if (!eventsRes.error && eventsRes.data?.length) setEvents(eventsRes.data);
      if (!vehiclesRes.error && vehiclesRes.data?.length) setVehicles(vehiclesRes.data);
      if (!crewRes.error && crewRes.data?.length) setCrew(crewRes.data);
      if (!boardRes.error && boardRes.data) {
        setGeneralAlerts(boardRes.data.general_alerts || "");
        setCorporateNotices(boardRes.data.corporate_notices || "");
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

  const isVideoWall = viewMode === "videowall";

  return (
    <div className="min-h-screen bg-slate-950 p-3 text-slate-100 md:p-4">
      <div className="mx-auto max-w-[1900px] space-y-4">
        <header className="flex flex-col gap-3 rounded-3xl bg-slate-900 p-4 shadow-xl ring-1 ring-white/10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-500/20 p-3">
              <CalendarDays className="h-7 w-7 text-emerald-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-4xl">Programação</h1>
              <p className="text-slate-300">Agenda mensal operacional, frota, tripulação, alertas e avisos.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge syncStatus={syncStatus} />
            <button onClick={() => setViewMode(isVideoWall ? "operacao" : "videowall")} className="rounded-2xl bg-slate-800 px-4 py-3 font-semibold hover:bg-slate-700">
              {isVideoWall ? "Modo operação" : "Modo videowall"}
            </button>
            <button onClick={() => changeMonth(-1)} className="rounded-2xl bg-slate-800 p-3 hover:bg-slate-700">
              <ChevronLeft />
            </button>
            <div className="min-w-56 text-center text-xl font-bold capitalize">{monthLabel}</div>
            <button onClick={() => changeMonth(1)} className="rounded-2xl bg-slate-800 p-3 hover:bg-slate-700">
              <ChevronRight />
            </button>
            <button onClick={() => persistMessages(generalAlerts, corporateNotices)} className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 hover:bg-emerald-400">
              <Save className="h-4 w-4" /> Salvar
            </button>
          </div>
        </header>

        <main className={`grid gap-4 ${isVideoWall ? "lg:grid-cols-[300px_1fr]" : "lg:grid-cols-[380px_1fr]"}`}>
          <aside className="space-y-4">
            <Panel title="Veículos" icon={Truck} action={addVehicle} compact={isVideoWall}>
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 text-xs font-semibold text-slate-400">
                <span>Placa</span><span>Tipo</span><span>Rodízio</span><span>Status</span>
              </div>
              {vehicles.map((vehicle) => (
                <div key={vehicle.id} className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2">
                  <Input value={vehicle.plate} onChange={(v) => updateVehicle(vehicle.id, "plate", v)} placeholder="Placa" />
                  <Input value={vehicle.type} onChange={(v) => updateVehicle(vehicle.id, "type", v)} placeholder="Tipo" />
                  <Input value={vehicle.rotation_day} onChange={(v) => updateVehicle(vehicle.id, "rotation_day", v)} placeholder="Dia" />
                  <Input value={vehicle.status} onChange={(v) => updateVehicle(vehicle.id, "status", v)} placeholder="Status" />
                </div>
              ))}
            </Panel>

            <Panel title="Tripulantes disponíveis" icon={Users} action={addCrew} compact={isVideoWall}>
              <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 text-xs font-semibold text-slate-400">
                <span>Nome</span><span>Função</span><span>Status</span>
              </div>
              {crew.map((member) => (
                <div key={member.id} className="grid grid-cols-[1.2fr_1fr_1fr] gap-2">
                  <Input value={member.name} onChange={(v) => updateCrew(member.id, "name", v)} placeholder="Nome" />
                  <Input value={member.role} onChange={(v) => updateCrew(member.id, "role", v)} placeholder="Função" />
                  <Input value={member.status} onChange={(v) => updateCrew(member.id, "status", v)} placeholder="Status" />
                </div>
              ))}
            </Panel>
          </aside>

          <section className="rounded-3xl bg-slate-900 p-4 shadow-xl ring-1 ring-white/10">
            <div className="grid grid-cols-7 gap-2 pb-2">
              {weekDays.map((day) => (
                <div key={day} className="rounded-2xl bg-slate-800 p-3 text-center text-sm font-bold uppercase tracking-wide text-emerald-300">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {cells.map((day, index) => {
                if (!day) return <div key={`empty-${index}`} className={`${isVideoWall ? "min-h-28" : "min-h-40"} rounded-2xl bg-slate-950/40`} />;
                const key = isoDate(year, monthIndex, day);
                return (
                  <CalendarCell
                    key={key}
                    day={day}
                    items={eventsByDate[key] || []}
                    onAdd={() => addEvent(key)}
                    onUpdate={updateEvent}
                    onRemove={removeEvent}
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
            value={generalAlerts}
            onChange={setGeneralAlerts}
            onBlur={() => persistMessages(generalAlerts, corporateNotices)}
          />
          <FooterBox
            title="Avisos corporativos"
            icon={Megaphone}
            value={corporateNotices}
            onChange={setCorporateNotices}
            onBlur={() => persistMessages(generalAlerts, corporateNotices)}
          />
        </footer>
      </div>
    </div>
  );
}

function StatusBadge({ syncStatus }) {
  const online = syncStatus === "Online";
  const Icon = online ? Cloud : CloudOff;
  return (
    <span className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold ${online ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-300"}`}>
      <Icon className="h-4 w-4" />
      {syncStatus}
    </span>
  );
}

function Panel({ title, icon: Icon, action, children, compact }) {
  return (
    <section className="rounded-3xl bg-slate-900 p-4 shadow-xl ring-1 ring-white/10">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-emerald-300" />
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

function CalendarCell({ day, items, onAdd, onUpdate, onRemove, compact }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${compact ? "min-h-28" : "min-h-40"} rounded-2xl bg-slate-950 p-2 ring-1 ring-white/10`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-emerald-300">{day}</span>
        {!compact && (
          <button onClick={onAdd} className="rounded-lg bg-slate-800 p-1.5 hover:bg-slate-700">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="group relative">
            <textarea
              value={item.content}
              onChange={(e) => onUpdate(item.id, e.target.value)}
              className={`${compact ? "min-h-10 text-[11px]" : "min-h-14 text-xs"} w-full resize-none rounded-xl border border-slate-800 bg-slate-900 p-2 leading-snug outline-none focus:border-emerald-400`}
              placeholder="Inserir atendimento, rota, veículo, equipe..."
            />
            {!compact && (
              <button onClick={() => onRemove(item.id)} className="absolute right-1 top-1 hidden rounded-md bg-red-500 px-1.5 text-xs text-white group-hover:block">
                x
              </button>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function FooterBox({ title, icon: Icon, value, onChange, onBlur }) {
  return (
    <section className="rounded-3xl bg-slate-900 p-4 shadow-xl ring-1 ring-white/10">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-5 w-5 text-emerald-300" />
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="h-28 w-full resize-none rounded-2xl border border-slate-800 bg-slate-950 p-3 outline-none focus:border-emerald-400"
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
      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-2 py-2 text-xs outline-none focus:border-emerald-400"
    />
  );
}
