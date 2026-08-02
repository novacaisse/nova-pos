// RH ZegERP (Frontend Phase 7) — Employés / Départements & Postes /
// Pointage / Congés. Périmètre strictement resserré owner/manager/
// hr_manager (données personnelles sensibles) — pas d'accountant ni
// d'autre rôle métier, cf. ARCHITECTURE_ERP.md.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Trash2, X, AlertCircle, Users, Building2, CalendarCheck, CalendarClock, CheckCircle2, XCircle, FileText } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";
import {
  useErpDepartments, useUpsertErpDepartment, useDeleteErpDepartment,
  useErpPositions, useUpsertErpPosition, useDeleteErpPosition,
  useErpEmployees, useUpsertErpEmployee, useDeleteErpEmployee,
  useErpAttendance, useUpsertErpAttendance,
  useErpLeaveRequests, useUpsertErpLeaveRequest, useReviewErpLeaveRequest, useDeleteErpLeaveRequest,
  useErpEmployeeDocuments, useUpsertErpEmployeeDocument, useDeleteErpEmployeeDocument,
  type ErpEmployee, type ErpEmployeeStatus, type ErpLeaveRequest, type ErpLeaveType, type ErpAttendanceStatus,
} from "@/lib/data/erpHrHooks";

export const Route = createFileRoute("/app/erp/rh")({
  component: ErpRhPage,
});

const TABS = [
  { k: "employes", label: "Employés", icon: Users },
  { k: "structure", label: "Départements & Postes", icon: Building2 },
  { k: "pointage", label: "Pointage", icon: CalendarCheck },
  { k: "conges", label: "Congés", icon: CalendarClock },
] as const;
type TabKey = (typeof TABS)[number]["k"];

function ErpRhPage() {
  const [tab, setTab] = useState<TabKey>("employes");
  const { data: myRole } = useMyRole();
  const canManage = myRole === "owner" || myRole === "manager" || myRole === "hr_manager";

  return (
    <div>
      <PageHeader title="RH" subtitle="Employés, départements, pointage et congés" />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
                tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "employes" && <EmployeesTab canManage={canManage} />}
        {tab === "structure" && <StructureTab canManage={canManage} />}
        {tab === "pointage" && <AttendanceTab canManage={canManage} />}
        {tab === "conges" && <LeaveTab canManage={canManage} />}
      </div>
    </div>
  );
}

// ============ Employés ============
const EMPLOYEE_STATUS_LABEL: Record<ErpEmployeeStatus, string> = { active: "Actif", on_leave: "En congé", terminated: "Parti" };
function EmployeesTab({ canManage }: { canManage: boolean }) {
  const { data: employees = [], isLoading } = useErpEmployees();
  const { data: departments = [] } = useErpDepartments();
  const { data: positions = [] } = useErpPositions();
  const upsert = useUpsertErpEmployee();
  const remove = useDeleteErpEmployee();
  const [editing, setEditing] = useState<ErpEmployee | null | "new">(null);
  const [viewing, setViewing] = useState<ErpEmployee | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouvel employé
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun employé pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {employees.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <button onClick={() => setViewing(e)} className="min-w-0 flex-1 text-left hover:underline">
                <div className="font-medium">{e.first_name} {e.last_name}</div>
                <div className="text-xs text-muted-foreground">{[e.erp_positions?.title, e.erp_departments?.name].filter(Boolean).join(" · ") || "—"}</div>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", e.status === "active" ? "bg-success/15 text-success" : e.status === "on_leave" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>
                  {EMPLOYEE_STATUS_LABEL[e.status]}
                </span>
                {canManage && (
                  <>
                    <button onClick={() => setEditing(e)} className="text-muted-foreground hover:text-primary">Modifier</button>
                    <button onClick={() => { if (confirm(`Supprimer ${e.first_name} ${e.last_name} ?`)) remove.mutate(e.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <EmployeeDialog employee={editing === "new" ? null : editing} departments={departments} positions={positions} onClose={() => setEditing(null)} onSave={upsert} />}
      {viewing && <EmployeeDocumentsDialog employee={viewing} canManage={canManage} onClose={() => setViewing(null)} />}
    </div>
  );
}
function EmployeeDialog({ employee, departments, positions, onClose, onSave }: {
  employee: ErpEmployee | null; departments: { id: string; name: string }[]; positions: { id: string; title: string }[];
  onClose: () => void; onSave: ReturnType<typeof useUpsertErpEmployee>;
}) {
  const [firstName, setFirstName] = useState(employee?.first_name ?? "");
  const [lastName, setLastName] = useState(employee?.last_name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [departmentId, setDepartmentId] = useState(employee?.department_id ?? "");
  const [positionId, setPositionId] = useState(employee?.position_id ?? "");
  const [hireDate, setHireDate] = useState(employee?.hire_date ?? "");
  const [status, setStatus] = useState<ErpEmployeeStatus>(employee?.status ?? "active");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    setError(null);
    try {
      await onSave.mutateAsync({
        id: employee?.id, first_name: firstName.trim(), last_name: lastName.trim(),
        email: email.trim() || null, phone: phone.trim() || null,
        department_id: departmentId || null, position_id: positionId || null,
        hire_date: hireDate || null, status,
      });
      onClose();
    } catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer l'employé."); }
  };

  return (
    <Dialog title={employee ? "Modifier l'employé" : "Nouvel employé"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom *" value={firstName} onChange={setFirstName} />
        <Field label="Nom *" value={lastName} onChange={setLastName} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email" value={email} onChange={setEmail} />
        <Field label="Téléphone" value={phone} onChange={setPhone} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Département" value={departmentId} onChange={setDepartmentId} options={departments} />
        <SelectField label="Poste" value={positionId} onChange={setPositionId} options={positions.map((p) => ({ id: p.id, name: p.title }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Date d'embauche" value={hireDate} onChange={setHireDate} />
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Statut</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ErpEmployeeStatus)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <option value="active">Actif</option><option value="on_leave">En congé</option><option value="terminated">Parti</option>
          </select>
        </label>
      </div>
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={save} disabled={!firstName.trim() || !lastName.trim()} pending={onSave.isPending} />
    </Dialog>
  );
}
function EmployeeDocumentsDialog({ employee, canManage, onClose }: { employee: ErpEmployee; canManage: boolean; onClose: () => void }) {
  const { data: documents = [], isLoading } = useErpEmployeeDocuments(employee.id);
  const addDoc = useUpsertErpEmployeeDocument();
  const removeDoc = useDeleteErpEmployeeDocument();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!name.trim()) return;
    setError(null);
    try { await addDoc.mutateAsync({ employee_id: employee.id, name: name.trim(), document_type: "other" }); setName(""); }
    catch (e: any) { setError(e?.message ?? "Impossible d'ajouter le document."); }
  };

  return (
    <Dialog title={`${employee.first_name} ${employee.last_name} — Documents`} onClose={onClose}>
      <p className="text-xs text-muted-foreground">Note simple pour l'instant (nom du document) — l'upload de fichier rejoindra ce module quand la Gestion documentaire (module 8) sera construite.</p>
      {canManage && (
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label="Nom du document" value={name} onChange={setName} placeholder="Ex : Contrat de travail" /></div>
          <button onClick={add} disabled={!name.trim() || addDoc.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </div>
      )}
      {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /> : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Aucun document pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-muted-foreground" /> {d.name}</span>
              {canManage && <button onClick={() => removeDoc.mutate({ id: d.id, employeeId: employee.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      )}
      <ErrorBanner error={error} />
    </Dialog>
  );
}

// ============ Départements & Postes ============
function StructureTab({ canManage }: { canManage: boolean }) {
  const { data: departments = [] } = useErpDepartments();
  const upsertDept = useUpsertErpDepartment();
  const removeDept = useDeleteErpDepartment();
  const { data: positions = [] } = useErpPositions();
  const upsertPos = useUpsertErpPosition();
  const removePos = useDeleteErpPosition();
  const [deptName, setDeptName] = useState("");
  const [posTitle, setPosTitle] = useState("");
  const [posDept, setPosDept] = useState("");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-semibold">Départements</div>
        {canManage && (
          <div className="mb-3 flex gap-2">
            <input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="Nouveau département…"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <button onClick={() => { if (deptName.trim()) { upsertDept.mutate({ name: deptName.trim() }); setDeptName(""); } }} disabled={!deptName.trim()}
              className="rounded-xl bg-primary px-3 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </div>
        )}
        {departments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Aucun département.</div>
        ) : (
          <div className="divide-y divide-border">
            {departments.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span>{d.name}</span>
                {canManage && <button onClick={() => { if (confirm(`Supprimer "${d.name}" ?`)) removeDept.mutate(d.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-semibold">Postes</div>
        {canManage && (
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div className="flex-1"><input value={posTitle} onChange={(e) => setPosTitle(e.target.value)} placeholder="Nouveau poste…"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></div>
            <select value={posDept} onChange={(e) => setPosDept(e.target.value)} className="rounded-xl border border-border bg-background px-2 py-2 text-sm">
              <option value="">Sans département</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button onClick={() => { if (posTitle.trim()) { upsertPos.mutate({ title: posTitle.trim(), department_id: posDept || null }); setPosTitle(""); } }} disabled={!posTitle.trim()}
              className="rounded-xl bg-primary px-3 py-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </div>
        )}
        {positions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Aucun poste.</div>
        ) : (
          <div className="divide-y divide-border">
            {positions.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span>{p.title}</span>
                {canManage && <button onClick={() => { if (confirm(`Supprimer "${p.title}" ?`)) removePos.mutate(p.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Pointage ============
const ATTENDANCE_STATUS_LABEL: Record<ErpAttendanceStatus, string> = { present: "Présent", absent: "Absent", late: "Retard", half_day: "Demi-journée" };
function AttendanceTab({ canManage }: { canManage: boolean }) {
  const { data: employees = [] } = useErpEmployees();
  const { data: records = [], isLoading } = useErpAttendance();
  const upsert = useUpsertErpAttendance();
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<ErpAttendanceStatus>("present");
  const [error, setError] = useState<string | null>(null);

  const employeeName = (id: string) => { const e = employees.find((x) => x.id === id); return e ? `${e.first_name} ${e.last_name}` : "—"; };

  const record = async () => {
    if (!employeeId || !date) return;
    setError(null);
    try { await upsert.mutateAsync({ employee_id: employeeId, date, status }); }
    catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer le pointage."); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex-1"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Employé</span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">—</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
          </div>
          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Statut</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as ErpAttendanceStatus)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
              {Object.entries(ATTENDANCE_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <button onClick={record} disabled={!employeeId || !date || upsert.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40">
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
      )}
      <ErrorBanner error={error} />
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun pointage pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {records.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span>{employeeName(r.employee_id)} · {r.date}</span>
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", r.status === "present" ? "bg-success/15 text-success" : r.status === "absent" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning")}>
                {ATTENDANCE_STATUS_LABEL[r.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Congés ============
const LEAVE_TYPE_LABEL: Record<ErpLeaveType, string> = { paid: "Payé", unpaid: "Non payé", sick: "Maladie", other: "Autre" };
function LeaveTab({ canManage }: { canManage: boolean }) {
  const { data: leaves = [], isLoading } = useErpLeaveRequests();
  const { data: employees = [] } = useErpEmployees();
  const upsert = useUpsertErpLeaveRequest();
  const review = useReviewErpLeaveRequest();
  const remove = useDeleteErpLeaveRequest();
  const [creating, setCreating] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouvelle demande
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : leaves.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucune demande de congé pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {leaves.map((l) => (
            <LeaveRow key={l.id} leave={l} canManage={canManage} review={review} remove={remove} />
          ))}
        </div>
      )}
      {creating && <LeaveCreateDialog employees={employees} upsert={upsert} onClose={() => setCreating(false)} />}
    </div>
  );
}
function LeaveRow({ leave, canManage, review, remove }: {
  leave: ErpLeaveRequest; canManage: boolean; review: ReturnType<typeof useReviewErpLeaveRequest>; remove: ReturnType<typeof useDeleteErpLeaveRequest>;
}) {
  const STATUS_CLASS: Record<string, string> = { pending: "bg-warning/15 text-warning", approved: "bg-success/15 text-success", rejected: "bg-destructive/15 text-destructive" };
  const STATUS_LABEL: Record<string, string> = { pending: "En attente", approved: "Approuvé", rejected: "Rejeté" };
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <div className="min-w-0">
        <div className="font-medium">{leave.erp_employees ? `${leave.erp_employees.first_name} ${leave.erp_employees.last_name}` : "—"}</div>
        <div className="text-xs text-muted-foreground">{LEAVE_TYPE_LABEL[leave.leave_type]} · {leave.start_date} → {leave.end_date}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_CLASS[leave.status])}>{STATUS_LABEL[leave.status]}</span>
        {canManage && leave.status === "pending" && (
          <>
            <button onClick={() => review.mutate({ id: leave.id, approve: true })} className="text-muted-foreground hover:text-success"><CheckCircle2 className="h-4 w-4" /></button>
            <button onClick={() => review.mutate({ id: leave.id, approve: false })} className="text-muted-foreground hover:text-destructive"><XCircle className="h-4 w-4" /></button>
          </>
        )}
        {canManage && leave.status !== "pending" && (
          <button onClick={() => { if (confirm("Supprimer cette demande ?")) remove.mutate(leave.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
        )}
      </div>
    </div>
  );
}
function LeaveCreateDialog({ employees, upsert, onClose }: { employees: ErpEmployee[]; upsert: ReturnType<typeof useUpsertErpLeaveRequest>; onClose: () => void }) {
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState<ErpLeaveType>("paid");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const valid = employeeId && startDate && endDate && endDate >= startDate;

  const create = async () => {
    if (!valid) return;
    setError(null);
    try { await upsert.mutateAsync({ employee_id: employeeId, leave_type: leaveType, start_date: startDate, end_date: endDate, reason: reason.trim() || undefined }); onClose(); }
    catch (e: any) { setError(e?.message ?? "Impossible de créer la demande."); }
  };

  return (
    <Dialog title="Nouvelle demande de congé" onClose={onClose}>
      <SelectField label="Employé *" value={employeeId} onChange={setEmployeeId} options={employees.map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))} />
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</span>
        <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as ErpLeaveType)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
          {Object.entries(LEAVE_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Début *" value={startDate} onChange={setStartDate} />
        <DateField label="Fin *" value={endDate} onChange={setEndDate} />
      </div>
      <Field label="Motif" value={reason} onChange={setReason} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={create} disabled={!valid} pending={upsert.isPending} />
    </Dialog>
  );
}

// ============ Composants partagés ============
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="font-display text-lg font-bold">{title}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
function DialogFooter({ onClose, onSave, disabled, pending, label = "Enregistrer" }: { onClose: () => void; onSave: () => void; disabled: boolean; pending: boolean; label?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Annuler</button>
      <button onClick={onSave} disabled={disabled || pending} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {label}
      </button>
    </div>
  );
}
function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
    </div>
  );
}
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; name: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
        <option value="">—</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
